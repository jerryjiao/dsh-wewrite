/**
 * wewrite_run 工具（Spec §5 / architecture §4.2）：启动管线并等到终态才 settle。
 * abort 转发：exec.signal → service.cancelRun（D11）；参数非法返回结构化错误不抛异常。
 */

import type { RunRecord } from '../domain';
import type { ToolRunContext, WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
import { asArgsRecord, callView, coerceInteger, errorToCodeMessage, jsonSchema, optionalString, resultView, textBlocks, toolError } from './output-helpers';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

interface RunToolArgs {
  readonly topic: string;
  readonly imageCount: number;
  readonly theme?: string;
  readonly briefTitle?: string;
  readonly briefApproach?: string;
  readonly briefOutline?: string[];
  readonly briefSources?: string[];
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 弱模型宽容转换：JSON 字符串→数组（模型常把 outline/sources 序列化成带转义的字符串）。 */
function coerceStringArray(raw: unknown): unknown {
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // 非合法 JSON 按原值走既有校验报错
      }
    }
  }
  return raw;
}

/** 有界字符串数组解析：trim、丢空串、超限报结构化错误（agent 可自纠）。 */
function parseBoundedStringArray(
  raw: unknown,
  field: string,
  maxItems: number,
  maxItemLen: number,
): { values?: string[]; error?: ReturnType<typeof toolError> } {
  if (raw === undefined) return {};
  if (!Array.isArray(raw)) return { error: toolError(`brief-${field}-invalid`, `${field} 必须是字符串数组`) };
  const values: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return { error: toolError(`brief-${field}-invalid`, `${field} 的每一项必须是字符串`) };
    const trimmed = item.trim();
    if (!trimmed) continue;
    if ([...trimmed].length > maxItemLen) {
      return { error: toolError(`brief-${field}-invalid`, `${field} 单项过长（≤${maxItemLen} 字符）`) };
    }
    values.push(trimmed);
  }
  if (values.length > maxItems) {
    return { error: toolError(`brief-${field}-invalid`, `${field} 最多 ${maxItems} 项（收到 ${values.length}）`) };
  }
  return values.length ? { values } : {};
}

function parseRunArgs(args: unknown): RunToolArgs | { error: ReturnType<typeof toolError> } {
  const raw = asArgsRecord(args);
  const topic = typeof raw.topic === 'string' ? raw.topic.trim() : '';
  if (!topic) return { error: toolError('topic-required', '缺少 topic 参数：请提供要写的文章主题') };
  const rawCount = coerceInteger(raw.image_count ?? 0) ?? (raw.image_count === undefined ? 0 : NaN);
  if (!Number.isInteger(rawCount) || rawCount < 0 || rawCount > 10) {
    return { error: toolError('image-count-invalid', 'image_count 必须是 0-10 的整数（缺省 0，默认零图片成本）') };
  }
  const briefTitle = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : undefined;
  if (briefTitle && [...briefTitle].length > 64) {
    return { error: toolError('brief-title-invalid', 'title 过长（≤64 字，微信标题上限）') };
  }
  const briefApproach = typeof raw.approach === 'string' && raw.approach.trim() ? raw.approach.trim() : undefined;
  if (briefApproach && [...briefApproach].length > 2000) {
    return { error: toolError('brief-approach-invalid', 'approach 过长（≤2000 字）') };
  }
  const outline = parseBoundedStringArray(coerceStringArray(raw.outline), 'outline', 20, 120);
  if (outline.error) return { error: outline.error };
  const sources = parseBoundedStringArray(coerceStringArray(raw.sources), 'sources', 10, 2048);
  if (sources.error) return { error: sources.error };
  const invalidSource = sources.values?.find((url) => !isHttpUrl(url));
  if (invalidSource) {
    return { error: toolError('brief-sources-invalid', `sources 每项必须是 http(s) URL（收到：${invalidSource}）`) };
  }
  return {
    topic,
    imageCount: rawCount,
    theme: optionalString(raw.theme),
    briefTitle,
    briefApproach,
    briefOutline: outline.values,
    briefSources: sources.values,
  };
}

/** RunRecord → canonical value（gatePassed 从 gates 步状态推断；title/digest 内存查文章）。 */
function recordToValue(service: WeWriteService, record: RunRecord | undefined, runId: string): Record<string, unknown> {
  if (!record) return { ok: false, runId, status: 'failed', error: { code: 'run-completion-missing', message: '运行终态不可得（详情见写作台运行历史）' } };
  const ok = record.status === 'succeeded';
  const gatesStep = record.steps.find((step) => step.name === 'gates');
  const article = ok && record.articleId ? lookupArticle(service, record.articleId) : undefined;
  return {
    ok,
    runId,
    status: TERMINAL_STATUSES.has(record.status) ? record.status : 'interrupted',
    ...(record.articleId ? { articleId: record.articleId } : {}),
    ...(article?.title ? { title: article.title } : {}),
    ...(article?.digest ? { digest: article.digest.slice(0, 200) } : {}),
    ...(gatesStep ? { gatePassed: gatesStep.status === 'succeeded' } : {}),
    ...(!ok && record.error ? { error: { code: record.error.code, message: record.error.message } } : {}),
  };
}

function lookupArticle(service: WeWriteService, articleId: string): { title?: string; digest?: string } | undefined {
  try {
    const detail = service.getArticle(articleId);
    return detail ? { title: detail.title, digest: detail.digest } : undefined;
  } catch {
    return undefined;
  }
}

function topicFromArgs(args: unknown): string {
  const topic = asArgsRecord(args).topic;
  return typeof topic === 'string' ? topic : '';
}

export function buildRunTool(service: WeWriteService): WewriteToolDefinition {
  return {
    name: 'wewrite_run',
    description:
      '运行一次 WeWrite 公众号写作管线：选题→大纲→成稿→质量门禁→渲染→配图，全程数分钟，完成后返回文章标识与摘要。'
      + '把用户在对话里给出的标题/总体思路/大纲/参考链接蒸馏进 title/approach/outline/sources 对应参数（分层硬约束：标题与思路照办、大纲节名原样保留、给定来源必须以可见 URL 引用且不得编造其他来源）。'
      + '用户只给一句话主题时不追问、直接运行。仅在用户明确表达写作意图时调用；返回值只进草稿相关流程，本插件不群发。',
    timeoutMs: 600000,
    parameters: {
      topic: { type: 'string', required: true, description: '文章主题（固定选题模式，必填非空）' },
      title: { type: 'string', description: '可选：用户已定的文章标题（硬约束，成稿直接采用，≤64 字）——用户明确给出标题时才传' },
      approach: { type: 'string', description: '可选：总体思路/核心主张（硬约束，全文围绕展开不偏离）——用户表达了写作思路时才传' },
      outline: {
        type: 'array',
        items: { type: 'string' },
        description: '可选：用户给定的大纲节名数组（骨架约束：节名原样保留顺序不变，管线可补节）',
      },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: '可选：用户提供的参考来源 URL 数组（硬约束：正文以可见 URL 文本引用，不得编造未提供的 URL）',
      },
      image_count: { type: 'integer', description: '正文配图数量 0-10，默认 0（默认零图片成本）' },
      theme: { type: 'string', description: '排版主题（可选，缺省用设置页默认主题）' },
    },
    output: {
      schema: jsonSchema(
        {
          ok: { type: 'boolean' },
          runId: { type: 'string' },
          status: { type: 'string' },
          articleId: { type: 'string' },
          title: { type: 'string' },
          digest: { type: 'string' },
          gatePassed: { type: 'boolean' },
          error: { type: 'object' },
        },
        ['ok', 'runId', 'status'],
      ),
      render: (_args, value) => {
        const record = asArgsRecord(value);
        const status = String(record.status ?? 'unknown');
        const lines = [`写作管线 ${status}（runId: ${String(record.runId ?? '')}）`];
        if (record.ok === true) {
          if (record.title) lines.push(`标题：《${String(record.title)}》`);
          if (typeof record.digest === 'string' && record.digest) lines.push(`摘要：${record.digest}`);
          lines.push('全文与门禁报告可在 WeWrite 写作台查看与精修。');
        } else {
          lines.push(describeFailure(record));
        }
        return textBlocks(lines.join('\n'));
      },
      presentationMeta: (args, value) => {
        const record = asArgsRecord(value);
        return {
          ok: record.ok === true,
          runId: String(record.runId ?? ''),
          status: TERMINAL_STATUSES.has(String(record.status)) ? record.status : 'interrupted',
          ...(typeof record.articleId === 'string' && record.articleId ? { articleId: record.articleId } : {}),
          ...(typeof record.title === 'string' && record.title ? { title: record.title } : {}),
          ...(typeof record.digest === 'string' && record.digest ? { digest: record.digest.slice(0, 200) } : {}),
          ...(typeof record.gatePassed === 'boolean' ? { gatePassed: record.gatePassed } : {}),
          ...(record.ok === false && record.error ? { error: record.error } : {}),
          tool: 'wewrite_run',
          topic: topicFromArgs(args),
        };
      },
    },
    async execute(args: unknown, exec: ToolRunContext) {
      const parsed = parseRunArgs(args);
      if ('error' in parsed) {
        // 宿主 createSuccessResult 对 execute 返回值（含错误值）按 output.schema 校验：
        // 缺 required 字段即 ToolOutputError，模型只会看到 "returned invalid output"
        // 而非我们的干净错误信息（08-24 live 实证：失败路径全部炸成 invalid output）
        return { ...parsed.error, runId: '', status: 'failed' };
      }
      const brief = {
        ...(parsed.briefTitle ? { title: parsed.briefTitle } : {}),
        ...(parsed.briefApproach ? { approach: parsed.briefApproach } : {}),
        ...(parsed.briefOutline?.length ? { outline: parsed.briefOutline } : {}),
        ...(parsed.briefSources?.length ? { sources: parsed.briefSources } : {}),
      };
      const { runId } = service.startRun({
        trigger: 'manual',
        params: {
          topicMode: 'fixed',
          topic: parsed.topic,
          imageCount: parsed.imageCount,
          ...(Object.keys(brief).length ? { brief } : {}),
          ...(parsed.theme ? { theme: parsed.theme } : {}),
        },
      });
      // M2 运行卡 callId 兜底链锚点：presentCall 先于 execute 拿不到 runId，前端按
      // args.runId→rawInput.runId→callId 兜底——execute 侧把宿主 callId 绑到 runId（防御可选）。
      const callId = typeof exec?.callId === 'string' && exec.callId ? exec.callId : undefined;
      if (callId) {
        try {
          service.bindRunCall?.(callId, runId);
        } catch {
          // 绑定失败只影响 callId 反查路径；runId 直查不受影响
        }
      }
      const onAbort = () => {
        try {
          service.cancelRun(runId);
        } catch {
          // D11：取消转发失败不放大——runCompletion 仍会在终态 settle
        }
      };
      const signal = exec?.signal;
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const record = await service.runCompletion(runId);
        return recordToValue(service, record, runId);
      } catch (error) {
        const { code, message } = errorToCodeMessage(error, 'run-await-failed');
        return { ...toolError(code, `等待管线终态失败：${message}`), runId, status: 'failed' };
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },
    presentCall: (args) => {
      const raw = asArgsRecord(args);
      const topic = topicFromArgs(args);
      const rawInput: Record<string, unknown> = {};
      if (topic) rawInput.topic = topic;
      if (raw.image_count !== undefined) rawInput.image_count = raw.image_count;
      for (const field of ['title', 'approach', 'outline', 'sources'] as const) {
        if (raw[field] !== undefined) rawInput[field] = raw[field];
      }
      const extras: string[] = [];
      if (typeof raw.title === 'string' && raw.title) extras.push('定标题');
      if (typeof raw.approach === 'string' && raw.approach) extras.push('带思路');
      if (Array.isArray(raw.outline) && raw.outline.length) extras.push(`大纲 ${raw.outline.length} 节`);
      if (Array.isArray(raw.sources) && raw.sources.length) extras.push(`来源 ${raw.sources.length} 条`);
      const suffix = extras.length ? `（${extras.join('·')}）` : '';
      return callView('execute', `正在写《${topic}》${suffix}`, rawInput);
    },
    presentResult: (_args, result) => {
      const meta = asArgsRecord(result.meta);
      if (result.isError || meta.ok === false) {
        return resultView('写作管线失败', textBlocks(describeFailure(meta), '可到 WeWrite 写作台运行历史查看失败步骤与产物。'));
      }
      const title = typeof meta.title === 'string' && meta.title ? meta.title : '未命名';
      const digest = typeof meta.digest === 'string' && meta.digest ? `摘要：${meta.digest}` : '已生成全文。';
      return resultView(`《${title}》成稿`, textBlocks(digest, '可在 WeWrite 写作台打开精修（侧栏入口）。'));
    },
  };
}

function describeFailure(record: Record<string, unknown>): string {
  const error = record.error as { code?: unknown; message?: unknown } | undefined;
  if (error && typeof error.message === 'string' && error.message) {
    return `失败原因：${error.message}`;
  }
  return '失败原因：未知错误（详情见写作台运行历史）。';
}
