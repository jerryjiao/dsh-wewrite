/**
 * 管线文本步的 LLM 访问层（ADR-003：宿主直调 ctx.llm.stream，F22 辅助调用先例）。
 * 2026-08-19 真机校准：宿主 dsh-llm seam 的真实协议是
 * GenerateOptions{provider, model, system, messages[{role, content:[{type:'text',text}]}], purpose}
 * 与 StreamChunk{text-delta | finish(reason.kind)}；旧版按 {type:'text'} 块 + content 传字符串，
 * 在真宿主上产出 0 字空稿（v0.1.4 缺陷），本层按真实协议重写。
 */
export interface LlmStreamOptions {
    /** 辅助调用标注（F22）：wewrite-pipeline。 */
    readonly purpose: string;
    /** 宿主 GenerateOptions.system：系统提示独立字段，不进 messages。 */
    readonly system: string;
    /** 用户轮提示全文（outline/draft 各自组装）。 */
    readonly user: string;
    /** 宿主已注册的供应商路由 id（必填，GenerateOptions.provider）。 */
    readonly provider: string;
    /** 供应商下点名的模型 id（必填，GenerateOptions.model）。 */
    readonly model: string;
    readonly maxTokens?: number;
}
/** 宿主 StreamChunk 的最小依赖面：text-delta 承载增量文本，finish.reason 承载终态。 */
export type PipelineLlmChunk = {
    readonly type: 'text-delta';
    readonly index: number;
    readonly text: string;
} | {
    readonly type: 'finish';
    readonly reason: {
        readonly kind: 'stop' | 'tool-calls' | 'max-tokens' | 'aborted' | 'error';
        readonly failure?: {
            readonly code?: string;
            readonly message: string;
        };
    };
} | {
    readonly type: string;
    readonly [field: string]: unknown;
};
/** 宿主 GenerateOptions 的最小形状依赖（seam 实际读取字段的子集）。 */
export interface PipelineLlm {
    stream(options: Record<string, unknown>): AsyncIterable<PipelineLlmChunk> | Promise<AsyncIterable<PipelineLlmChunk>>;
}
/** 把流式 text-delta 组装为完整文本。 */
export declare class BlockAssembler {
    private readonly parts;
    push(chunk: PipelineLlmChunk): void;
    getText(): string;
}
export type LlmStepOutcome = {
    readonly status: 'ok';
    readonly text: string;
} | {
    readonly status: 'aborted';
} | {
    readonly status: 'error';
    readonly code: string;
    readonly message: string;
};
/** 消费一次 stream 至终端 finish chunk；AbortSignal 中止与供应商错误显式分流。 */
export declare function streamLlmText(llm: PipelineLlm, options: LlmStreamOptions, signal: AbortSignal): Promise<LlmStepOutcome>;
export declare function outlineUserPrompt(topic: string): string;
export declare function draftUserPrompt(topic: string, outline: string): string;
export declare function pipelineSystemPrompt(): string;
