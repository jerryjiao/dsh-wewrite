import { describe, expect, it } from 'vitest';
import { WeWriteService } from '@/host/service';
import { registerAgentTools } from '@/host/agent-tools';
import type { HostContext } from '@/host/platform';
import { MemoryDomain, makeCredentials, makeLlm, silentLogger } from './service-harness';

/**
 * AC-M1-12 单一真源闸门（service 层，真 service + 注入路径——不 mock 注册器内部）：
 * 修的验收缝隙是 settings.agentToolsEnabled（config/get 投影）与插件 config 层 patch 值
 * 两个旋钮不同步。钉定：agentToolsEnabled() = 用户显式设置（agentToolsTouched）优先，
 * 缺省回落 agentToolsConfigDefault（apply 时注入的 patch 值）；config/set 显式写开关
 * → touched + 翻转通知；config/get 投影闸门真值；持久化跨重启保持显式值。
 */

async function makeService(domain: MemoryDomain, agentToolsConfigDefault?: boolean): Promise<WeWriteService> {
  return WeWriteService.open({
    domain,
    credentials: makeCredentials().service,
    llm: makeLlm(),
    logger: silentLogger,
    ...(agentToolsConfigDefault !== undefined ? { agentToolsConfigDefault } : {}),
  });
}

describe('AC-M1-12 单一真源（agentToolsEnabled：显式设置 > 插件 config 默认）', () => {
  it('未显式设置 → 回落插件 config 默认（patch 翻 true 生效；缺省注入为 false）', async () => {
    expect((await makeService(new MemoryDomain(), true)).agentToolsEnabled()).toBe(true);
    expect((await makeService(new MemoryDomain(), false)).agentToolsEnabled()).toBe(false);
    expect((await makeService(new MemoryDomain())).agentToolsEnabled()).toBe(false);
  });

  it('config/set 显式写 agentToolsEnabled → 闸门翻转并通知订阅者（关→开→再关全链）', async () => {
    const service = await makeService(new MemoryDomain(), true);
    const seen: boolean[] = [];
    service.onAgentToolsChanged((enabled) => seen.push(enabled));
    expect(service.agentToolsEnabled()).toBe(true);

    await service.setConfig({ agentToolsEnabled: false });
    expect(service.agentToolsEnabled()).toBe(false);
    expect(seen).toEqual([false]);

    await service.setConfig({ agentToolsEnabled: true });
    expect(service.agentToolsEnabled()).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it('显式值覆盖 config 默认：configDefault=true 但用户显式 false → 闸门 false', async () => {
    const service = await makeService(new MemoryDomain(), true);
    await service.setConfig({ agentToolsEnabled: false });
    expect(service.agentToolsEnabled()).toBe(false);
  });

  it('未涉及开关的 config/set 不打 touched、零通知', async () => {
    const service = await makeService(new MemoryDomain(), true);
    const seen: boolean[] = [];
    service.onAgentToolsChanged((enabled) => seen.push(enabled));
    await service.setConfig({ wechatAuthor: 'Jerry' });
    expect(service.agentToolsEnabled()).toBe(true);
    expect(seen).toEqual([]);
    // 之后回落语义仍在：未 touched → 仍跟随 config 默认
    expect((await makeService(new MemoryDomain(), true)).agentToolsEnabled()).toBe(true);
  });

  it('持久化语义：显式 false 落库后同 domain 二次 open（重启模拟）保持 false，不受 configDefault=true 影响', async () => {
    const domain = new MemoryDomain();
    await (await makeService(domain, true)).setConfig({ agentToolsEnabled: false });
    const reopened = await makeService(domain, true);
    expect(reopened.agentToolsEnabled()).toBe(false);
  });

  it('config/get 投影显示闸门真值（未 touched 时 = config 默认，而非 schema 物化 false）', async () => {
    const service = await makeService(new MemoryDomain(), true);
    expect((await service.getConfig()).settings.agentToolsEnabled).toBe(true);
    await service.setConfig({ agentToolsEnabled: false });
    expect((await service.getConfig()).settings.agentToolsEnabled).toBe(false);
  });

  it('订阅退订：dispose 订阅句柄后翻转不再通知', async () => {
    const service = await makeService(new MemoryDomain(), true);
    const seen: boolean[] = [];
    const unsubscribe = service.onAgentToolsChanged((enabled) => seen.push(enabled));
    unsubscribe();
    await service.setConfig({ agentToolsEnabled: false });
    expect(seen).toEqual([]);
  });

  // ── 杀手（QA 二轮 P0-A）：真 service 装配形态对齐 ──────────────────────────────
  // 盲区教训：fake 用实例属性闭包挂闸门面（无 this 依赖），掩盖了「摘取原型方法成裸函数
  // 调用时 this=undefined → this.agentToolsGate 即炸」的装配缺陷。本例走真 WeWriteService
  // （onAgentToolsChanged 是原型方法）+ registerAgentTools 全链，config/set 翻转驱动回收/重挂。

  it('杀手：真 service 装配 registerAgentTools → config/set 翻 false 回收已注册工具、翻 true 重挂载', async () => {
    const service = await makeService(new MemoryDomain(), true);
    const registered: unknown[] = [];
    let recycled = 0;
    const agent = {
      id: 'agent_real',
      ctx: { tools: { register: (definition: unknown) => { registered.push(definition); return () => { recycled += 1; }; } } },
    };
    const listeners = new Map<string, (...args: unknown[]) => unknown>();
    const ctx: HostContext = {
      agents: { roots: () => [agent] },
      on: (event: string, listener: (...args: unknown[]) => unknown) => {
        listeners.set(event, listener);
        return () => undefined;
      },
    };

    const disposers = registerAgentTools(ctx, service, { enabled: service.agentToolsEnabled() });
    expect(registered, '真 service 闸门=true（config 默认）应挂载 5 工具').toHaveLength(5);
    expect(listeners.has('agent/created')).toBe(true);

    await service.setConfig({ agentToolsEnabled: false });
    expect(service.agentToolsEnabled()).toBe(false);
    expect(recycled, '翻 false 应回收全部已注册工具（stop 全调）').toBe(5);
    listeners.get('agent/created')?.({ agent });
    expect(registered, '翻 false 后 agent/created 不再挂载').toHaveLength(5);

    await service.setConfig({ agentToolsEnabled: true });
    expect(service.agentToolsEnabled()).toBe(true);
    expect(registered, '翻 true 对 roots 重挂载 5 工具').toHaveLength(10);

    for (const dispose of disposers) dispose();
  });

  it('杀手对照：真 service 初值 false（config 默认 false）→ 零挂载，翻 true 后恢复', async () => {
    const service = await makeService(new MemoryDomain(), false);
    const registered: unknown[] = [];
    const agent = {
      id: 'agent_real',
      ctx: { tools: { register: (definition: unknown) => { registered.push(definition); return () => undefined; } } },
    };
    const ctx: HostContext = {
      agents: { roots: () => [agent] },
      on: (_event: string, _listener: (...args: unknown[]) => unknown) => () => undefined,
    };
    const disposers = registerAgentTools(ctx, service, { enabled: service.agentToolsEnabled() });
    expect(registered).toHaveLength(0);

    await service.setConfig({ agentToolsEnabled: true });
    expect(registered, '带订阅面的真 service 初值 false 仍装配骨架，翻 true 热恢复挂载').toHaveLength(5);
    for (const dispose of disposers) dispose();
  });
});
