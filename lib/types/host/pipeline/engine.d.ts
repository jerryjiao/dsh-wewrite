/**
 * 管线引擎（架构 §3 / ADR-003）：run 生命周期 + AbortSignal 贯穿 + 六步骤编排。
 * 步骤序列锁定：topic -> outline -> draft -> gates -> render -> images。
 * 未执行步骤 status='pending'（六步始终全列出）；images 是降级步——全失败时该步
 * failed 但 run 仍 succeeded（AC-9 无图推进）；gates 失败则 run failed（AC-4 阻断）。
 */
import type { RunParams } from '../../shared/contract';
import type { RunRecord } from '../domain';
import { type PipelineLlm } from './llm';
export type { LlmStreamOptions, PipelineLlm, PipelineLlmChunk } from './llm';
export declare const PIPELINE_STEP_NAMES: readonly ["topic", "outline", "draft", "gates", "render", "images"];
export type PipelineStepName = (typeof PIPELINE_STEP_NAMES)[number];
export interface RunStore {
    put(run: RunRecord): void;
    get(runId: string): RunRecord | undefined;
    update(runId: string, patch: (run: RunRecord) => RunRecord): void;
    all(): RunRecord[];
}
export interface TopicSource {
    fetch(limit: number): Promise<readonly {
        title: string;
        url: string;
        source: string;
        rank: number;
    }[]>;
}
export interface GatesRunner {
    run(input: {
        markdown: string;
    }): Promise<{
        passed: boolean;
        report: unknown;
    }>;
}
export interface Renderer {
    convert(input: {
        markdown: string;
        theme?: string;
    }): string;
}
export interface ImagesGenerator {
    /** articleId 为 render 步落库的文章 id（供 ImageRecord 溯源与回绑）。 */
    generate(input: {
        count: number;
        articleId?: string;
    }): Promise<{
        coverImageId?: string;
        bodyImageIds: string[];
    }>;
}
export interface PipelineDeps {
    readonly llm: PipelineLlm;
    readonly store: RunStore;
    readonly topicSource?: TopicSource;
    readonly gates: GatesRunner;
    readonly renderer: Renderer;
    readonly images: ImagesGenerator;
    readonly now?: () => Date;
    /** 渲染完成后回调（service 层把成稿落 article 记录）；返回文章 id 供后续回绑。 */
    readonly onProduced?: (output: {
        markdown: string;
        runId: string;
    }) => Promise<string | void>;
    /** images 步完成后回调（封面/正文图回写文章，P0-1：推送核心流绑定链）。 */
    readonly onImagesBound?: (output: {
        readonly articleId: string;
        readonly coverImageId?: string;
        readonly bodyImageIds: readonly string[];
    }) => Promise<void>;
}
export interface StartOptions {
    readonly trigger: 'manual' | 'schedule';
    readonly params: RunParams;
    readonly scheduleId?: string;
    readonly articleId?: string;
    readonly signal?: AbortSignal;
}
export interface PipelineEngine {
    start(opts: StartOptions): Promise<string>;
    /** 立即取 runId，终态 promise 由调用方决定是否等待（RPC run/start 语义）。 */
    begin(opts: StartOptions): {
        runId: string;
        done: Promise<string>;
    };
    cancel(runId: string): boolean;
    /** chat-integration M1：等指定 run 到终态并 resolve RunRecord；未知 runId → undefined（不挂起不抛错）。 */
    awaitDone(runId: string): Promise<RunRecord | undefined>;
    resumeInterrupted(): Promise<number>;
}
export declare class PipelineStepError extends Error {
    readonly code: string;
    readonly details?: unknown | undefined;
    constructor(code: string, message: string, details?: unknown | undefined);
}
/** 修剪 run 历史（Spec §6 runs 约束）：活跃记录全保留，终态记录按完成时间新→旧截取 limit 条。 */
export declare function pruneTerminalRuns(runs: readonly RunRecord[], limit: number): RunRecord[];
export declare function createPipelineEngine(deps: PipelineDeps): PipelineEngine;
