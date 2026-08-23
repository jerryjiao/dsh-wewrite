/**
 * wewrite_rewrite / wewrite_push_draft（Spec §5 / architecture §4.2）。
 * rewrite：透传 service.rewriteText（既有 45s 超时语义保留），返回值携带改写全文
 * ——模型需要看到改写结果才能继续对话。push：执行前先过审批 armed 复查（fail-closed D14②）。
 */

import type { ToolRunContext, WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
import type { PushApprovalHandle } from './push-approval';
import { asArgsRecord, callView, errorToCodeMessage, jsonSchema, optionalString, resultView, textBlocks, toolError } from './output-helpers';

const REWRITE_TEXT_MAX = 8000;
const REWRITE_INSTRUCTION_MAX = 200;
const TITLE_MAX = 200;

interface RewriteArgs {
  readonly text: string;
  readonly instruction: string;
  readonly title?: string;
}

function parseRewriteArgs(args: unknown): RewriteArgs | { error: ReturnType<typeof toolError> } {
  const raw = asArgsRecord(args);
  const text = typeof raw.text === 'string' ? raw.text : '';
  const instruction = typeof raw.instruction === 'string' ? raw.instruction : '';
  if (!text) return { error: toolError('text-required', '缺少 text 参数：请提供要改写的原文（1-8000 字）') };
  if (text.length > REWRITE_TEXT_MAX) return { error: toolError('text-too-long', `text 超长（上限 ${REWRITE_TEXT_MAX} 字）`) };
  if (!instruction) return { error: toolError('instruction-required', '缺少 instruction 参数：请说明改写要求（1-200 字）') };
  if (instruction.length > REWRITE_INSTRUCTION_MAX) return { error: toolError('instruction-too-long', `instruction 超长（上限 ${REWRITE_INSTRUCTION_MAX} 字）`) };
  const title = optionalString(raw.title);
  if (title && title.length > TITLE_MAX) return { error: toolError('title-too-long', `title 超长（上限 ${TITLE_MAX} 字）`) };
  return { text, instruction, title };
}

export function buildRewriteTool(service: WeWriteService): WewriteToolDefinition {
  return {
    name: 'wewrite_rewrite',
    description: 'AI 改写一段文字（保持原意，按 instruction 调整风格），返回改写后全文。适合对文章段落做口语化、缩写、换角度等精修。',
    timeoutMs: 60000,
    parameters: {
      text: { type: 'string', required: true, description: '要改写的原文（1-8000 字）' },
      instruction: { type: 'string', required: true, description: '改写要求（1-200 字，如「更口语一点」）' },
      title: { type: 'string', description: '所属文章标题（可选，帮助模型理解语境）' },
    },
    output: {
      schema: jsonSchema({ ok: { type: 'boolean' }, text: { type: 'string' }, error: { type: 'object' } }, ['ok']),
      render: (_args, value) => {
        const record = asArgsRecord(value);
        if (record.ok === false) {
          const error = record.error as { message?: unknown } | undefined;
          return textBlocks(`AI 改写失败：${typeof error?.message === 'string' ? error.message : '未知错误'}`);
        }
        return textBlocks(String(record.text ?? ''));
      },
      presentationMeta: (args, value) => {
        const record = asArgsRecord(value);
        const ok = record.ok !== false;
        return {
          tool: 'wewrite_rewrite',
          charsIn: typeof asArgsRecord(args).text === 'string' ? String(asArgsRecord(args).text).length : 0,
          charsOut: typeof record.text === 'string' ? record.text.length : 0,
          ok,
          ...(!ok && record.error ? { error: record.error } : {}),
        };
      },
    },
    async execute(args: unknown, _exec: ToolRunContext) {
      const parsed = parseRewriteArgs(args);
      if ('error' in parsed) return parsed.error;
      try {
        const result = await service.rewriteText({
          text: parsed.text,
          instruction: parsed.instruction,
          ...(parsed.title ? { title: parsed.title } : {}),
        });
        return { ok: true, text: String(result.text ?? '') };
      } catch (error) {
        const { code, message } = errorToCodeMessage(error, 'rewrite-failed');
        return toolError(code, message);
      }
    },
    presentCall: () => callView('edit', 'AI 改写选中段落'),
    presentResult: (_args, result) => {
      const meta = asArgsRecord(result.meta);
      if (result.isError || meta.ok === false) {
        const error = meta.error as { message?: unknown } | undefined;
        return resultView('AI 改写失败', textBlocks(typeof error?.message === 'string' ? error.message : '未知错误，请重试。'));
      }
      return resultView(`改写完成（${String(meta.charsIn ?? '?')}→${String(meta.charsOut ?? '?')} 字）`, textBlocks('改写结果已返回对话，可直接继续追问或引用。'));
    },
  };
}

export function buildPushTool(service: WeWriteService, approval: PushApprovalHandle): WewriteToolDefinition {
  return {
    name: 'wewrite_push_draft',
    description:
      '把一篇已渲染的文章推送到微信公众号草稿箱（只进草稿箱，不群发；群发永远由号主在公众平台后台人工执行）。'
      + '调用前会弹出确认面板（含文章标题与门禁结论），未经确认不会发起任何微信 API 调用。article_id 可先用 wewrite_list_articles 查询。',
    timeoutMs: 120000,
    parameters: {
      article_id: { type: 'string', required: true, description: '文章 ID（wewrite_list_articles 可查）' },
    },
    output: {
      schema: jsonSchema(
        { ok: { type: 'boolean' }, mediaId: { type: 'string' }, thumbMediaId: { type: 'string' }, articleId: { type: 'string' }, title: { type: 'string' }, error: { type: 'object' } },
        ['ok'],
      ),
      render: (_args, value) => {
        const record = asArgsRecord(value);
        if (record.ok === false) {
          const error = record.error as { message?: unknown } | undefined;
          return textBlocks(`推送草稿箱失败：${typeof error?.message === 'string' ? error.message : '未知错误'}`);
        }
        return textBlocks(
          `已进微信公众号草稿箱（mediaId: ${String(record.mediaId ?? '')}）。`,
          '请到公众平台后台 → 内容与互动 → 图文素材 查看；群发由号主后台人工执行。',
        );
      },
      presentationMeta: (args, value) => {
        const record = asArgsRecord(value);
        const ok = record.ok !== false;
        const articleId = typeof record.articleId === 'string' && record.articleId ? record.articleId : String(asArgsRecord(args).article_id ?? '');
        return {
          tool: 'wewrite_push_draft',
          articleId,
          title: typeof record.title === 'string' ? record.title : '',
          ok,
          ...(typeof record.mediaId === 'string' && record.mediaId ? { mediaId: record.mediaId } : {}),
          ...(!ok && record.error ? { error: record.error } : {}),
        };
      },
    },
    async execute(args: unknown, _exec: ToolRunContext) {
      const articleId = optionalString(asArgsRecord(args).article_id);
      if (!articleId) return toolError('article-required', '缺少 article_id 参数：请先用 wewrite_list_articles 查询文章 ID');
      if (!approval.isArmed()) {
        return toolError('push-approval-unavailable', '审批通道不可用，已拒绝推送（fail-closed）：请到 WeWrite 写作台手动推送');
      }
      try {
        const result = await service.pushArticleDraft(articleId);
        let title = articleId;
        try {
          title = service.lookupArticleTitle(articleId) || articleId;
        } catch {
          title = articleId;
        }
        return { ok: true, mediaId: result.mediaId, thumbMediaId: result.thumbMediaId, articleId, title };
      } catch (error) {
        const { code, message } = errorToCodeMessage(error, 'push-failed');
        return toolError(code, message);
      }
    },
    presentCall: (args) => callView('execute', `推送草稿箱：${String(asArgsRecord(args).article_id ?? '')}`),
    presentResult: (_args, result) => {
      const meta = asArgsRecord(result.meta);
      if (result.isError || meta.ok === false) {
        const error = meta.error as { code?: unknown; message?: unknown } | undefined;
        const hint = String(error?.code ?? '') === '40164' ? '该 errcode 表示出口 IP 不在公众号白名单，请到写作台跑诊断或配置代理。' : '';
        return resultView('推送草稿箱失败', textBlocks(typeof error?.message === 'string' ? error.message : '未知错误', hint));
      }
      const mediaId = typeof meta.mediaId === 'string' ? meta.mediaId : '';
      const tail = mediaId.length >= 4 ? mediaId.slice(-4) : mediaId;
      return resultView(
        `已进草稿箱（mediaId 尾 4 位：${tail}）`,
        textBlocks('请到公众平台后台 → 内容与互动 → 图文素材 查看；群发由号主后台人工执行。'),
      );
    },
  };
}
