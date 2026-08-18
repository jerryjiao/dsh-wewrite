/**
 * 双端视图模型类型汇总（架构 §3 shared 模块）。
 * schema 与类型的唯一权威在 contract.ts；本文件只做类型面再导出与组装辅助，
 * 供 client 面板与 host service 共用，避免各自散落 infer。
 */
export type { ArticleDetail, ArticleListItem, Capabilities, ConfigView, CredentialsDescriptor, HotspotItem, ImageProviderConfig, LlmOverride, RunParams, RunSummary, ScheduleViewModel, SnapshotResponse, } from './contract';
/** snapshot.capabilities.features 的固定枚举（版本协商面，架构 §9.3）。 */
export declare const CAPABILITY_FEATURES: readonly ["scheduler", "images", "hotspots", "gates", "wechat-draft"];
/** 首拉快照 + 增量订阅的 client 侧视图形状（与 SnapshotResponse 同构）。 */
export interface WorkbenchSnapshot {
    readonly articles: readonly import('./contract').ArticleListItem[];
    readonly runs: readonly import('./contract').RunSummary[];
    readonly schedules: readonly import('./contract').ScheduleViewModel[];
    readonly config: import('./contract').ConfigView;
    readonly serverNow: string;
    readonly capabilities: import('./contract').Capabilities;
}
