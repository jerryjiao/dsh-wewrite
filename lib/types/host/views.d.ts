/**
 * 记录 → 视图映射（contract.ts 视图 schema 的唯一组装点）。
 * 响应面严格对齐 strict schema：不携带 schema 外字段（credentials 描述符剥 source）。
 */
import type { ArticleDetail, ArticleListItem, ConfigView, RunDetail, RunSummary, ScheduleViewModel } from '../shared/contract';
import type { ArticleRecord, RunRecord, ScheduleRecord, SettingsRecord } from './domain';
export declare function articleToListItem(record: ArticleRecord): ArticleListItem;
export declare function articleToDetail(record: ArticleRecord): ArticleDetail;
export declare function runToSummary(record: RunRecord): RunSummary;
/** chat-integration M2：run 详情投影（RunSummary + steps + topic；run/detail RPC 响应形状）。 */
export declare function runToDetail(record: RunRecord): RunDetail;
export declare function scheduleToView(record: ScheduleRecord): ScheduleViewModel;
export declare function buildConfigView(settings: SettingsRecord, credentials: Readonly<Record<string, CredentialDescriptorInput>>): ConfigView;
export interface CredentialDescriptorInput {
    readonly configured: boolean;
    readonly writable: boolean;
}
