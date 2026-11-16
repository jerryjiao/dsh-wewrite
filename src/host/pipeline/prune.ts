/**
 * run 记录修剪（Spec §6 runs 约束）：活跃记录全保留，终态记录按完成时间新→旧截取 limit 条。
 * 独立成文件：纯函数、无依赖，既方便单测，也不占 engine.ts 的行数预算。
 */

import type { RunRecord } from '../domain';

/** 终态集合（修剪与恢复扫描共用）。 */
export const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

export function pruneTerminalRuns(runs: readonly RunRecord[], limit: number): RunRecord[] {
  const active = runs.filter((run) => !TERMINAL_STATUSES.has(run.status));
  const terminal = runs
    .filter((run) => TERMINAL_STATUSES.has(run.status))
    .sort((left, right) => Date.parse(right.finishedAt ?? right.startedAt) - Date.parse(left.finishedAt ?? left.startedAt));
  return [...active, ...terminal.slice(0, Math.max(0, limit))];
}
