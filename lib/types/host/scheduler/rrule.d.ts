/**
 * RRULE 归一化与投影计算（ADR-004，rrule 2.x + Intl 时区）。
 * 语义：BYHOUR 等是墙钟时间——在目标时区的墙钟域里求下一次触发，再换算绝对时刻。
 * BYHOUR 缺省视为 0 点（QA 裁决：WEEKLY/MONTHLY 无 BYHOUR 时投影落在当日 0 点）。
 */
export declare class RruleValidationError extends Error {
    constructor(message: string);
}
/** 大小写归一 + 分段校验（rrule 库不查 BYHOUR=25/COUNT=0，本层补齐）。 */
export declare function normalizeRrule(raw: string): string;
/**
 * 计算下一次触发（绝对时刻 ISO 串）。
 * 非法 timeZone 在此 fail fast（Intl 构造即抛）。
 */
export declare function computeNextRunAt(rruleText: string, timeZone: string, from: Date): string;
