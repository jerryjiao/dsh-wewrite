/**
 * 热榜聚合步（F5 / AC-3）：多源并行抓取、单源失败隔离、合并排序、limit 截断。
 * 移植自源管线 fetch_hotspots.mjs 的聚合语义（凭据/路径硬编码不搬）：
 * 单源失败永不抛出、永不清空其他源结果；失败信息以 sourceId 标记返回供 UI 呈现。
 */
import type { HotspotItem } from '../../../shared/contract';
export interface HotspotSource {
    readonly id: string;
    fetch(): Promise<readonly HotspotItem[]>;
}
export interface HotspotFailure {
    readonly sourceId: string;
    readonly message: string;
}
export interface HotspotAggregate {
    readonly items: readonly HotspotItem[];
    readonly failures: readonly HotspotFailure[];
}
/** 聚合各源条目：按 rank 升序（跨源稳定合并），截断到 limit。 */
export declare function aggregateHotspots(sources: readonly HotspotSource[], limit: number): Promise<HotspotAggregate>;
/** Hacker News 官方索引（Algolia front_page）——Spec §3 明确只消费 HN 官方 API。 */
export declare function createHackerNewsSource(fetchImpl?: typeof fetch): HotspotSource;
/**
 * 用户自备聚合源（DailyHotApi 兼容形态）：URL 来自设置项 hotspotAggregatorUrl。
 * 兼容 [{...}] 与 {data: [{...}]} 两种外壳；条目缺 title 即跳过。
 */
export declare function createAggregatorSource(baseUrl: string, fetchImpl?: typeof fetch): HotspotSource;
/** 按当前设置装配热榜源列表：HN 恒在；聚合源仅在 URL 配置时加入。 */
export declare function buildHotspotSources(options: {
    aggregatorUrl?: string;
    fetchImpl?: typeof fetch;
}): HotspotSource[];
