/**
 * 调度服务（ADR-004，dsh-automation durable occurrence claim 模式）：
 * - createOccurrenceClaimer：同刻恰好一次派发（持久层 + 内存集，串行化竞态）
 * - scanOccurrences：三桶分类（toFire / missed / 未来不动）——misfire 宽限语义（AC-11）
 * - createSchedulerService：宿主内时钟——到期 claim 后派发 run；publishTarget 恒 'draft'
 */
import type { ScheduleRecord } from '../domain';
/** misfire 宽限（QA 契约 §7.2-7 钉定 10 分钟）。 */
export declare const DEFAULT_MISFIRE_GRACE_MS: number;
export declare const DEFAULT_SCHEDULER_TICK_MS: number;
export interface OccurrencePersist {
    load(): Promise<readonly string[]>;
    save(key: string): Promise<void>;
}
export interface OccurrenceClaimer {
    claim(key: string): Promise<boolean>;
}
/** durable claim：构造时载入持久层已 claim 键；claim 串行化（链式 promise），同刻并发恰好一个成功。 */
export declare function createOccurrenceClaimer(persist: OccurrencePersist): OccurrenceClaimer;
export interface OccurrenceScan {
    readonly toFire: readonly string[];
    readonly missed: readonly string[];
}
/** 宽限窗内到期 -> toFire；超窗 -> missed（错过即错过，无云端补偿，AC-11）；未来 -> 两桶都不进。 */
export declare function scanOccurrences(occurrences: readonly string[], now: Date, graceMs: number): OccurrenceScan;
export interface SchedulerDeps {
    readonly loadSchedules: () => Promise<readonly ScheduleRecord[]>;
    readonly saveSchedule: (record: ScheduleRecord) => Promise<void>;
    readonly claim: (key: string) => Promise<boolean>;
    readonly startRun: (schedule: ScheduleRecord, occurrence: string) => Promise<string>;
    readonly now?: () => Date;
}
export interface SchedulerOptions {
    readonly graceMs?: number;
    readonly tickMs?: number;
}
export interface PumpReport {
    readonly fired: number;
    readonly missed: number;
}
export declare function createSchedulerService(deps: SchedulerDeps, options?: SchedulerOptions): {
    pumpOnce: () => Promise<PumpReport | null>;
    start(): void;
    stop(): void;
};
