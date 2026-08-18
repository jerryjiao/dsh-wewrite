/**
 * Agent 交互工具（架构 §3：可选交互面，默认关——settings.agentToolsEnabled）。
 * 注册形状对齐参照插件先例（agent.ctx.tools.register({name, description, parameters, execute})）。
 * 装配全程 try/catch：槽位/服务缺失降级 console 警告，不影响宿主（§9.1）。
 */
import type { HostContext } from './platform';
import type { WeWriteService } from './service';
export interface ToolRegistrationOptions {
    readonly enabled: boolean;
}
/** 向根 Agent 作用域安装工具；返回 disposer 列表（入口 apply 统一回收）。 */
export declare function registerWewriteTools(ctx: HostContext, service: WeWriteService, options: ToolRegistrationOptions): Array<() => void>;
