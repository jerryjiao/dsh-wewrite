/**
 * wewrite_run 工具（Spec §5 / architecture §4.2）：启动管线并等到终态才 settle。
 * abort 转发：exec.signal → service.cancelRun（D11）；参数非法返回结构化错误不抛异常。
 */

import type { RunRecord } from '../domain';
import type { ToolRunContext, WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
import { asArgsRecord, callView, errorToCodeMessage, jsonSchema, optionalString, resultView, textBlocks, toolError } from './output-helpers';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

interface RunToolArgs {
  readonly topic: string;
  readonly imageCount: number;
  readonly theme?: string;
}

function parseRunArgs(args: unknown): RunToolArgs | { error: ReturnType<typeof toolError> } {
  const raw = asArgsRecord(args);
  const topic = typeof raw.topic === 'string' ? raw.topic.trim() : '';
  if (!topic) return { error: toolError('topic-required', '缺少 topic 参数：请提供要写的文章主题') };
  const rawCount = raw.image_count ?? 0;
  if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount < 0 || rawCount > 10) {
    return { error: toolError('image-count-invalid', 'image_count 必须是 0-10 的整数（缺省 0，默认零图片成本）') };
  }
  return { topic, imageCount: rawCount, theme: optionalString(raw.theme) };
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
      + '仅在用户明确表达写作意图时调用；返回值只进草稿相关流程，本插件不群发。',
    timeoutMs: 600000,
    parameters: {
      topic: { type: 'string', required: true, description: '文章主题（固定选题模式，必填非空）' },
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
      if ('error' in parsed) return parsed.error;
      const { runId } = service.startRun({
        trigger: 'manual',
        params: {
          topicMode: 'fixed',
          topic: parsed.topic,
          imageCount: parsed.imageCount,
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
        return toolError(code, `等待管线终态失败：${message}`);
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
      return callView('execute', `正在写《${topic}》`, rawInput);
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
