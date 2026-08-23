/**
 * Agent 工具面装配（M1，取代旧 src/host/tools.ts——勘误 2：按 rc.7 真契约重写）。
 * 骨架（architecture §4.3 + AC-M1-12 动态闸门）：①武装推送审批（fail-closed：未武装 →
 * push 工具不注册）→ ②roots() 挂载 + agent/created 补挂载（每次读 service.agentToolsEnabled()
 * 单一真源；fake/降级路径回落 options.enabled）→ ③订阅闸门翻转：翻 false 回收已注册工具、
 * 翻 true 对 roots 重挂载。全程 try/catch 降级 warn（D1）。返回 disposer 列表（入口统一回收）。
 */
import type { HostContext } from '../platform';
import type { WeWriteService } from '../service';
export interface ToolRegistrationOptions {
    readonly enabled: boolean;
}
/** 向根 Agent 作用域安装工具；返回 disposer 列表（入口 apply 统一回收）。 */
export declare function registerAgentTools(ctx: HostContext, service: WeWriteService, options: ToolRegistrationOptions): Array<() => void>;
