import { PushToolMetaSchema, RewriteToolMetaSchema, RunToolMetaSchema } from '@/shared/agent-tool-contract';
import type { PushToolMeta, RewriteToolMeta, RunToolMeta } from '@/shared/agent-tool-contract';
import { RunDetailSchema } from '@/shared/contract';
import type { RunDetail } from '@/shared/contract';

/**
 * E2 meta 与 run/detail 的 client 侧消费出口（chat-integration M2）。
 *
 * 契约统一：schema 真源 = src/shared/agent-tool-contract.ts（E2 meta，strict
 * 拒未知字段）+ src/shared/contract.ts 的 run/detail 端点（response
 * RunDetailSchema）。本文件只补 client 侧胶水：meta 的 JSON 字符串容错解析
 * （§5.1）与 safeParse 包装。schema 不符 → 返回 undefined → 调用方走
 * resultView 文本兜底（AC-M2-07）。
 */

export type { PushToolMeta, RewriteToolMeta, RunDetail, RunToolMeta };
export type { StepView as RunDetailStep } from '@/shared/contract';

/** meta 容错读取：tool/result 的 meta 可能是对象或 JSON 字符串（§5.1）。 */
export function parseMeta(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function safeParseRunMeta(raw: unknown): RunToolMeta | undefined {
  const parsed = RunToolMetaSchema.safeParse(parseMeta(raw));
  return parsed.success ? parsed.data : undefined;
}

export function safeParsePushMeta(raw: unknown): PushToolMeta | undefined {
  const parsed = PushToolMetaSchema.safeParse(parseMeta(raw));
  return parsed.success ? parsed.data : undefined;
}

export function safeParseRewriteMeta(raw: unknown): RewriteToolMeta | undefined {
  const parsed = RewriteToolMetaSchema.safeParse(parseMeta(raw));
  return parsed.success ? parsed.data : undefined;
}

// ── run/detail RPC（request {runId} → response RunDetail，AC-M2-01） ──────────

export const RUN_DETAIL_ENDPOINT = 'run/detail';

export function safeParseRunDetail(raw: unknown): RunDetail | undefined {
  const parsed = RunDetailSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
