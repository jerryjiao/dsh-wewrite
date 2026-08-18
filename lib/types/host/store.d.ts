/**
 * domain 存储适配（ADR-005）：global 复合状态 + run 表内存镜像。
 * RunStore 契约是同步读（F16 内存快照语义）——domain 写异步入队（先镜像后落盘，顺序保序）。
 */
import type { ArticleRecord, ImageRecord, RunRecord, ScheduleRecord } from './domain';
import { GlobalStateSchema } from './domain';
import type { RunStore } from './pipeline/engine';
import type { HostLogger, KvTable, StorageDomainHandle } from './platform';
export { GlobalStateSchema };
export type GlobalState = import('./domain').GlobalState;
export declare function initialGlobalState(): GlobalState;
export declare function parseGlobalState(raw: unknown, logger: HostLogger): GlobalState;
/**
 * run 表镜像适配器：同步读（内存）+ 顺序异步落盘。
 * 启动时从 domain 表灌入镜像；写操作先改镜像再排队持久化。
 */
export declare function createDomainRunStore(table: KvTable<RunRecord>, logger: HostLogger): RunStore;
/** 四表句柄一次性取出（open 后复用，close 由调用方在 dispose 里执行）。 */
export interface DomainTables {
    readonly articles: KvTable<ArticleRecord>;
    readonly runs: KvTable<RunRecord>;
    readonly schedules: KvTable<ScheduleRecord>;
    readonly images: KvTable<ImageRecord>;
    readonly domain: StorageDomainHandle;
}
export declare function openTables(domain: StorageDomainHandle): DomainTables;
