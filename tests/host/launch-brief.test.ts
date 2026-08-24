import { describe, expect, it, vi } from 'vitest';
import type { RunRecord, StepRecord } from '@/host/domain';
import type { RunParams } from '@/shared/contract';
import { createPipelineEngine, type PipelineLlm, type RunStore } from '@/host/pipeline/engine';
import { draftUserPrompt, outlineUserPrompt } from '@/host/pipeline/llm';
import { runQualityGates } from '@/host/pipeline/steps/gates';
import { ArticleStore } from '@/host/articles-store';
import type { DomainTables } from '@/host/store';
import type { SettingsRecord } from '@/host/domain';

/**
 * v0.5 启动 brief 合同测试（docs/v0.5-launch-brief.md §2 分层绑定）：
 * - prompt 层：outline 骨架模式 / draft 锚定（标题/思路/来源）
 * - engine 层：骨架机械校验（遗漏重试一次→步骤失败）、gates 收到 sources+userText
 * - gates 层：来源可见 URL（链接语法不算）+ 编造拦截（代码块/用户原文/深路径边界）
 * - 落库层：brief.title 硬绑覆盖推导标题
 */

// ── 假件（对齐 pipeline-engine.test.ts 协议） ────────────────────────────────

type Chunk =
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'finish'; reason: { kind: 'stop' | 'error' | 'aborted'; failure?: { code: string; message: string } } };

const okTextStream = (text: string) =>
  (async function* () {
    yield { type: 'text-delta', index: 0, text } as Chunk;
    yield { type: 'finish', reason: { kind: 'stop' } } as Chunk;
  })();

class MemoryRunStore implements RunStore {
  readonly runs = new Map<string, RunRecord>();
  put(run: RunRecord): void {
    this.runs.set(run.id, run);
  }
  get(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }
  update(runId: string, patch: (run: RunRecord) => RunRecord): void {
    const current = this.runs.get(runId);
    if (current) this.runs.set(runId, patch(current));
  }
  all(): RunRecord[] {
    return [...this.runs.values()];
  }
}

function makeEngineDeps(llmTexts: string[]) {
  const calls: Record<string, unknown>[] = [];
  let cursor = 0;
  const llmStream = vi.fn(async (options: Record<string, unknown>) => {
    calls.push(options);
    const text = llmTexts[Math.min(cursor, llmTexts.length - 1)] ?? '';
    cursor += 1;
    return okTextStream(text);
  });
  // 捕获的是宿主形状 GenerateOptions：user 文本在 messages[0].content[0].text（llm.ts toHostOptions）。
  const userTextOf = (options: Record<string, unknown>): string => {
    const messages = options.messages as { content?: { text?: string }[] }[] | undefined;
    return String(messages?.[0]?.content?.[0]?.text ?? '');
  };
  const gatesRun = vi.fn(async (_input: { markdown: string; sources?: readonly string[]; userText?: readonly string[] }) => ({
    passed: true,
    report: { strict: true },
  }));
  const store = new MemoryRunStore();
  const engine = createPipelineEngine({
    llm: { stream: llmStream as unknown as PipelineLlm['stream'] },
    store,
    gates: { run: gatesRun },
    renderer: { convert: () => '<section style="color:#0F1115">html</section>' },
    images: { generate: vi.fn(async () => ({ coverImageId: 'img_0', bodyImageIds: [] })) },
  });
  return { engine, store, calls, userTextOf, gatesRun };
}

const baseParams: RunParams = {
  topicMode: 'fixed',
  topic: 'Workers 冷启动',
  imageCount: 0,
  llm: { provider: 'zhipu', model: 'glm-4.7-flash' },
};

// ── prompt 层 ────────────────────────────────────────────────────────────────

describe('outlineUserPrompt（v0.5 骨架绑模式）', () => {
  it('无 brief：维持原大纲提示（回归锚）', () => {
    const prompt = outlineUserPrompt('主题X');
    expect(prompt).toContain('5 到 8 个二级标题小节');
    expect(prompt).not.toContain('骨架');
  });

  it('带 outline：给定节名进合同段（原样保留+顺序不变），并切换为补洞任务', () => {
    const prompt = outlineUserPrompt('主题X', { outline: ['冷启动实测', '成本对比'] });
    expect(prompt).toContain('用户已定大纲骨架');
    expect(prompt).toContain('- 冷启动实测');
    expect(prompt).toContain('- 成本对比');
    expect(prompt).toContain('补洞');
    expect(prompt).not.toContain('5 到 8 个');
  });

  it('重试反馈：遗漏节名带「」原样点名', () => {
    const prompt = outlineUserPrompt('主题X', { outline: ['A节'] }, ['A节']);
    expect(prompt).toContain('上一次输出遗漏');
    expect(prompt).toContain('「A节」');
  });
});

describe('draftUserPrompt（v0.5 硬绑锚）', () => {
  it('无 brief：维持原成稿提示（回归锚）', () => {
    const prompt = draftUserPrompt('主题X', '大纲内容');
    expect(prompt).toContain('大纲如下：');
    expect(prompt).not.toContain('已定标题');
    expect(prompt).not.toContain('引用来源约束');
  });

  it('title/approach/sources 齐带：三段硬约束全部进 prompt，来源禁用链接语法', () => {
    const prompt = draftUserPrompt('主题X', '大纲内容', {
      title: '冷启动的真实数字',
      approach: '主张：冷启动被夸大了',
      sources: ['https://a.test/x'],
    });
    expect(prompt).toContain('《冷启动的真实数字》');
    expect(prompt).toContain('主张：冷启动被夸大了');
    expect(prompt).toContain('引用来源约束');
    expect(prompt).toContain('https://a.test/x');
    expect(prompt).toContain('不要用 Markdown 链接语法');
  });
});

// ── engine 层 ────────────────────────────────────────────────────────────────

describe('engine：brief 传递与骨架机械校验', () => {
  it('骨架齐全+成稿含节名 → 一次过；draft prompt 带全部硬约束；gates 收到 sources+userText+outlineSkeleton', async () => {
    const outlineText = '## 冷启动实测\n覆盖数据\n## 成本对比\n覆盖对比';
    const draftText = '## 冷启动实测\n正文含冷启动实测与成本对比（来源：https://a.test/x）';
    const { engine, store, calls, userTextOf, gatesRun } = makeEngineDeps([outlineText, draftText]);
    const brief = {
      title: '定制标题',
      approach: '主张锚',
      outline: ['冷启动实测', '成本对比'],
      sources: ['https://a.test/x'],
    };
    await engine.start({ trigger: 'manual', params: { ...baseParams, brief } });

    const run = store.all()[0];
    expect(run?.status).toBe('succeeded');
    // outline 调用 1 次、draft 1 次
    expect(calls).toHaveLength(2);
    const outlineUser = userTextOf(calls[0] ?? {});
    expect(outlineUser).toContain('用户已定大纲骨架');
    const draftUser = userTextOf(calls[1] ?? {});
    expect(draftUser).toContain('《定制标题》');
    expect(draftUser).toContain('主张锚');
    expect(draftUser).toContain('https://a.test/x');
    // gates 收到来源门禁输入；userText 含主题/标题/思路/大纲节
    expect(gatesRun).toHaveBeenCalledTimes(1);
    const gatesInput = gatesRun.mock.calls[0]?.[0] as { sources?: string[]; userText?: string[]; outlineSkeleton?: string[] };
    expect(gatesInput.sources).toEqual(['https://a.test/x']);
    expect(gatesInput.outlineSkeleton).toEqual(['冷启动实测', '成本对比']);
    expect(gatesInput.userText).toEqual(
      expect.arrayContaining(['Workers 冷启动', '定制标题', '主张锚', '冷启动实测', '成本对比']),
    );
  });

  it('骨架遗漏 → 带反馈重试一次；仍遗漏 → outline 步失败（outline-skeleton-violated），gates 不执行', async () => {
    const { engine, store, calls, userTextOf, gatesRun } = makeEngineDeps(['只有别的节', '还是缺节']);
    await engine.start({
      trigger: 'manual',
      params: { ...baseParams, brief: { outline: ['必须保留的节'] } },
    });

    const run = store.all()[0];
    expect(run?.status).toBe('failed');
    expect(run?.error?.code).toBe('outline-skeleton-violated');
    expect(run?.error?.message).toContain('必须保留的节');
    const outlineStep = run?.steps.find((step: StepRecord) => step.name === 'outline');
    expect(outlineStep?.status).toBe('failed');
    // 重试恰好发生在 outline 步内：两次 LLM 调用都是 outline prompt，第二次带遗漏反馈
    expect(calls).toHaveLength(2);
    expect(userTextOf(calls[1] ?? {})).toContain('上一次输出遗漏');
    expect(gatesRun).not.toHaveBeenCalled();
  });

  it('重试补齐 → 成功（第一次缺节、第二次带齐）', async () => {
    const { engine, store } = makeEngineDeps(['缺节的大纲', '## 目标节\n说明']);
    await engine.start({
      trigger: 'manual',
      params: { ...baseParams, brief: { outline: ['目标节'] } },
    });
    expect(store.all()[0]?.status).toBe('succeeded');
  });

  it('draft 改写给定节 → 带反馈重写一次；补齐即成功', async () => {
    const { engine, store, calls, userTextOf } = makeEngineDeps([
      '## 目标节\n说明',
      '## 被改写的节名\n正文',
      '## 目标节\n修正后的正文',
    ]);
    await engine.start({ trigger: 'manual', params: { ...baseParams, brief: { outline: ['目标节'] } } });
    expect(store.all()[0]?.status).toBe('succeeded');
    expect(calls).toHaveLength(3); // outline + draft + draft 重写
    expect(userTextOf(calls[2] ?? {})).toContain('上一次成稿遗漏');
    expect(userTextOf(calls[2] ?? {})).toContain('「目标节」');
  });

  it('draft 把来源写成链接语法 → 带反馈重写一次；裸文本化即成功', async () => {
    const { engine, store, calls, userTextOf } = makeEngineDeps([
      '大纲',
      '详见[官网](https://a.test/x)。',
      '详见官网（来源：https://a.test/x）。',
    ]);
    await engine.start({ trigger: 'manual', params: { ...baseParams, brief: { sources: ['https://a.test/x'] } } });
    expect(store.all()[0]?.status).toBe('succeeded');
    expect(calls).toHaveLength(3); // outline + draft + draft 重写
    expect(userTextOf(calls[2] ?? {})).toContain('裸 URL 文本引用');
    expect(userTextOf(calls[2] ?? {})).toContain('https://a.test/x');
  });

  it('draft 重写仍缺节 → 交 gates 骨架终检（gates 收到 outlineSkeleton）', async () => {
    const { engine, store, gatesRun } = makeEngineDeps(['## 目标节\n说明', '还是没有目标节三个字', '依旧没有']);
    await engine.start({ trigger: 'manual', params: { ...baseParams, brief: { outline: ['目标节'] } } });
    // gates mock 恒过 → run succeeded；骨架缺失的拦截责任在真实 gates（单测另行覆盖）
    expect(store.all()[0]?.status).toBe('succeeded');
    const gatesInput = gatesRun.mock.calls[0]?.[0] as { outlineSkeleton?: string[] };
    expect(gatesInput.outlineSkeleton).toEqual(['目标节']);
  });

  it('无 brief → gates 只收 markdown（来源门禁不激活，回归锚）', async () => {
    const { engine, gatesRun } = makeEngineDeps(['大纲', '正文']);
    await engine.start({ trigger: 'manual', params: baseParams });
    const gatesInput = gatesRun.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('sources' in gatesInput).toBe(false);
  });
});

// ── gates 层：来源门禁 ────────────────────────────────────────────────────────

describe('runQualityGates：来源可见性与编造拦截', () => {
  it('未给 sources → report.sources 为 undefined（门禁不激活）', () => {
    const { report } = runQualityGates({ markdown: '正文 https://任意.test/x' });
    expect(report.sources).toBeUndefined();
  });

  it('来源以裸 URL 出现 → 通过', () => {
    const { report } = runQualityGates({
      markdown: '实测结论见（来源：https://a.test/x）。',
      sources: ['https://a.test/x'],
    });
    expect(report.sources?.passed).toBe(true);
    expect(report.sources?.issues).toEqual([]);
  });

  it('尾斜杠差异容忍：给定 a.test/x/、成文写 a.test/x → 通过', () => {
    const { report } = runQualityGates({
      markdown: '见 https://a.test/x 的数据。',
      sources: ['https://a.test/x/'],
    });
    expect(report.sources?.passed).toBe(true);
  });

  it('URL 只出现在链接语法里 → 判未可见（微信会剥离锚标签）', () => {
    const { report } = runQualityGates({
      markdown: '详见[文档](https://a.test/x)。',
      sources: ['https://a.test/x'],
    });
    expect(report.sources?.passed).toBe(false);
    expect(report.sources?.issues[0]).toContain('可见 URL');
    // 该问题必须进入总 issues（翻掉整体 passed）
    expect(report.issues.some((issue) => issue.includes('可见 URL'))).toBe(true);
  });

  it('编造拦截：正文出现未提供的 URL → 失败', () => {
    const { report } = runQualityGates({
      markdown: '实测见 https://a.test/x，另参考 https://b.test/y。',
      sources: ['https://a.test/x'],
    });
    expect(report.sources?.passed).toBe(false);
    expect(report.sources?.issues.some((issue) => issue.includes('https://b.test/y'))).toBe(true);
  });

  it('给定来源的更深路径（同源延伸）→ 放行', () => {
    const { report } = runQualityGates({
      markdown: '实测见 https://a.test/x/section。',
      sources: ['https://a.test/x'],
    });
    expect(report.sources?.passed).toBe(true);
  });

  it('代码块里的 URL 不算引用/编造', () => {
    const { report } = runQualityGates({
      markdown: '命令示例：\n```\ncurl https://api.example.test/v1\n```\n结论（来源：https://a.test/x）。',
      sources: ['https://a.test/x'],
    });
    expect(report.sources?.passed).toBe(true);
  });

  it('用户原文（思路/主题）里带出的 URL 视为已授权', () => {
    const { report } = runQualityGates({
      markdown: '官方文档 https://user.example/doc 写明了一切（来源：https://a.test/x）。',
      sources: ['https://a.test/x'],
      userText: ['主题', '思路里提到 https://user.example/doc'],
    });
    expect(report.sources?.passed).toBe(true);
  });
});

describe('runQualityGates：大纲骨架终检（v0.5 draft 层防线）', () => {
  it('未给 outlineSkeleton → report.outlineSkeleton 为 undefined（不激活）', () => {
    const { report } = runQualityGates({ markdown: '正文' });
    expect(report.outlineSkeleton).toBeUndefined();
  });

  it('给定节全在成稿 → 通过', () => {
    const { report } = runQualityGates({
      markdown: '## 节A\n正文\n## 节B\n正文',
      outlineSkeleton: ['节A', '节B'],
    });
    expect(report.outlineSkeleton?.passed).toBe(true);
  });

  it('draft 改写给定节 → 失败且进总 issues（翻掉整体 passed）', () => {
    const { report, passed } = runQualityGates({
      markdown: '## 节A\n正文\n## 改写掉的节\n正文',
      outlineSkeleton: ['节A', '节B'],
    });
    expect(report.outlineSkeleton?.passed).toBe(false);
    expect(report.outlineSkeleton?.issues[0]).toContain('「节B」');
    expect(report.issues.some((issue) => issue.includes('节B'))).toBe(true);
    expect(passed).toBe(false);
  });
});

// ── 落库层：标题硬绑 ─────────────────────────────────────────────────────────

describe('ArticleStore.persistProduced：brief.title 覆盖推导标题', () => {
  function makeArticleStore(run?: RunRecord) {
    const articles = new Map<string, unknown>();
    const runStore = new MemoryRunStore();
    if (run) runStore.put(run);
    const store = new ArticleStore({
      tables: { articles: { get: (id: string) => articles.get(id), put: (id: string, r: unknown) => void articles.set(id, r), delete: (id: string) => void articles.delete(id), entries: () => [...articles.entries()] as never } } as unknown as DomainTables,
      runStore,
      serialize: async <T,>(operation: () => Promise<T>) => operation(),
      nowIso: () => '2026-08-24T00:00:00.000Z',
      getSettings: () => ({ defaultTheme: 'professional-clean' }) as unknown as SettingsRecord,
    });
    return { store, articles };
  }

  it('brief.title 存在 → 文章标题即用户给定标题', async () => {
    const run = {
      v: 1,
      id: 'run_brieftitle',
      trigger: 'manual',
      paramsSnapshot: { ...baseParams, brief: { title: '我定的标题' } },
      status: 'succeeded',
      steps: [],
      startedAt: '2026-08-24T00:00:00.000Z',
    } as RunRecord;
    const { store, articles } = makeArticleStore(run);
    const articleId = await store.persistProduced('## 推导标题会输\n正文', 'run_brieftitle');
    const record = articles.get(articleId) as { title: string };
    expect(record.title).toBe('我定的标题');
  });

  it('无 brief → 标题走成稿推导（不崩）', async () => {
    const run = {
      v: 1,
      id: 'run_notitle',
      trigger: 'manual',
      paramsSnapshot: { ...baseParams },
      status: 'succeeded',
      steps: [],
      startedAt: '2026-08-24T00:00:00.000Z',
    } as RunRecord;
    const { store, articles } = makeArticleStore(run);
    const articleId = await store.persistProduced('## 从正文推导\n正文', 'run_notitle');
    const record = articles.get(articleId) as { title: string };
    expect(record.title.length).toBeGreaterThan(0);
    expect(record.title).not.toBe('我定的标题');
  });
});
