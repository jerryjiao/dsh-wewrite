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
    /** 来源门禁（v0.5）：仅在启动 brief 携带 sources 时启用，否则 undefined（门禁不激活）。 */
    readonly sources: {
        readonly passed: boolean;
        readonly issues: readonly string[];
    } | undefined;
    /** 大纲骨架终检（v0.5）：仅在启动 brief 携带 outline 时启用——draft 层改写/遗漏给定节的最后防线。 */
    readonly outlineSkeleton: {
        readonly passed: boolean;
        readonly issues: readonly string[];
    } | undefined;
    readonly issues: readonly string[];
}
export interface RunGatesInput {
    readonly markdown: string;
    readonly imageCount?: number;
    /** 启动 brief 的来源 URL（v0.5 硬绑）：给了即启用来源门禁。 */
    readonly sources?: readonly string[];
    /** 用户提供的原文文本（主题/标题/思路/大纲）——其中出现的 URL 视为已授权，不算编造。 */
    readonly userText?: readonly string[];
    /** 启动 brief 的给定大纲节名（v0.5 骨架绑）：给了即启用骨架终检。 */
    readonly outlineSkeleton?: readonly string[];
}
/** engine draft 自愈判据（v0.5）：给定来源是否已以裸文本可见（供重写触发，语义同 auditSourceVisibility）。 */
export declare function isSourceUrlVisible(markdown: string, url: string): boolean;
/** 门禁判定：任一硬项不过即 passed=false（strict 语义，未过阻断默认推送路径，AC-7）。 */
export declare function runQualityGates(input: RunGatesInput): {
    passed: boolean;
    report: GatesReport;
};
/** engine 装配适配器（GatesRunner 形状；来源/骨架门禁输入透传）。 */
export declare const qualityGatesRunner: GatesRunner;
