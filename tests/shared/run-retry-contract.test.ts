import { describe, expect, it } from 'vitest';
import { RunDetailSchema, RunRetrySchema, RunSummarySchema } from '@/shared/contract';

/**
 * 退避重试的契约面（run 记录 → run 视图 → 客户端）：
 * 界面要显示「第 2/3 次重试」，因此 attempt/maxAttempts/waitMs 必须是正整数而不是字符串；
 * retry 整体可选——不在等待期的 run 不该带这个键，否则界面永远显示「重试中」。
 */

const validRetry = {
  step: 'outline',
  code: 'RATE_LIMIT',
  attempt: 2,
  maxAttempts: 3,
  waitMs: 15_000,
  notBefore: '2026-11-16T08:00:15.000Z',
};

const baseSummary = {
  id: 'run_abc123',
  trigger: 'manual' as const,
  status: 'running' as const,
  startedAt: '2026-11-16T08:00:00.000Z',
};

describe('RunRetrySchema', () => {
  it('接受完整的退避进度', () => {
    expect(RunRetrySchema.safeParse(validRetry).success).toBe(true);
  });

  it('拒绝非正整数的 attempt/waitMs（界面会拿它算文案）', () => {
    expect(RunRetrySchema.safeParse({ ...validRetry, attempt: 0 }).success).toBe(false);
    expect(RunRetrySchema.safeParse({ ...validRetry, attempt: 1.5 }).success).toBe(false);
    expect(RunRetrySchema.safeParse({ ...validRetry, waitMs: -1 }).success).toBe(false);
    expect(RunRetrySchema.safeParse({ ...validRetry, maxAttempts: 0 }).success).toBe(false);
  });

  it('拒绝空字符串与非 ISO 时间的 notBefore', () => {
    expect(RunRetrySchema.safeParse({ ...validRetry, step: '' }).success).toBe(false);
    expect(RunRetrySchema.safeParse({ ...validRetry, code: '' }).success).toBe(false);
    expect(RunRetrySchema.safeParse({ ...validRetry, notBefore: '明天' }).success).toBe(false);
  });

  it('拒绝未知字段（strictObject：契约不接受客户端塞进来的额外字段）', () => {
    expect(RunRetrySchema.safeParse({ ...validRetry, extra: true }).success).toBe(false);
  });
});

describe('RunSummary / RunDetail 的 retry 字段', () => {
  it('缺省合法（不在等待期）', () => {
    expect(RunSummarySchema.safeParse(baseSummary).success).toBe(true);
  });

  it('带合法 retry 合法', () => {
    expect(RunSummarySchema.safeParse({ ...baseSummary, retry: validRetry }).success).toBe(true);
  });

  it('retry 形状非法时整体拒绝（不能让半截数据流到界面）', () => {
    expect(RunSummarySchema.safeParse({ ...baseSummary, retry: { ...validRetry, attempt: 0 } }).success).toBe(false);
  });

  it('RunDetail 同样承载 retry（run/detail 与 run/list 的摘要口径一致）', () => {
    const detail = { ...baseSummary, topic: 'AI 写作管线产品化', steps: [], retry: validRetry };
    expect(RunDetailSchema.safeParse(detail).success).toBe(true);
    expect(RunDetailSchema.safeParse({ ...detail, retry: { ...validRetry, waitMs: '15s' } }).success).toBe(false);
  });
});
