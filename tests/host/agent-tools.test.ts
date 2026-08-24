import { describe, expect, it, vi } from 'vitest';
import type { HostContext } from '@/host/platform';
import type { WeWriteService } from '@/host/service';
import type { RunRecord } from '@/host/domain';
import {
  PushToolMetaSchema,
  RewriteToolMetaSchema,
  RunToolMetaSchema,
  RunToolValueSchema,
  SuggestTopicsMetaSchema,
} from '@/shared/agent-tool-contract';
import { registerAgentTools } from '@/host/agent-tools';
import { armPushApproval } from '@/host/agent-tools/push-approval';

/**
 * Agent 工具面测试（chat-integration M1/M3，测试先行——模块按 architecture §3/§4 实现）。
 *
 * 契约真源：Spec §5 工具面 5 个 + §9 EARS（AC-M1-01~12 / AC-M3-04）+ architecture §4（工具规格）、
 * §4.4（OD-1 推送审批 fail-closed）、§6 降级矩阵（D1/D11/D14）。
 * 本文件钉定的公共 API（dev 按此实现）：
 * - `registerAgentTools(ctx, service, {enabled}): Array<() => void>`
 *   （取代旧 registerWewriteTools；保留 roots()+agent/created 双挂载与 try/catch 降级骨架）
 * - `armPushApproval(ctx, service): (() => void) | undefined`
 *   （tools/pre-execute waterfall 审批闸；未武装返回 undefined/抛错由 registerAgentTools 捕获）
 * 假 service 为 WeWriteService 的结构子集（platform.ts「窄面刻意」纪律），经 unknown 收窄。
 */

// ── 假件 ─────────────────────────────────────────────────────────────────────

const STEP_NAMES = ['topic', 'outline', 'draft', 'gates', 'render', 'images'] as const;

function makeRunRecord(partial: Partial<RunRecord> & { id: string }): RunRecord {
  return {
    v: 1,
    trigger: 'manual',
    paramsSnapshot: { topicMode: 'fixed', topic: 'AI 写作管线', imageCount: 0 },
    status: 'succeeded',
    steps: STEP_NAMES.map((name) => ({ name, status: 'succeeded', startedAt: '2026-08-20T04:00:01.000Z', finishedAt: '2026-08-20T04:00:02.000Z' })),
    startedAt: '2026-08-20T04:00:00.000Z',
    finishedAt: '2026-08-20T04:05:00.000Z',
    ...partial,
  } as RunRecord;
}

interface FakeServiceOverrides {
  runCompletion?: (runId: string) => Promise<RunRecord | undefined>;
  rewriteText?: (input: { text: string; instruction: string; title?: string }) => Promise<{ text: string }>;
  pushArticleDraft?: (articleId: string) => Promise<{ mediaId: string; thumbMediaId: string }>;
  listArticles?: () => unknown[];
  fetchHotspots?: (limit?: number) => Promise<unknown[]>;
  digestHotspotItem?: (item: unknown) => Promise<unknown>;
  lookupArticleTitle?: (args: unknown) => string;
  bindRunCall?: (callId: string, runId: string) => void;
}

function makeFakeService(overrides: FakeServiceOverrides = {}) {
  const service = {
    startRun: vi.fn((): { runId: string } => ({ runId: 'run_tool_1' })),
    // 注：override 接线与其他字段同款（终态 gate 测试依赖注入挂起 promise）——修复前此字段漏接 overrides
    runCompletion:
      overrides.runCompletion ??
      (vi.fn(async (runId: string): Promise<RunRecord | undefined> => makeRunRecord({ id: runId, status: 'succeeded' })) as unknown as FakeServiceOverrides['runCompletion']),
    cancelRun: vi.fn((): { ok: boolean } => ({ ok: true })),
    rewriteText:
      overrides.rewriteText ??
      (vi.fn(async (input: { text: string }) => ({ text: `改写后：${input.text}` })) as unknown as FakeServiceOverrides['rewriteText']),
    pushArticleDraft:
      overrides.pushArticleDraft ??
      (vi.fn(async (): Promise<{ mediaId: string; thumbMediaId: string }> => ({ mediaId: 'MEDIA_ab12cd', thumbMediaId: 'THUMB_1' })) as unknown as FakeServiceOverrides['pushArticleDraft']),
    listArticles:
      overrides.listArticles ??
      (vi.fn(() =>
        Array.from({ length: 12 }, (_, index) => ({
          id: `art_${index + 1}`,
          slug: `article-${index + 1}`,
          title: `第 ${index + 1} 篇文章`,
          digest: '摘要',
          status: index % 2 === 0 ? 'editing' : 'pushed',
          updatedAt: '2026-08-18T00:00:00.000Z',
        })),
      ) as unknown as FakeServiceOverrides['listArticles']),
    fetchHotspots:
      overrides.fetchHotspots ??
      (vi.fn(async () =>
        Array.from({ length: 5 }, (_, index) => ({
          title: `热榜话题 ${index + 1}`,
          source: 'hackernews',
          rank: index + 1,
          url: `https://x.example.test/${index + 1}`,
        })),
      ) as unknown as FakeServiceOverrides['fetchHotspots']),
    digestHotspotItem:
      overrides.digestHotspotItem ??
      (vi.fn(async () => ({ digest: '这条在讲什么：一句话速览。', source: 'article', model: 'glm-4.5-flash', generatedAtIso: '2026-08-20T12:00:00.000Z' })) as unknown as FakeServiceOverrides['digestHotspotItem']),
    lookupArticleTitle: overrides.lookupArticleTitle ?? (vi.fn(() => 'Cloudflare Workers 冷启动实测') as unknown as FakeServiceOverrides['lookupArticleTitle']),
    bindRunCall: overrides.bindRunCall ?? (vi.fn() as unknown as FakeServiceOverrides['bindRunCall']),
  };
  return service;
}

type FakeService = ReturnType<typeof makeFakeService>;

interface AgentHarness {
  readonly agent: { readonly id: string; readonly ctx: { readonly tools: { register(definition: unknown): unknown } } };
  readonly registered: unknown[];
  readonly register: ReturnType<typeof vi.fn>;
  /** 按名字取已注册的工具定义（同名单定义唯一）。 */
  tool(name: string): Record<string, unknown>;
}

function makeAgent(id = 'agent_1', registerImpl?: (definition: unknown) => unknown): AgentHarness {
  const registered: unknown[] = [];
  const register = vi.fn((definition: unknown) => {
    if (registerImpl) return registerImpl(definition);
    registered.push(definition);
    return vi.fn();
  });
  return {
    agent: { id, ctx: { tools: { register } } },
    registered,
    register,
    tool(name: string) {
      const found = registered.find((d) => (d as { name?: string }).name === name);
      if (!found) throw new Error(`工具 ${name} 未注册`);
      return found as Record<string, unknown>;
    },
  };
}

type EventListener = (...args: unknown[]) => unknown;

function makeCtx(options: { agents?: AgentHarness[]; onThrow?: boolean; onReturnNonFunction?: boolean } = {}) {
  const listeners = new Map<string, EventListener>();
  const disposers: Array<() => void> = [];
  const on = vi.fn((event: string, listener: EventListener) => {
    if (options.onThrow) throw new Error('ctx.on 不可用（宿主 seam 缺失）');
    listeners.set(event, listener);
    if (options.onReturnNonFunction) return undefined;
    const stop = vi.fn();
    disposers.push(stop);
    return stop;
  });
  const ctx: HostContext = {
    agents: options.agents ? { roots: () => options.agents!.map((h) => h.agent) } : undefined,
    on,
  };
  return { ctx, listeners, disposers, on };
}

/** 完整装配（armed 审批 + 5 工具）后的公共取件口：agent 侧捕获到的工具定义。 */
function setup(options: { service?: FakeService; ctxOptions?: Parameters<typeof makeCtx>[0] } = {}) {
  const service = options.service ?? makeFakeService();
  const agent = makeAgent();
  const harness = makeCtx({ agents: [agent], ...options.ctxOptions });
  const disposers = registerAgentTools(harness.ctx, service as unknown as WeWriteService, { enabled: true });
  return { service, agent, harness, disposers };
}

function asToolError(value: unknown): { ok?: boolean; error?: { code?: string; message?: string } } {
  return value as { ok?: boolean; error?: { code?: string; message?: string } };
}

const execWith = (signal: AbortSignal) => ({ signal });

// ── 注册面（AC-M1-01 / AC-M1-02 / AC-M1-12）──────────────────────────────────

describe('注册面（AC-M1-01 工具可见 / AC-M1-02 降级 / AC-M1-12 开关）', () => {
  it('AC-M1-01: 装配后向既有 agent 注册全部 5 个工具（含 Spec §5 增补的 wewrite_suggest_topics）', () => {
    const { agent } = setup();
    const names = agent.registered.map((d) => (d as { name: string }).name).sort();
    expect(names).toEqual(['wewrite_list_articles', 'wewrite_push_draft', 'wewrite_rewrite', 'wewrite_run', 'wewrite_suggest_topics']);
  });

  it('AC-M1-01: 后续新建 agent（agent/created）同样挂载全部 5 个工具', () => {
    const { harness } = setup();
    const created = harness.listeners.get('agent/created');
    expect(created, '应订阅 agent/created').toBeTypeOf('function');
    const lateAgent = makeAgent('agent_late');
    created?.({ agent: lateAgent.agent });
    const names = lateAgent.registered.map((d) => (d as { name: string }).name).sort();
    expect(names).toEqual(['wewrite_list_articles', 'wewrite_push_draft', 'wewrite_rewrite', 'wewrite_run', 'wewrite_suggest_topics']);
  });

  it('AC-M1-02/D1: ctx.agents 缺失 → 不抛错（warn 降级），无工具注册', () => {
    const harness = makeCtx({ agents: undefined });
    expect(() => registerAgentTools(harness.ctx, makeFakeService() as unknown as WeWriteService, { enabled: true })).not.toThrow();
  });

  it('AC-M1-02/D1: 单 agent 的 tools.register 抛错 → 降级不外抛，其余 agent 不受影响', () => {
    const boom = makeAgent('agent_boom', () => {
      throw new Error('宿主 tools seam 不可用');
    });
    const healthy = makeAgent('agent_ok');
    const harness = makeCtx({ agents: [boom, healthy] });
    expect(() => registerAgentTools(harness.ctx, makeFakeService() as unknown as WeWriteService, { enabled: true })).not.toThrow();
    expect(healthy.registered.length).toBe(5);
  });

  it('AC-M1-12: enabled=false → 零注册（用户总开关关闭语义）', () => {
    const agent = makeAgent();
    const harness = makeCtx({ agents: [agent] });
    const disposers = registerAgentTools(harness.ctx, makeFakeService() as unknown as WeWriteService, { enabled: false });
    expect(agent.register).toHaveBeenCalledTimes(0);
    expect(disposers).toEqual([]);
  });

  it('AC-M1-12: 返回的 disposers 全量回收（工具 stop + 事件订阅 stop）', () => {
    const { agent, harness, disposers } = setup();
    expect(agent.register).toHaveBeenCalledTimes(5);
    expect(harness.on).toHaveBeenCalledWith('agent/created', expect.any(Function));
    expect(disposers.length).toBeGreaterThan(0);
    for (const dispose of disposers) dispose();
  });
});

// ── AC-M1-12 动态闸门（设置页开关=真闸门：service.agentToolsEnabled 单一真源 + 热回收）──

describe('AC-M1-12 动态闸门（翻转→回收/恢复，fake 走 service 闸门注入路径）', () => {
  /** fake service 挂动态闸门面（agentToolsEnabled/onAgentToolsChanged），模拟真 service 的闸门行为。 */
  function makeGateService(start: boolean) {
    let enabled = start;
    const listeners = new Set<(value: boolean) => void>();
    const service = makeFakeService() as unknown as Record<string, unknown>;
    service.agentToolsEnabled = () => enabled;
    service.onAgentToolsChanged = (listener: (value: boolean) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    return {
      service: service as unknown as WeWriteService,
      flip(value: boolean) {
        enabled = value;
        for (const listener of [...listeners]) listener(value);
      },
    };
  }

  it('闸门翻 false：已注册工具的 stop 全量回收、后续 agent/created 不再挂载', () => {
    const gate = makeGateService(true);
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const agent = makeAgent('agent_1', (definition) => {
      void definition;
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    });
    const harness = makeCtx({ agents: [agent] });
    registerAgentTools(harness.ctx, gate.service, { enabled: true });
    expect(stops).toHaveLength(5);

    gate.flip(false);
    for (const [index, stop] of stops.entries()) expect(stop, `工具 ${index} 的 stop 应被调用`).toHaveBeenCalled();

    const lateAgent = makeAgent('agent_late');
    harness.listeners.get('agent/created')?.({ agent: lateAgent.agent });
    expect(lateAgent.register).toHaveBeenCalledTimes(0);
  });

  it('闸门翻 true：对 roots 重新挂载（5 工具恢复）', () => {
    const gate = makeGateService(true);
    const agent = makeAgent('agent_1');
    const harness = makeCtx({ agents: [agent] });
    registerAgentTools(harness.ctx, gate.service, { enabled: true });
    expect(agent.register).toHaveBeenCalledTimes(5);

    gate.flip(false);
    expect(agent.register).toHaveBeenCalledTimes(5);

    gate.flip(true);
    expect(agent.register).toHaveBeenCalledTimes(10);
  });

  it('初值 false + 动态闸门面：不提前退出（disposers 非空），翻 true 后挂载恢复', () => {
    const gate = makeGateService(false);
    const agent = makeAgent('agent_1');
    const harness = makeCtx({ agents: [agent] });
    const disposers = registerAgentTools(harness.ctx, gate.service, { enabled: false });
    expect(agent.register).toHaveBeenCalledTimes(0);
    expect(disposers.length).toBeGreaterThan(0);

    gate.flip(true);
    expect(agent.register).toHaveBeenCalledTimes(5);
    for (const dispose of disposers) dispose();
  });

  it('无动态闸门面的 service（fake 缺省）→ options.enabled 即闸门（既有回落语义）', () => {
    const agent = makeAgent('agent_1');
    const harness = makeCtx({ agents: [agent] });
    const disposers = registerAgentTools(harness.ctx, makeFakeService() as unknown as WeWriteService, { enabled: true });
    expect(agent.register).toHaveBeenCalledTimes(5);
    for (const dispose of disposers) dispose();
  });
});

// ── 五工具定义形状钉死（Spec §5 表 + architecture §4.2）─────────────────────

describe('工具定义形状（Spec §5 工具面 5 个 / AC-M1-01 描述边界）', () => {
  const { agent } = setup();
  const byName = (name: string) => agent.tool(name);

  const TIMEOUTS: Record<string, number> = {
    wewrite_run: 600000,
    wewrite_rewrite: 60000,
    wewrite_push_draft: 120000,
    wewrite_list_articles: 15000,
    wewrite_suggest_topics: 60000,
  };

  it.each(Object.keys(TIMEOUTS))('%s: timeoutMs 按 Spec §5 表锁定', (name) => {
    expect(byName(name).timeoutMs).toBe(TIMEOUTS[name]);
  });

  it('AC-M1-01: 描述非空；push 描述明示「只进草稿箱、不群发」边界', () => {
    for (const name of Object.keys(TIMEOUTS)) {
      expect(String(byName(name).description).length, name).toBeGreaterThan(4);
    }
    const pushDescription = String(byName('wewrite_push_draft').description);
    expect(pushDescription).toContain('草稿箱');
    expect(pushDescription).toContain('不群发');
  });

  it('AC-M1-03: run 参数面 = topic(必填)/image_count/theme + v0.5 brief 四字段（title/approach/outline/sources 全可选），键集精确', () => {
    const parameters = byName('wewrite_run').parameters as Record<string, { required?: boolean; type?: string }>;
    expect(Object.keys(parameters).sort()).toEqual(['approach', 'image_count', 'outline', 'sources', 'theme', 'title', 'topic']);
    expect(parameters.topic?.required).toBe(true);
    expect(parameters.image_count?.required).toBeFalsy();
    expect(parameters.theme?.required).toBeFalsy();
    expect(parameters.title?.required).toBeFalsy();
    expect(parameters.approach?.required).toBeFalsy();
    expect(parameters.outline?.required).toBeFalsy();
    expect(parameters.sources?.required).toBeFalsy();
  });

  it('Spec §5: rewrite 参数 text/instruction 必填 + title 可选；push 仅 article_id 必填；list 仅 limit 可选；suggest 仅 count 可选', () => {
    const rewrite = byName('wewrite_rewrite').parameters as Record<string, { required?: boolean }>;
    expect(Object.keys(rewrite).sort()).toEqual(['instruction', 'text', 'title']);
    expect(rewrite.text?.required).toBe(true);
    expect(rewrite.instruction?.required).toBe(true);

    const push = byName('wewrite_push_draft').parameters as Record<string, { required?: boolean }>;
    expect(Object.keys(push)).toEqual(['article_id']);
    expect(push.article_id?.required).toBe(true);

    const list = byName('wewrite_list_articles').parameters as Record<string, { required?: boolean }>;
    expect(Object.keys(list)).toEqual(['limit']);
    expect(list.limit?.required).toBeFalsy();

    const suggest = byName('wewrite_suggest_topics').parameters as Record<string, { required?: boolean }>;
    expect(Object.keys(suggest)).toEqual(['count']);
    expect(suggest.count?.required).toBeFalsy();
  });

  it('勘误 2/architecture §4.1: 每个定义都带 output（object-root schema + 纯函数 render）', () => {
    for (const name of Object.keys(TIMEOUTS)) {
      const output = byName(name).output as { schema?: Record<string, unknown>; render?: unknown };
      expect(output, name).toBeDefined();
      expect(output.schema?.type, `${name} output.schema 应为 object-root`).toBe('object');
      expect(typeof output.render, name).toBe('function');
    }
  });

  it('AC-M1-11: render/presentCall 纯函数——同输入两次调用输出 deep equal（流式与回放共用）', () => {
    const run = byName('wewrite_run');
    const output = run.output as { render: (args: unknown, value: unknown) => unknown };
    const args = { topic: '冷启动实测', image_count: 1 };
    const value = { ok: true, runId: 'run_1', status: 'succeeded' };
    expect(output.render(args, value)).toEqual(output.render(args, value));
    const presentCall = run.presentCall as (args: unknown) => unknown;
    expect(presentCall(args)).toEqual(presentCall(args));
  });

  it('architecture §4.2: list 不提供 presentCall/presentResult（默认 generic 呈现）', () => {
    const list = byName('wewrite_list_articles');
    expect(list.presentCall).toBeUndefined();
    expect(list.presentResult).toBeUndefined();
  });
});

// ── wewrite_run execute 对接（AC-M1-03 + D11）────────────────────────────────

describe('wewrite_run execute（AC-M1-03 启动/校验 + architecture §4.2 await 终态）', () => {
  it('AC-M1-03: topic 合法 → startRun 透传 trigger=manual + fixed 主题，返回值过 RunToolValueSchema 且 runId/status 与终态一致', async () => {
    const { service, agent } = setup();
    const run = agent.tool('wewrite_run');
    const value = (await (run.execute as (args: unknown, exec: unknown) => Promise<unknown>)(
      { topic: 'Cloudflare Workers 冷启动实测', image_count: 2, theme: 'professional-clean' },
      execWith(new AbortController().signal),
    )) as Record<string, unknown>;

    expect(service.startRun).toHaveBeenCalledTimes(1);
    expect(service.startRun).toHaveBeenCalledWith({
      trigger: 'manual',
      params: { topicMode: 'fixed', topic: 'Cloudflare Workers 冷启动实测', imageCount: 2, theme: 'professional-clean' },
    });
    expect(RunToolValueSchema.safeParse(value).success).toBe(true);
    expect(value.runId).toBe('run_tool_1');
    expect(value.status).toBe('succeeded');
  });

  it('AC-M1-03: image_count 缺省 → 以 0 图推进（默认零图片成本）', async () => {
    const { service, agent } = setup();
    await (agent.tool('wewrite_run').execute as (args: unknown, exec: unknown) => Promise<unknown>)({ topic: '默认零图' }, execWith(new AbortController().signal));
    expect(service.startRun).toHaveBeenCalledWith({ trigger: 'manual', params: { topicMode: 'fixed', topic: '默认零图', imageCount: 0 } });
  });

  it.each([
    [{}, 'topic 空'],
    [{ topic: '' }, 'topic 空串'],
    [{ topic: 'X', image_count: -1 }, 'image_count -1'],
    [{ topic: 'X', image_count: 11 }, 'image_count 11'],
    [{ topic: 'X', image_count: 1.5 }, 'image_count 非整数'],
  ])('AC-M1-03: 非法参数 %s → 结构化错误（不抛异常、不启动管线）', async (args, label) => {
    const { service, agent } = setup();
    const value = await (agent.tool('wewrite_run').execute as (args: unknown, exec: unknown) => Promise<unknown>)(args, execWith(new AbortController().signal));
    const error = asToolError(value);
    expect(error.ok, label).toBe(false);
    expect(typeof error.error?.code, label).toBe('string');
    expect(error.error?.code?.length ?? 0, label).toBeGreaterThan(0);
    expect(service.startRun, label).toHaveBeenCalledTimes(0);
  });

  it('architecture §4.2: execute 等到 run 终态才 settle（startRun 即时返回 runId，不提前 resolve）', async () => {
    const gate = new Promise<RunRecord>((resolve) => {
      setTimeout(() => resolve(makeRunRecord({ id: 'run_tool_1', status: 'succeeded' })), 50);
    });
    const service = makeFakeService({ runCompletion: () => gate });
    const { agent } = setup({ service });
    let settled = false;
    const pending = (agent.tool('wewrite_run').execute as (args: unknown, exec: unknown) => Promise<unknown>)(
      { topic: '慢管线' },
      execWith(new AbortController().signal),
    ).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(settled, 'runCompletion 未终态前 execute 不得 resolve').toBe(false);
    const value = (await pending) as Record<string, unknown>;
    expect(value.status).toBe('succeeded');
  });

  it('D11/abort: exec.signal abort → cancelRun(runId) 转发；终值 status=cancelled', async () => {
    let release: ((record: RunRecord) => void) | undefined;
    const gate = new Promise<RunRecord>((resolve) => {
      release = resolve;
    });
    const service = makeFakeService({ runCompletion: () => gate });
    const { agent } = setup({ service });
    const controller = new AbortController();
    const pending = (agent.tool('wewrite_run').execute as (args: unknown, exec: unknown) => Promise<unknown>)({ topic: '要被中止' }, execWith(controller.signal));
    controller.abort();
    expect(service.cancelRun).toHaveBeenCalledWith('run_tool_1');
    release?.(makeRunRecord({ id: 'run_tool_1', status: 'cancelled' }));
    const value = (await pending) as Record<string, unknown>;
    expect(value.status).toBe('cancelled');
  });

  // M2 运行卡 runId 断链修复（architecture §5.2 假设修正）：presentCall 先于 execute 拿不到
  // runId，前端推导链 args.runId→rawInput.runId→callId 兜底——execute 必须把宿主 callId 绑到 runId。
  it('callId 绑定：exec.callId 存在 → startRun 后 bindRunCall(callId, runId)；无 callId 零绑定', async () => {
    const { service, agent } = setup();
    const execute = agent.tool('wewrite_run').execute as (args: unknown, exec: unknown) => Promise<unknown>;
    await execute({ topic: '带 callId 的调用' }, { signal: new AbortController().signal, callId: 'call_abc' });
    expect(service.bindRunCall).toHaveBeenCalledWith('call_abc', 'run_tool_1');
    expect(service.bindRunCall).toHaveBeenCalledTimes(1);

    await execute({ topic: '无 callId 的调用' }, execWith(new AbortController().signal));
    expect(service.bindRunCall).toHaveBeenCalledTimes(1);
  });
});

// ── wewrite_rewrite / wewrite_list_articles / wewrite_suggest_topics ───────

describe('wewrite_rewrite execute（Spec §5：text 1-8000 / instruction 1-200）', () => {
  const args = { text: '一段需要更口语化的技术段落。', instruction: '更口语一点' };

  it('architecture §4.2: 透传 service.rewriteText，返回值携带改写全文（模型需要看到改写结果才能继续对话）', async () => {
    const { service, agent } = setup();
    const value = (await (agent.tool('wewrite_rewrite').execute as (a: unknown, e: unknown) => Promise<unknown>)(
      { ...args, title: '文章题名' },
      execWith(new AbortController().signal),
    )) as Record<string, unknown>;
    expect(service.rewriteText).toHaveBeenCalledTimes(1);
    expect(service.rewriteText).toHaveBeenCalledWith({ ...args, title: '文章题名' });
    expect(String(value.text)).toContain('改写后');
    const meta = (agent.tool('wewrite_rewrite').output as { presentationMeta?: (a: unknown, v: unknown) => unknown }).presentationMeta?.(args, value);
    const parsed = RewriteToolMetaSchema.safeParse(meta);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.charsIn).toBe(args.text.length);
      expect(parsed.data.charsOut).toBe(String(value.text).length);
    }
  });

  it('Spec §11/45s 语义：service 抛 rewrite-timeout 结构化错误 → execute 返回 ok:false+error.code，不抛异常', async () => {
    const timeoutError = Object.assign(new Error('AI 改写超时（45 秒），已取消，请重试'), { code: 'rewrite-timeout' });
    const service = makeFakeService({
      rewriteText: () => {
        throw timeoutError;
      },
    });
    const { agent } = setup({ service });
    const value = await (agent.tool('wewrite_rewrite').execute as (a: unknown, e: unknown) => Promise<unknown>)(args, execWith(new AbortController().signal));
    const error = asToolError(value);
    expect(error.ok).toBe(false);
    expect(error.error?.code).toBe('rewrite-timeout');
  });

  it.each([
    [{}, '缺 text'],
    [{ text: '' }, 'text 空'],
    [{ text: 'x'.repeat(8001), instruction: '更口语' }, 'text 超长'],
    [{ text: '一段文本', instruction: '' }, 'instruction 空'],
    [{ text: '一段文本', instruction: 'y'.repeat(201) }, 'instruction 超长'],
  ])('参数非法 %s → 结构化错误，rewriteText 零调用', async (badArgs, label) => {
    const { service, agent } = setup();
    const value = await (agent.tool('wewrite_rewrite').execute as (a: unknown, e: unknown) => Promise<unknown>)(badArgs, execWith(new AbortController().signal));
    expect(asToolError(value).ok, label).toBe(false);
    expect(service.rewriteText, label).toHaveBeenCalledTimes(0);
  });
});

describe('wewrite_list_articles execute（AC-M1-04 轻投影）', () => {
  // 契约修正（联调返工）：canonical value 包 {articles:[...]}（object-root）——裸数组会被
  // 宿主 createSuccessResult 按 output.schema 校验拒成 D2 降级，断言随形状同步。
  it('AC-M1-04: 返回轻量清单——不含 markdown 全文、不含任何凭据命名字段', async () => {
    const { agent } = setup();
    const value = (await (agent.tool('wewrite_list_articles').execute as (a: unknown, e: unknown) => Promise<unknown>)({}, execWith(new AbortController().signal))) as { articles?: unknown[] };
    const items = value.articles;
    expect(Array.isArray(items)).toBe(true);
    expect(items?.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain('markdown');
    for (const item of (items ?? []) as Record<string, unknown>[]) {
      for (const key of Object.keys(item)) {
        expect(/secret|token|key|password|credential/i.test(key), `敏感字段名泄漏: ${key}`).toBe(false);
      }
    }
  });

  it('Spec §5: limit 缺省 10、显式 limit 生效', async () => {
    const { agent } = setup();
    const execute = agent.tool('wewrite_list_articles').execute as (a: unknown, e: unknown) => Promise<{ articles?: unknown[] }>;
    expect((await execute({}, execWith(new AbortController().signal))).articles).toHaveLength(10);
    expect((await execute({ limit: 3 }, execWith(new AbortController().signal))).articles).toHaveLength(3);
  });
});

describe('wewrite_suggest_topics execute（AC-M3-04，Spec §5 增补第 5 工具）', () => {
  const exec = execWith(new AbortController().signal);

  it('AC-M3-04: count 缺省 3 → 热榜取条 + 逐条 AI 速览，候选含来源与速览', async () => {
    const { service, agent } = setup();
    const value = (await (agent.tool('wewrite_suggest_topics').execute as (a: unknown, e: unknown) => Promise<unknown>)({}, exec)) as { topics?: Array<Record<string, unknown>> };
    expect(service.fetchHotspots).toHaveBeenCalledTimes(1);
    expect(service.digestHotspotItem).toHaveBeenCalledTimes(3);
    expect(value.topics).toHaveLength(3);
    for (const topic of value.topics ?? []) {
      expect(typeof topic.title).toBe('string');
      expect(typeof topic.source).toBe('string');
      expect(typeof topic.digest).toBe('string');
    }
    const meta = (agent.tool('wewrite_suggest_topics').output as { presentationMeta?: (a: unknown, v: unknown) => unknown }).presentationMeta?.({}, value);
    const parsed = SuggestTopicsMetaSchema.safeParse(meta);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.topics).toHaveLength(3);
  });

  it('Spec §5: count 上限 5（count=5 全量速览）', async () => {
    const { service, agent } = setup();
    const value = (await (agent.tool('wewrite_suggest_topics').execute as (a: unknown, e: unknown) => Promise<unknown>)({ count: 5 }, exec)) as { topics?: unknown[] };
    expect(service.digestHotspotItem).toHaveBeenCalledTimes(5);
    expect(value.topics).toHaveLength(5);
  });

  it.each([0, -1, 6, 2.5])('count 越界（%s）→ 结构化错误，热榜零调用（AC-M1-03 同款越界语义）', async (count) => {
    const { service, agent } = setup();
    const value = await (agent.tool('wewrite_suggest_topics').execute as (a: unknown, e: unknown) => Promise<unknown>)({ count }, exec);
    expect(asToolError(value).ok).toBe(false);
    expect(service.fetchHotspots).toHaveBeenCalledTimes(0);
    expect(service.digestHotspotItem).toHaveBeenCalledTimes(0);
  });
});

// ── presentCall / presentResult 卡片（AC-M1-07 / AC-M1-08 / AC-M1-11）────────

describe('声明式卡片（AC-M1-07 运行卡 / AC-M1-08 结果卡 / ADR-012 只用 generic+text）', () => {
  const { agent } = setup();

  it('AC-M1-07: run presentCall → generic 卡，title 含主题，kind=execute，rawInput={topic,image_count}', () => {
    const view = (agent.tool('wewrite_run').presentCall as (args: unknown) => Record<string, unknown>)({ topic: 'Cloudflare Workers 冷启动实测', image_count: 2 });
    expect(view.card).toBe('generic');
    expect(view.kind).toBe('execute');
    expect(String(view.title)).toContain('Cloudflare Workers 冷启动实测');
    expect(view.rawInput).toEqual({ topic: 'Cloudflare Workers 冷启动实测', image_count: 2 });
  });

  it('AC-M1-08: run presentResult 成功 → generic 卡 title 含《标题》成稿，content 文本含 digest', () => {
    const meta = { tool: 'wewrite_run', topic: '冷启动实测', ok: true, runId: 'run_1', status: 'succeeded', articleId: 'art_9', title: '冷启动实测报告', digest: 'p99 冷启动仅 3ms。' };
    const view = (agent.tool('wewrite_run').presentResult as (a: unknown, r: unknown) => Record<string, unknown>)(
      { topic: '冷启动实测' },
      { content: [], isError: false, meta },
    );
    expect(view.card).toBe('generic');
    expect(String(view.title)).toContain('冷启动实测报告');
    expect(String(view.title)).toContain('成稿');
    expect(JSON.stringify(view.content)).toContain('p99 冷启动仅 3ms。');
  });

  it('AC-M1-08: run presentResult 失败 → title 含失败，content 含脱敏错误信息', () => {
    const meta = { tool: 'wewrite_run', topic: '冷启动实测', ok: false, runId: 'run_2', status: 'failed', error: { code: 'gates-failed', message: '质量门禁未通过，默认推送路径已被阻断' } };
    const view = (agent.tool('wewrite_run').presentResult as (a: unknown, r: unknown) => Record<string, unknown>)(
      { topic: '冷启动实测' },
      { content: [], isError: true, meta },
    );
    expect(String(view.title)).toContain('失败');
    expect(JSON.stringify(view.content)).toContain('质量门禁未通过');
  });

  it('AC-M1-07: push presentCall → generic 卡 kind=execute，title 含 article_id', () => {
    const view = (agent.tool('wewrite_push_draft').presentCall as (args: unknown) => Record<string, unknown>)({ article_id: 'art_9' });
    expect(view.card).toBe('generic');
    expect(view.kind).toBe('execute');
    expect(String(view.title)).toContain('art_9');
  });

  it('AC-M1-09: push presentResult 成功 → title 含草稿箱与 mediaId 尾 4 位', () => {
    const meta = { tool: 'wewrite_push_draft', articleId: 'art_9', title: '冷启动实测报告', ok: true, mediaId: 'MEDIA_ab12cd' };
    const view = (agent.tool('wewrite_push_draft').presentResult as (a: unknown, r: unknown) => Record<string, unknown>)(
      { article_id: 'art_9' },
      { content: [], isError: false, meta },
    );
    expect(String(view.title)).toContain('草稿箱');
    expect(String(view.title)).toContain('12cd');
  });

  it('AC-M1-08: rewrite presentResult → title 含改写完成与前后字数', () => {
    const meta = { tool: 'wewrite_rewrite', charsIn: 120, charsOut: 98, ok: true };
    const view = (agent.tool('wewrite_rewrite').presentResult as (a: unknown, r: unknown) => Record<string, unknown>)(
      { text: 'x', instruction: '更口语' },
      { content: [], isError: false, meta },
    );
    expect(String(view.title)).toContain('改写完成');
    expect(String(view.title)).toContain('120');
    expect(String(view.title)).toContain('98');
  });

  it('AC-M3-04: suggest presentResult → content 呈现来源+标题+速览', () => {
    const meta = { tool: 'wewrite_suggest_topics', topics: [{ title: '某引擎开源', source: 'hackernews', digest: '一句话速览。' }] };
    const view = (agent.tool('wewrite_suggest_topics').presentResult as (a: unknown, r: unknown) => Record<string, unknown>)(
      {},
      { content: [], isError: false, meta },
    );
    const text = JSON.stringify(view.content ?? view);
    expect(text).toContain('某引擎开源');
    expect(text).toContain('hackernews');
    expect(text).toContain('一句话速览。');
  });

  it('E2 meta 投影：run/rewrite/push 的 presentationMeta 产物过各自 meta schema 且 tool 标记正确', () => {
    const runValue = { ok: true, runId: 'run_1', status: 'succeeded', articleId: 'art_9', title: 'T', digest: 'D' };
    const runMeta = (agent.tool('wewrite_run').output as { presentationMeta?: (a: unknown, v: unknown) => unknown }).presentationMeta?.({ topic: '冷启动' }, runValue);
    expect(RunToolMetaSchema.safeParse(runMeta).success).toBe(true);
    expect((runMeta as { tool?: string }).tool).toBe('wewrite_run');

    const rewriteValue = { ok: true, text: '改写后文本' };
    const rewriteMeta = (agent.tool('wewrite_rewrite').output as { presentationMeta?: (a: unknown, v: unknown) => unknown }).presentationMeta?.(
      { text: '原文文本', instruction: '更口语' },
      rewriteValue,
    );
    expect(RewriteToolMetaSchema.safeParse(rewriteMeta).success).toBe(true);

    const pushValue = { ok: true, mediaId: 'MEDIA_x', thumbMediaId: 'T', articleId: 'art_9', title: '冷启动实测报告' };
    const pushMeta = (agent.tool('wewrite_push_draft').output as { presentationMeta?: (a: unknown, v: unknown) => unknown }).presentationMeta?.({ article_id: 'art_9' }, pushValue);
    expect(PushToolMetaSchema.safeParse(pushMeta).success).toBe(true);
  });
});

// ── 推送审批（OD-1 / AC-M1-05 / D14 fail-closed 双层）───────────────────────

describe('推送审批 pre-execute（OD-1 / AC-M1-05 确认前零微信 API 调用 / D14）', () => {
  it('OD-1: armPushApproval 对 wewrite_push_draft 返回 ask，reason 含文章标题与「草稿箱」', async () => {
    const harness = makeCtx();
    const service = makeFakeService();
    const stop = armPushApproval(harness.ctx, service as unknown as WeWriteService);
    expect(typeof stop).toBe('function');
    const listener = harness.listeners.get('tools/pre-execute');
    expect(listener, '应订阅 tools/pre-execute').toBeTypeOf('function');
    const decision = (await listener?.({ name: 'wewrite_push_draft', arguments: { article_id: 'art_9' } }, () => Promise.resolve({ kind: 'allow' }))) as { kind?: string; reason?: string };
    expect(decision.kind).toBe('ask');
    expect(decision.reason).toContain('Cloudflare Workers 冷启动实测');
    expect(decision.reason).toContain('草稿箱');
  });

  it('waterfall 纪律（architecture §4.4①）: 他人工具调用必须透传 next() 的裁决', async () => {
    const harness = makeCtx();
    armPushApproval(harness.ctx, makeFakeService() as unknown as WeWriteService);
    const listener = harness.listeners.get('tools/pre-execute');
    const next = vi.fn(async () => ({ kind: 'allow' as const }));
    const decision = (await listener?.({ name: 'other_tool', arguments: {} }, next)) as { kind?: string };
    expect(next).toHaveBeenCalledTimes(1);
    expect(decision.kind).toBe('allow');
  });

  it('AC-M1-06: 审批 armed 且 execute 被派发（宿主 allowed-once 后）→ pushArticleDraft 恰一次，mediaId 进终值', async () => {
    const { service, agent } = setup({ service: makeFakeService() });
    const value = (await (agent.tool('wewrite_push_draft').execute as (a: unknown, e: unknown) => Promise<unknown>)({ article_id: 'art_9' }, execWith(new AbortController().signal))) as Record<string, unknown>;
    expect(service.pushArticleDraft).toHaveBeenCalledTimes(1);
    expect(service.pushArticleDraft).toHaveBeenCalledWith('art_9');
    expect(value.ok).toBe(true);
    expect(String(value.mediaId ?? '')).not.toBe('');
  });

  it('AC-M1-05: article_id 空 → 结构化错误，零微信 API 调用', async () => {
    const { service, agent } = setup();
    const value = await (agent.tool('wewrite_push_draft').execute as (a: unknown, e: unknown) => Promise<unknown>)({}, execWith(new AbortController().signal));
    expect(asToolError(value).ok).toBe(false);
    expect(service.pushArticleDraft).toHaveBeenCalledTimes(0);
  });

  it('D14②: 审批未武装（stop 已回收）→ execute 返回拒绝，pushArticleDraft 零调用（未确认微信调用构造上不可达）', async () => {
    const { service, agent, disposers } = setup();
    for (const dispose of disposers) dispose();
    const value = await (agent.tool('wewrite_push_draft').execute as (a: unknown, e: unknown) => Promise<unknown>)({ article_id: 'art_9' }, execWith(new AbortController().signal));
    const error = asToolError(value);
    expect(error.ok).toBe(false);
    expect(service.pushArticleDraft, '审批通道不可用时必须零微信 API 调用').toHaveBeenCalledTimes(0);
  });

  it('D14①: ctx.on 抛错 → 审批未武装 → wewrite_push_draft 整个不注册（其余 4 工具照常）', () => {
    const agent = makeAgent();
    const harness = makeCtx({ agents: [agent], onThrow: true });
    expect(() => registerAgentTools(harness.ctx, makeFakeService() as unknown as WeWriteService, { enabled: true })).not.toThrow();
    const names = agent.registered.map((d) => (d as { name: string }).name);
    expect(names).not.toContain('wewrite_push_draft');
    expect(names.sort()).toEqual(['wewrite_list_articles', 'wewrite_rewrite', 'wewrite_run', 'wewrite_suggest_topics']);
  });

  it('D14①: ctx.on 返回非函数（宿主 seam 降级）→ push 不注册', () => {
    const agent = makeAgent();
    const harness = makeCtx({ agents: [agent], onReturnNonFunction: true });
    registerAgentTools(harness.ctx, makeFakeService() as unknown as WeWriteService, { enabled: true });
    const names = agent.registered.map((d) => (d as { name: string }).name);
    expect(names).not.toContain('wewrite_push_draft');
    expect(names).toHaveLength(4);
  });
});

// ── wewrite_run 启动 brief（v0.5 docs/v0.5-launch-brief.md：蒸馏进参数/分层硬绑）──

describe('wewrite_run 启动 brief（v0.5 变密度输入）', () => {
  it('brief 四字段齐带 → 蒸馏进 params.brief 透传管线', async () => {
    const { service, agent } = setup();
    await (agent.tool('wewrite_run').execute as (args: unknown, exec: unknown) => Promise<unknown>)(
      {
        topic: 'Workers 冷启动',
        title: '冷启动的真实数字',
        approach: '冷启动被夸大了',
        outline: ['冷启动实测', '成本对比'],
        sources: ['https://a.test/x'],
      },
      execWith(new AbortController().signal),
    );
    expect(service.startRun).toHaveBeenCalledWith({
      trigger: 'manual',
      params: {
        topicMode: 'fixed',
        topic: 'Workers 冷启动',
        imageCount: 0,
        brief: {
          title: '冷启动的真实数字',
          approach: '冷启动被夸大了',
          outline: ['冷启动实测', '成本对比'],
          sources: ['https://a.test/x'],
        },
      },
    });
  });

  it('只给主题 → params 不携带 brief 键（一句话模式零损伤）', async () => {
    const { service, agent } = setup();
    await (agent.tool('wewrite_run').execute as (args: unknown, exec: unknown) => Promise<unknown>)(
      { topic: '只给一句话' },
      execWith(new AbortController().signal),
    );
    expect(service.startRun).toHaveBeenCalledWith({ trigger: 'manual', params: { topicMode: 'fixed', topic: '只给一句话', imageCount: 0 } });
  });

  it.each([
    [{ topic: 'X', sources: ['not-a-url'] }, 'brief-sources-invalid', '来源非 URL'],
    [{ topic: 'X', sources: ['ftp://a.test/x'] }, 'brief-sources-invalid', '来源非 http(s)'],
    [{ topic: 'X', outline: '冷启动' }, 'brief-outline-invalid', 'outline 非数组'],
    [{ topic: 'X', title: 'x'.repeat(65) }, 'brief-title-invalid', '标题超 64 字'],
  ])('非法 brief %s → 结构化错误 %s 且不启动管线', async (args, code, label) => {
    const { service, agent } = setup();
    const value = await (agent.tool('wewrite_run').execute as (args: unknown, exec: unknown) => Promise<unknown>)(
      args,
      execWith(new AbortController().signal),
    );
    const error = asToolError(value);
    expect(error.ok, label).toBe(false);
    expect(error.error?.code, label).toBe(code);
    expect(service.startRun, label).toHaveBeenCalledTimes(0);
  });

  it('工具描述含行为契约：蒸馏进参数 + 一句话不追问', () => {
    const { agent } = setup();
    const run = agent.tool('wewrite_run') as { description: string };
    expect(run.description).toContain('蒸馏');
    expect(run.description).toContain('不追问');
  });

  it('presentCall：brief 字段进 rawInput，标题/来源数量进状态文案', () => {
    const { agent } = setup();
    const run = agent.tool('wewrite_run') as { presentCall: (args: unknown) => { title: string; rawInput: Record<string, unknown> } };
    const view = run.presentCall({
      topic: '主题',
      title: '定标题',
      outline: ['A', 'B'],
      sources: ['https://a.test/x'],
    });
    expect(view.title).toContain('定标题');
    expect(view.title).toContain('来源 1 条');
    expect(view.rawInput.outline).toEqual(['A', 'B']);
    expect(view.rawInput.sources).toEqual(['https://a.test/x']);
  });
});
