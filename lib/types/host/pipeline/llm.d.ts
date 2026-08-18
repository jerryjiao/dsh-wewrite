/**
 * 管线文本步的 LLM 访问层（ADR-003：宿主直调 ctx.llm.stream，F22 辅助调用先例）。
 * BlockAssembler 组装 text chunk；终端 finish chunk 承载 error/aborted 而非异常。
 * 对 ctx.llm 只做最小接口形状依赖（PipelineLlm），宿主类型与业务逻辑解耦。
 */
export interface LlmStreamMessage {
    readonly role: 'system' | 'user' | 'assistant';
    readonly content: string;
}
export interface LlmStreamOptions {
    /** 辅助调用标注（F22）：wewrite-pipeline。 */
    readonly purpose: string;
    readonly messages: readonly LlmStreamMessage[];
    readonly provider?: string;
    readonly model?: string;
}
export type PipelineLlmChunk = {
    readonly type: 'text';
    readonly text: string;
} | {
    readonly type: 'finish';
    readonly error?: {
        readonly code: string;
        readonly message: string;
    };
    readonly aborted?: boolean;
};
export interface PipelineLlm {
    stream(options: LlmStreamOptions): AsyncIterable<PipelineLlmChunk> | Promise<AsyncIterable<PipelineLlmChunk>>;
}
/** 把流式 text chunk 组装为完整文本。 */
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
export declare function buildOutlineMessages(topic: string): LlmStreamMessage[];
export declare function buildDraftMessages(topic: string, outline: string): LlmStreamMessage[];
