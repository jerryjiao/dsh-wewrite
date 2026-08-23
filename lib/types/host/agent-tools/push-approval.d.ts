/**
 * 推送审批闸（OD-1 / ADR-014，architecture §4.4）：tools/pre-execute waterfall 监听器，
 * 对 wewrite_push_draft 的调用返回 {kind:'ask'} 触发宿主审批面板；他人调用必须 next() 透传。
 * fail-closed 双层：武装失败（ctx.on 抛错/返回非函数）→ 调用方不注册 push 工具（D14①）；
 * 句柄被回收后 execute 体内 isArmed() 复查拒绝（D14②）——未确认的微信 API 调用构造上不可达。
 */
import type { HostContext } from '../platform';
import type { WeWriteService } from '../service';
export declare const PUSH_TOOL_NAME = "wewrite_push_draft";
/** 审批句柄：stop 交入口统一回收；isArmed 供 push 工具 execute 兜底复查。 */
export interface PushApprovalHandle {
    readonly stop: () => void;
    isArmed(): boolean;
}
export declare function composePushAskReason(service: WeWriteService, args: unknown): string;
/**
 * 武装审批监听器；未武装返回 undefined（由 registerAgentTools 捕获后不注册 push 工具）。
 * 注意：armed 状态是每个句柄独立的——实例回收即失效，不受其他实例遗留影响。
 */
export declare function createPushApproval(ctx: HostContext, service: WeWriteService): PushApprovalHandle | undefined;
/** 公开契约（测试钉死）：返回 disposer；未武装返回 undefined。 */
export declare function armPushApproval(ctx: HostContext, service: WeWriteService): (() => void) | undefined;
