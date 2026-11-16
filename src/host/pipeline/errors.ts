/**
 * 管线步骤错误：code 是给界面和测试看的稳定标识（不对用户翻译），message 是用户能读懂的一句话。
 * 为什么单列文件：engine 与 text 步骤模块都要抛它，放 engine 里会形成循环依赖。
 */
export class PipelineStepError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PipelineStepError';
  }
}

/**
 * 取消哨兵：AbortSignal 与 LLM 流的 aborted 终态都可能触发，用同一个哨兵统一收敛到「取消」。
 * 不用普通 Error 是因为 engine 的 catch 需要把「用户取消」与「步骤失败」彻底分开。
 */
export const PIPELINE_ABORT = Symbol('wewrite-pipeline-abort');
