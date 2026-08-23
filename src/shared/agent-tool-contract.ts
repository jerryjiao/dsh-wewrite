/**
 * Agent 工具面 E2 契约（architecture §2.3）：canonical value 与 presentationMeta 的 zod schema。
 * 硬约束：meta 随 tool/result 事件持久化，Session.append 对 meta 跑 isJsonValue 运行时校验，
 * 非 JSON 在写入点抛错——所以每个 meta 必须 strict 拒未知字段（契约漂移防护）且
 * JSON.stringify→parse 无损 round-trip（勘误 1：E2 是终局投影的唯一持久化载体）。
 * tool 字面量是 E3 deliverables 的识别标记，错值/缺失一律拒。
 */

import { z } from 'zod';

const ToolErrorSchema = z.strictObject({ code: z.string().min(1), message: z.string() });

/** wewrite_run 终态枚举（execute 只在终态 settle；running/queued 等非终态拒）。 */
export const RUN_TOOL_TERMINAL_STATUSES = ['succeeded', 'failed', 'cancelled', 'interrupted'] as const;

/** wewrite_run 的 canonical value（execute 返回，过 output.schema 校验）。 */
export const RunToolValueSchema = z.strictObject({
  ok: z.boolean(),
  runId: z.string().min(1),
  status: z.enum(RUN_TOOL_TERMINAL_STATUSES),
  articleId: z.string().optional(),
  title: z.string().optional(),
  digest: z.string().max(200).optional(),
  gatePassed: z.boolean().optional(),
  error: ToolErrorSchema.optional(),
});
export type RunToolValue = z.infer<typeof RunToolValueSchema>;

/** E2 meta：value 超集 + E3 识别标记 + presentCall 侧入参快照。 */
export const RunToolMetaSchema = z.strictObject({
  ok: z.boolean(),
  runId: z.string().min(1),
  status: z.enum(RUN_TOOL_TERMINAL_STATUSES),
  articleId: z.string().optional(),
  title: z.string().optional(),
  digest: z.string().max(200).optional(),
  gatePassed: z.boolean().optional(),
  error: ToolErrorSchema.optional(),
  tool: z.literal('wewrite_run'),
  topic: z.string(),
});
export type RunToolMeta = z.infer<typeof RunToolMetaSchema>;

export const PushToolMetaSchema = z.strictObject({
  tool: z.literal('wewrite_push_draft'),
  articleId: z.string().min(1),
  title: z.string(),
  ok: z.boolean(),
  mediaId: z.string().optional(),
  error: ToolErrorSchema.optional(),
});
export type PushToolMeta = z.infer<typeof PushToolMetaSchema>;

export const RewriteToolMetaSchema = z.strictObject({
  tool: z.literal('wewrite_rewrite'),
  charsIn: z.number().int().min(0),
  charsOut: z.number().int().min(0),
  ok: z.boolean(),
  error: ToolErrorSchema.optional(),
});
export type RewriteToolMeta = z.infer<typeof RewriteToolMetaSchema>;

/** 热榜选题候选条目（Spec §5 第 5 工具）：来源 + 标题 + AI 速览，多余键拒（不泄漏 url）。 */
export const SuggestTopicItemSchema = z.strictObject({
  title: z.string().min(1),
  source: z.string().min(1),
  digest: z.string().min(1),
});
export type SuggestTopicItem = z.infer<typeof SuggestTopicItemSchema>;

export const SuggestTopicsMetaSchema = z.strictObject({
  tool: z.literal('wewrite_suggest_topics'),
  topics: z.array(SuggestTopicItemSchema),
});
export type SuggestTopicsMeta = z.infer<typeof SuggestTopicsMetaSchema>;
