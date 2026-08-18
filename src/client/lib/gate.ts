import type { ArticleListItem, RunSummary } from '@/shared/contract';

/**
 * 门禁展示口径（client 侧，真实契约数据推导）。
 *
 * 契约事实（src/shared/contract.ts）：ArticleListItem 无 gateScore 字段、
 * RunSummary 无 steps——门禁状态从 runs 数据推导：
 *   最近一次 run（优先 article.lastRunId，其次 run.articleId 匹配，按 startedAt 取新）
 *   · succeeded → 已过（绿）
 *   · failed 且 error.code==='gate-failed' → 门禁未过（红，AC-7 阻断推送）
 *   · failed（其他 code）→ 失败（红）
 *   · queued/running → 生成中
 *   · cancelled/interrupted/无 run → —（不阻断）
 * 分数型报告（xx/100）待契约扩展 runs 明细后接入（见回传 verdict advisory）。
 */

export type GateVerdict = 'passed' | 'gate-failed' | 'failed' | 'running' | 'unknown';

export interface GateStatus {
  verdict: GateVerdict;
  label: string;
  /** 是否阻断默认推送路径（AC-7：仅 failed/gate-failed 阻断）。 */
  blocking: boolean;
}

export function latestRunForArticle(runs: readonly RunSummary[], articleId: string, lastRunId?: string): RunSummary | undefined {
  if (lastRunId) {
    const byId = runs.find((run) => run.id === lastRunId);
    if (byId) return byId;
  }
  return runs
    .filter((run) => run.articleId === articleId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

export function gateStatusForArticle(runs: readonly RunSummary[], article: Pick<ArticleListItem, 'id'> & { lastRunId?: string }): GateStatus {
  const run = latestRunForArticle(runs, article.id, article.lastRunId);
  if (!run) return { verdict: 'unknown', label: '—', blocking: false };
  if (run.status === 'succeeded') return { verdict: 'passed', label: '已过', blocking: false };
  if (run.status === 'failed') {
    if (run.error?.code === 'gate-failed') return { verdict: 'gate-failed', label: '门禁未过', blocking: true };
    return { verdict: 'failed', label: '失败', blocking: true };
  }
  if (run.status === 'running' || run.status === 'queued') return { verdict: 'running', label: '生成中', blocking: false };
  return { verdict: 'unknown', label: '—', blocking: false };
}
