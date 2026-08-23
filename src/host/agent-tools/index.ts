/**
 * Agent 工具面装配（M1，取代旧 src/host/tools.ts——勘误 2：按 rc.7 真契约重写）。
 * 骨架（architecture §4.3 + AC-M1-12 动态闸门）：①武装推送审批（fail-closed：未武装 →
 * push 工具不注册）→ ②roots() 挂载 + agent/created 补挂载（每次读 service.agentToolsEnabled()
 * 单一真源；fake/降级路径回落 options.enabled）→ ③订阅闸门翻转：翻 false 回收已注册工具、
 * 翻 true 对 roots 重挂载。全程 try/catch 降级 warn（D1）。返回 disposer 列表（入口统一回收）。
 */

import type { AgentScope, HostContext, WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
import { createPushApproval } from './push-approval';
import { buildPushTool, buildRewriteTool } from './edit-tools';
import { buildListTool } from './list-tool';
import { buildRunTool } from './run-tool';
import { buildSuggestTopicsTool } from './suggest-topics';

export interface ToolRegistrationOptions {
  readonly enabled: boolean;
}

function warn(message: string): void {
  console.warn(`dsh-wewrite: ${message}`);
}

/** 闸门读取：service.agentToolsEnabled()（单一真源）优先；无该面的 service（fake/旧宿主）回落 options.enabled。 */
function readGate(service: WeWriteService, options: ToolRegistrationOptions): boolean {
  const dynamic = (service as { agentToolsEnabled?: () => boolean }).agentToolsEnabled?.();
  return typeof dynamic === 'boolean' ? dynamic : options.enabled;
}

/** 向根 Agent 作用域安装工具；返回 disposer 列表（入口 apply 统一回收）。 */
export function registerAgentTools(ctx: HostContext, service: WeWriteService, options: ToolRegistrationOptions): Array<() => void> {
  // P0-A（QA 二轮）：onAgentToolsChanged 是真 service 的原型方法——摘取成裸函数会丢 this
  // （this=undefined → 读 this.agentToolsGate 即炸）。探测只 typeof 不摘取调用；订阅必须
  // .call(service, ...)（或方法调用形式）保 this 绑定。fake 的实例属性闭包两态皆兼容。
  const gateFace = service as { onAgentToolsChanged?: (listener: (enabled: boolean) => void) => (() => void) | undefined };
  // 闸门关死且无翻转订阅面（fake/降级）→ 零装配零 disposer（既有语义）；
  // 带订阅面的真 service 即使初值 false 也装配骨架——设置页重开时热恢复。
  if (!readGate(service, options) && typeof gateFace.onAgentToolsChanged !== 'function') return [];
  const disposers: Array<() => void> = [];
  const mountedStops: Array<() => void> = [];

  let pushApproval;
  try {
    pushApproval = createPushApproval(ctx, service);
    if (pushApproval) disposers.push(pushApproval.stop);
    else warn('推送审批未武装：wewrite_push_draft 不注册（fail-closed，推送走写作台手动按钮）');
  } catch (error) {
    pushApproval = undefined;
    warn(`推送审批装配降级：${error instanceof Error ? error.message : String(error)}`);
  }

  const definitions: WewriteToolDefinition[] = [
    buildRunTool(service),
    buildRewriteTool(service),
    buildListTool(service),
    buildSuggestTopicsTool(service),
  ];
  if (pushApproval) definitions.push(buildPushTool(service, pushApproval));

  const mount = (agent: AgentScope): void => {
    if (!readGate(service, options)) return; // AC-M1-12：新建 agent 按当前闸门值
    try {
      for (const definition of definitions) {
        const stop = agent.ctx.tools.register(definition);
        if (typeof stop === 'function') mountedStops.push(stop as () => void);
      }
    } catch (error) {
      warn(`Agent 工具注册降级（agent ${String(agent.id)}）：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  try {
    for (const agent of ctx.agents?.roots?.() ?? []) mount(agent);
    const stopCreated = ctx.on?.(
      'agent/created',
      ((event: unknown) => {
        const agent = (event as { agent?: AgentScope }).agent;
        if (agent) mount(agent);
      }) as (...args: unknown[]) => unknown,
    );
    if (typeof stopCreated === 'function') disposers.push(stopCreated);
  } catch (error) {
    warn(`Agent 工具装配降级：${error instanceof Error ? error.message : String(error)}`);
  }

  // AC-M1-12 热回收：设置页翻转闸门 → false 回收已注册工具（register 的 stop 全调），
  // true 对 roots 重挂载（此后 agent/created 也按新值挂载——mount 内逐次读闸门）。
  try {
    const stopGate = gateFace.onAgentToolsChanged?.call(service, (enabled) => {
      if (enabled) {
        for (const agent of ctx.agents?.roots?.() ?? []) mount(agent);
        return;
      }
      for (const stop of mountedStops.splice(0)) {
        try {
          stop();
        } catch {
          // 宿主回收抛错不放大
        }
      }
    });
    if (typeof stopGate === 'function') disposers.push(stopGate);
  } catch (error) {
    warn(`Agent 工具闸门订阅降级（翻转需重启生效）：${error instanceof Error ? error.message : String(error)}`);
  }

  disposers.push(() => {
    for (const stop of mountedStops.splice(0)) {
      try {
        stop();
      } catch {
        // 幂等回收
      }
    }
  });
  return disposers;
}
