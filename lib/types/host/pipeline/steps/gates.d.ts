/**
 * 质量门禁步（F6）：strict 门禁 + 编号配图一致性。
 * 移植自源管线 quality_validate.mjs --strict 与 validate_numbering.mjs 的判定内核：
 * 禁用词、内部标记、句长方差、信息密度、有序列表编号连续性、配图编号一致。
 * 语义取逻辑（判定阈值同源），CLI/报告排版不搬。
 */
import type { GatesRunner } from '../engine';
export interface GatesReport {
    readonly strict: true;
    readonly bannedWords: readonly {
        readonly pattern: string;
        readonly count: number;
    }[];
    readonly internalMarkers: number;
    readonly sentenceCount: number;
    readonly sentenceVariance: number;
    readonly infoDensityPer500: number;
    readonly codeBlocks: number;
    readonly numbering: {
        readonly passed: boolean;
        readonly issues: readonly string[];
    };
    readonly figureNumbering: {
        readonly passed: boolean;
        readonly issues: readonly string[];
    };
    readonly issues: readonly string[];
}
export interface RunGatesInput {
    readonly markdown: string;
    readonly imageCount?: number;
}
/** 门禁判定：任一硬项不过即 passed=false（strict 语义，未过阻断默认推送路径，AC-7）。 */
export declare function runQualityGates(input: RunGatesInput): {
    passed: boolean;
    report: GatesReport;
};
/** engine 装配适配器（GatesRunner 形状）。 */
export declare const qualityGatesRunner: GatesRunner;
