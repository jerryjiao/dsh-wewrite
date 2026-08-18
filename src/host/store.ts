/**
 * domain 存储适配（ADR-005）：global 复合状态 + run 表内存镜像。
 * RunStore 契约是同步读（F16 内存快照语义）——domain 写异步入队（先镜像后落盘，顺序保序）。
 */

import type { ArticleRecord, ImageRecord, RunRecord, ScheduleRecord } from './domain';
import { GlobalStateSchema } from './domain';
import type { RunStore } from './pipeline/engine';
import type { HostLogger, KvTable, StorageDomainHandle } from './platform';
import { typedTable } from './platform';

export { GlobalStateSchema };
export type GlobalState = import('./domain').GlobalState;

export function initialGlobalState(): GlobalState {
  return GlobalStateSchema.parse({ v: 1, settings: {}, claimedOccurrences: [] });
}

export function parseGlobalState(raw: unknown, logger: HostLogger): GlobalState {
  if (raw === undefined || raw === null) return initialGlobalState(); // 冷启动（首次安装）
  const parsed = GlobalStateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  logger.warn(`全局状态解析失败，回落默认（记录级 v 字段演进闸门生效）：${parsed.error.issues[0]?.message ?? ''}`);
  return initialGlobalState();
}

/**
 * run 表镜像适配器：同步读（内存）+ 顺序异步落盘。
 * 启动时从 domain 表灌入镜像；写操作先改镜像再排队持久化。
 */
export function createDomainRunStore(table: KvTable<RunRecord>, logger: HostLogger): RunStore {
  const mirror = new Map<string, RunRecord>();
  for (const [key, value] of table.entries()) mirror.set(key, value);
  let tail: Promise<unknown> = Promise.resolve();
  const flush = (key: string, value: RunRecord): void => {
    tail = tail
      .then(() => table.put(key, value))
      .catch((error) => logger.warn(`run 记录落盘失败（${key}）：${error instanceof Error ? error.message : String(error)}`));
  };
  return {
    put(run: RunRecord): void {
      mirror.set(run.id, run);
      flush(run.id, run);
    },
    get(runId: string): RunRecord | undefined {
      return mirror.get(runId);
    },
    update(runId: string, patch: (run: RunRecord) => RunRecord): void {
      const current = mirror.get(runId);
      if (!current) return;
      const next = patch(current);
      mirror.set(runId, next);
      flush(runId, next);
    },
    all(): RunRecord[] {
      return [...mirror.values()];
    },
  };
}

/** 四表句柄一次性取出（open 后复用，close 由调用方在 dispose 里执行）。 */
export interface DomainTables {
  readonly articles: KvTable<ArticleRecord>;
  readonly runs: KvTable<RunRecord>;
  readonly schedules: KvTable<ScheduleRecord>;
  readonly images: KvTable<ImageRecord>;
  readonly domain: StorageDomainHandle;
}

export function openTables(domain: StorageDomainHandle): DomainTables {
  return {
    articles: typedTable<ArticleRecord>(domain, 'articles'),
    runs: typedTable<RunRecord>(domain, 'runs'),
    schedules: typedTable<ScheduleRecord>(domain, 'schedules'),
    images: typedTable<ImageRecord>(domain, 'images'),
    domain,
  };
}
