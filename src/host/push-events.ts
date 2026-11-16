/**
 * 推送留痕（v0.5.6 转化度量）：每次「推草稿箱」尝试落一条记录，成功与失败都记。
 *
 * 为什么必须落库：改造前推送失败只弹一条 toast，关掉就无痕——用户没法复盘
 * 「上次为什么没进去」，我们也没法算「出稿 → 首次进草稿箱」的转化率。
 * 记录按发生时刻倒序取用；表超限时按最旧优先淘汰（有界，不影响存储体积）。
 */

import { randomUUID } from 'node:crypto';
import type { PushEvent, PushFailure } from '../shared/contract';
import { PushEventSchema } from '../shared/contract';
import type { PushEventRecord } from './domain';
import type { KvTable } from './platform';

/** 留痕上限：按 200 条封顶（≈ 每天推 3 次可回溯两个月，够用且不撑存储）。 */
export const PUSH_EVENT_HISTORY_LIMIT = 200;

export interface PushEventDeps {
  readonly table: KvTable<PushEventRecord>;
  readonly now: () => Date;
}

export interface PushEventInput {
  readonly articleId: string;
  readonly articleTitle: string;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly message: string;
  readonly reason?: PushFailure['reason'];
  readonly errcode?: number;
  readonly classification?: PushFailure['classification'];
  readonly mediaId?: string;
}

export function toPushEventView(record: PushEventRecord): PushEvent {
  return PushEventSchema.parse({
    id: record.id,
    articleId: record.articleId,
    articleTitle: record.articleTitle,
    occurredAt: record.occurredAt,
    durationMs: record.durationMs,
    ok: record.ok,
    message: record.message,
    ...(record.reason ? { reason: record.reason } : {}),
    ...(typeof record.errcode === 'number' ? { errcode: record.errcode } : {}),
    ...(record.classification ? { classification: record.classification } : {}),
    ...(record.mediaId ? { mediaId: record.mediaId } : {}),
  });
}

/** 记录一次推送尝试；返回落库后的视图对象。超过上限时淘汰最旧记录。 */
export async function recordPushEvent(deps: PushEventDeps, input: PushEventInput): Promise<PushEvent> {
  const record: PushEventRecord = {
    v: 1,
    id: `push_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    articleId: input.articleId,
    articleTitle: input.articleTitle,
    occurredAt: deps.now().toISOString(),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    ok: input.ok,
    message: input.message,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(typeof input.errcode === 'number' ? { errcode: input.errcode } : {}),
    ...(input.classification ? { classification: input.classification } : {}),
    ...(input.mediaId ? { mediaId: input.mediaId } : {}),
  };
  await deps.table.put(record.id, record);
  await prunePushEvents(deps, PUSH_EVENT_HISTORY_LIMIT);
  return toPushEventView(record);
}

/** 按发生时刻倒序取留痕（可选按文章过滤），limit 缺省 20、上限 50。 */
export function listPushEvents(deps: { readonly table: KvTable<PushEventRecord> }, query: { limit?: number; articleId?: string } = {}): PushEvent[] {
  const limit = Math.min(50, Math.max(1, query.limit ?? 20));
  const all = [...deps.table.entries()]
    .map(([, record]) => record)
    .filter((record) => (query.articleId ? record.articleId === query.articleId : true))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return all.slice(0, limit).map(toPushEventView);
}

/** 只保留最近 keep 条（按 occurredAt 倒序）。 */
export async function prunePushEvents(deps: PushEventDeps, keep: number): Promise<void> {
  const records = [...deps.table.entries()].map(([id, record]) => ({ id, at: record.occurredAt }));
  if (records.length <= keep) return;
  records.sort((left, right) => right.at.localeCompare(left.at));
  for (const stale of records.slice(keep)) await deps.table.delete(stale.id);
}
