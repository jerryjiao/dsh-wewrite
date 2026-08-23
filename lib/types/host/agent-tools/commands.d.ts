/**
 * /wewrite slash 命令（M3 / AC-M3-01，architecture §3）：host ctx.commands 注册，
 * handler 不进模型（S9：command/run 是 known 事件，未注册 commandview 也有通用卡兜底）。
 * handler 解析 invocation.rawInput → startRun（等效调用 wewrite_run 工具的启动语义）；
 * recordInput: true——输入记录进会话（回放可见）。注册失败 try/catch 降级（D8）。
 *
 * 宿主契约（dsh-commands normalizeDefinition/normalizeResult，rc.7 实测三处硬校验）：
 * ① input 只认 `{hint: 非空 string}`——name/placeholder 等其他字段注册即 TypeError
 *    （QA 三轮实锤：`input hint must be a string`）；
 * ② handler 返回必须是 CommandResult：{kind:'success', text?, sourceEventSeq?}
 *    或 {kind:'error', text(非空)}——自由形状对象提交期 TypeError；
 * ③ handler 入参是 CommandInvocation（rawInput 为命令名后的原文，不是裸字符串）。
 */
import type { HostContext } from '../platform';
import type { WeWriteService } from '../service';
/** 宿主 CommandResult 的最小结构面（窄面刻意，真源在 @deepseek-ai/dsh-commands）。 */
export interface WewriteCommandResult {
    readonly kind: 'success' | 'error';
    readonly text: string;
}
export declare function registerWewriteCommand(ctx: HostContext, service: WeWriteService): (() => void) | undefined;
