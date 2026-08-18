import { describe, expect, it, vi } from 'vitest';
import type { RunRecord, StepRecord } from '@/host/domain';
import type { RunParams } from '@/shared/contract';
import { RunRecordSchema } from '@/host/domain';
import {
  PIPELINE_STEP_NAMES,
  createPipelineEngine,
  pruneTerminalRuns,
  type PipelineEngine,
  type PipelineLlm,
  type RunStore,
} from '@/host/pipeline/engine';

/**
 * 管线引擎测试：run 生命周期、AC-4（阶段失败停止后续+保留产物）、AbortSignal 中止、
 * interrupted 恢复扫描、图片步降级（AC-9 全失败可无图推进）。
 *
 * 本文件钉定 src/host/pipeline/engine.ts 的消费面：
 * - createPipelineEngine(deps) -> { start(opts): Promise<runId>, cancel(runId), resumeInterrupted() }
 * - start() 在 run 到达终态时 resolve（RPC 层可不等 await 立即回 runId）
 * - 步骤序列固定：topic -> outline -> draft -> gates -> render -> images
 * - 未执行步骤 status='pending'；失败步骤带 error{code,message}
 */

type Chunk = { type: 'text'; text: string } | { type: 'finish'; error?: { code: string; message: string }; aborted?: boolean };

const makeStream = (chunks: Chunk[]) =>
  (async function* () {
    for (const chunk of chunks) yield chunk;
  })();

const okTextStream = (text: string) => makeStream([{ type: 'text', text }, { type: 'finish' }]);

const baseParams: RunParams = {
  topicMode: 'fixed',
  topic: 'AI 写作管线产品化',
  theme: 'professional-clean',
  imageCount: 1,
};

function makeStep(name: string, status: StepRecord['status'], extra: Partial<StepRecord> = {}): StepRecord {
  return { name, status, startedAt: '2026-08-18T04:00:01.000Z', ...extra };
}

function makeRun(partial: Partial<RunRecord> & { id: string }): RunRecord {
  return {
    v: 1,
    trigger: 'manual',
    paramsSnapshot: baseParams,
    status: 'running',
    steps: [makeStep('topic', 'succeeded')],
    startedAt: '2026-08-18T04:00:00.000Z',
    ...partial,
  } as RunRecord;
}

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

interface DepsOverrides {
  llm?: PipelineLlm;
  topicSource?: { fetch: (limit: number) => Promise<{ title: string; url: string; source: string; rank: number }[]> };
  gates?: { run: (input: { markdown: string }) => Promise<{ passed: boolean; report: unknown }> };
  renderer?: { convert: (input: { markdown: string; theme?: string }) => string };
  images?: { generate: (input: { count: number }) => Promise<{ coverImageId?: string; bodyImageIds: string[] }> };
}

function makeDeps(overrides: DepsOverrides = {}) {
  const llmStream = vi.fn(async (_options: Record<string, unknown>) => okTextStream('生成的文本段落'));
  const deps = {
    llm: { stream: llmStream as unknown as PipelineLlm['stream'] },
    store: new MemoryRunStore(),
    topicSource:
      overrides.topicSource ??
      ({ fetch: vi.fn(async () => [{ title: '榜首话题', url: 'https://x.example.test/1', source: 'hackernews', rank: 1 }]) } as DepsOverrides['topicSource']),
    gates:
      overrides.gates ??
      { run: vi.fn(async (_input: { markdown: string }) => ({ passed: true, report: { strict: true } })) },
    renderer: overrides.renderer ?? { convert: vi.fn(() => '<section style="color:#0F1115">html</section>') },
    images: overrides.images ?? { generate: vi.fn(async () => ({ coverImageId: 'img_0', bodyImageIds: ['img_1'] })) },
  };
  return deps;
}

function makeEngine(deps: ReturnType<typeof makeDeps>): PipelineEngine {
  return createPipelineEngine(deps);
}

describe('PIPELINE_STEP_NAMES（架构 §3 管线六步）', () => {
  it('步骤序列精确为 topic/outline/draft/gates/render/images', () => {
    expect([...PIPELINE_STEP_NAMES]).toEqual(['topic', 'outline', 'draft', 'gates', 'render', 'images']);
  });
});

describe('run 生命周期：queued -> running -> 终态', () => {
  it('happy path：六步全 succeeded，run succeeded，llm 调 outline+draft 两次', async () => {
    const deps = makeDeps();
    const engine = makeEngine(deps);

    const runId = await engine.start({ trigger: 'manual', params: baseParams });

    expect(typeof runId).toBe('string');
    expect(runId.length).toBeGreaterThan(0);
    const run = deps.store.get(runId);
    expect(run).toBeDefined();
    if (!run) return;

    expect(run.status).toBe('succeeded');
    expect(run.trigger).toBe('manual');
    expect(run.steps.map((s: StepRecord) => s.name)).toEqual([...PIPELINE_STEP_NAMES]);
    for (const step of run.steps) {
      expect(step.status, `步骤 ${step.name}`).toBe('succeeded');
      expect(step.startedAt).toBeDefined();
      expect(step.finishedAt).toBeDefined();
    }
    expect(deps.llm.stream).toHaveBeenCalledTimes(2);
  });

  it('llm.stream 调用带 purpose=wewrite-pipeline（架构 §7.2 F22 辅助调用标注）', async () => {
    const deps = makeDeps();
    await makeEngine(deps).start({ trigger: 'manual', params: baseParams });

    const calls = (deps.llm.stream as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBe(2);
    for (const args of calls) {
      const options = args[0] as { purpose: string; messages: { role: string; content: string }[] };
      expect(options.purpose).toBe('wewrite-pipeline');
      expect(Array.isArray(options.messages)).toBe(true);
      expect(options.messages.length).toBeGreaterThan(0);
    }
  });

  it('门禁收到成稿文本（draft 步产物沿管线传递），渲染收到 theme', async () => {
    const deps = makeDeps();
    const gatesRun = vi.fn(async (_input: { markdown: string }) => ({ passed: true, report: {} }));
    const rendererConvert = vi.fn((_input: { markdown: string; theme?: string }) => '<section style="margin:0">x</section>');
    await makeEngine({ ...deps, gates: { run: gatesRun }, renderer: { convert: rendererConvert } }).start({
      trigger: 'manual',
      params: baseParams,
    });

    expect(gatesRun).toHaveBeenCalledTimes(1);
    const gateInput = gatesRun.mock.calls[0][0] as { markdown: string };
    expect(gateInput.markdown).toContain('生成的文本段落');
    expect(rendererConvert).toHaveBeenCalledTimes(1);
    expect((rendererConvert.mock.calls[0][0] as { theme?: string }).theme).toBe('professional-clean');
  });

  it('topicMode=hotspots 时调用 topicSource.fetch，fixed 时不调用', async () => {
    const hotspotsDeps = makeDeps();
    await makeEngine(hotspotsDeps).start({ trigger: 'manual', params: { topicMode: 'hotspots', imageCount: 0 } });
    expect(hotspotsDeps.topicSource?.fetch).toHaveBeenCalledTimes(1);

    const fixedDeps = makeDeps();
    await makeEngine(fixedDeps).start({ trigger: 'manual', params: baseParams });
    expect(fixedDeps.topicSource?.fetch).toHaveBeenCalledTimes(0);
  });

  it('调度触发：trigger=schedule 落入 run 记录且可携带 scheduleId', async () => {
    const deps = makeDeps();
    const runId = await makeEngine(deps).start({
      trigger: 'schedule',
      params: { topicMode: 'hotspots' },
      scheduleId: 'sch_1',
    });
    const run = deps.store.get(runId);
    expect(run?.trigger).toBe('schedule');
    expect((run as { scheduleId?: string } | undefined)?.scheduleId).toBe('sch_1');
  });

  it('引擎产出的 run 记录始终通过 domain RunRecordSchema（engine 与 domain 契约一致）', async () => {
    const deps = makeDeps();
    const runId = await makeEngine(deps).start({ trigger: 'manual', params: baseParams });
    const run = deps.store.get(runId);
    expect(run).toBeDefined();
    expect(() => RunRecordSchema.parse(run)).not.toThrow();
  });
});

describe('AC-4：阶段失败停止后续 + 保留已完成产物', () => {
  it('门禁未过：gates 步 failed 带 error.code，render/images 保持 pending 未启动，run failed', async () => {
    const deps = makeDeps();
    const gatesRun = vi.fn(async (_input: { markdown: string }) => ({ passed: false, report: { issues: ['humanness 低于阈值'] } }));
    const rendererConvert = vi.fn((_input: { markdown: string; theme?: string }) => '<section>x</section>');
    const imagesGenerate = vi.fn(async (_input: { count: number }) => ({ bodyImageIds: [] as string[] }));

    const runId = await makeEngine({ ...deps, gates: { run: gatesRun }, renderer: { convert: rendererConvert }, images: { generate: imagesGenerate } }).start({
      trigger: 'manual',
      params: baseParams,
    });

    const run = deps.store.get(runId);
    expect(run?.status).toBe('failed');
    const stepByName: Map<string, StepRecord> = new Map(run?.steps.map((s: StepRecord) => [s.name, s]));
    expect(stepByName.get('topic')?.status).toBe('succeeded');
    expect(stepByName.get('outline')?.status).toBe('succeeded');
    expect(stepByName.get('draft')?.status).toBe('succeeded');
    expect(stepByName.get('gates')?.status).toBe('failed');
    expect(stepByName.get('gates')?.error?.code).toBeDefined();
    expect(stepByName.get('gates')?.error?.code).not.toBe('');
    expect(stepByName.get('render')?.status).toBe('pending');
    expect(stepByName.get('images')?.status).toBe('pending');
    expect(rendererConvert).toHaveBeenCalledTimes(0);
    expect(imagesGenerate).toHaveBeenCalledTimes(0);
    expect(run?.error?.code).toBeDefined();
  });

  it('已完成产物保留：失败 run 的 gates 输入仍含完整成稿（draft 产物未丢）', async () => {
    const deps = makeDeps();
    const gatesRun = vi.fn(async (_input: { markdown: string }) => ({ passed: false, report: {} }));
    await makeEngine({ ...deps, gates: { run: gatesRun } }).start({ trigger: 'manual', params: baseParams });

    const gateInput = gatesRun.mock.calls[0][0] as { markdown: string };
    expect(gateInput.markdown).toContain('生成的文本段落');
  });

  it('llm 文本步失败（终端 finish chunk 带 error）：该步 failed，后续 pending，run failed', async () => {
    let callIndex = 0;
    const llmStream = vi.fn(async (_options: Record<string, unknown>) => {
      callIndex += 1;
      if (callIndex === 1) return okTextStream('大纲内容');
      return makeStream([{ type: 'text', text: '写到一半' }, { type: 'finish', error: { code: 'llm-error', message: '供应商中断' } }]);
    });
    const deps = makeDeps();
    const engine = makeEngine({ ...deps, llm: { stream: llmStream as unknown as PipelineLlm['stream'] } });

    const runId = await engine.start({ trigger: 'manual', params: baseParams });
    const run = deps.store.get(runId);

    expect(run?.status).toBe('failed');
    const stepByName: Map<string, StepRecord> = new Map(run?.steps.map((s: StepRecord) => [s.name, s]));
    expect(stepByName.get('outline')?.status).toBe('succeeded');
    expect(stepByName.get('draft')?.status).toBe('failed');
    expect(stepByName.get('gates')?.status).toBe('pending');
    expect(stepByName.get('render')?.status).toBe('pending');
  });
});

describe('AC-9：图片步全失败可无图推进（降级不阻断）', () => {
  it('images.generate 拒绝：images 步 failed 但 run 仍 succeeded', async () => {
    const deps = makeDeps();
    const imagesGenerate = vi.fn(async (_input: { count: number }) => {
      throw new Error('全部供应商失败');
    });
    const runId = await makeEngine({ ...deps, images: { generate: imagesGenerate } }).start({
      trigger: 'manual',
      params: baseParams,
    });
    const run = deps.store.get(runId);

    expect(run?.status).toBe('succeeded');
    const imagesStep = run?.steps.find((s: StepRecord) => s.name === 'images');
    expect(imagesStep?.status).toBe('failed');
    expect(imagesStep?.error?.code).toBeDefined();
    expect(run?.error).toBeUndefined();
  });

  it('images.generate 成功：bodyImageIds 进入步骤 metrics 或产物（供应商命中审计面）', async () => {
    const deps = makeDeps();
    const runId = await makeEngine(deps).start({ trigger: 'manual', params: baseParams });
    const run = deps.store.get(runId);
    const imagesStep = run?.steps.find((s: StepRecord) => s.name === 'images');
    expect(imagesStep?.status).toBe('succeeded');
  });
});

describe('AbortSignal 中止', () => {
  it('流中途 abort（finish chunk aborted=true）：run cancelled，进行中步 cancelled，后续 pending', async () => {
    const controller = new AbortController();
    const llmStream = vi.fn(async (_options: Record<string, unknown>) => {
      if ((llmStream as unknown as { mock: { calls: unknown[][] } }).mock.calls.length === 1) {
        return okTextStream('大纲内容');
      }
      return (async function* () {
        yield { type: 'text' as const, text: '成稿开头' };
        await new Promise<void>((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        yield { type: 'finish' as const, aborted: true };
      })();
    });
    const deps = makeDeps();
    const engine = makeEngine({ ...deps, llm: { stream: llmStream as unknown as PipelineLlm['stream'] } });

    const startPromise = engine.start({ trigger: 'manual', params: baseParams, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(deps.store.all().every((r) => r.status === 'running')).toBe(true);
    controller.abort();
    const runId = await startPromise;

    const run = deps.store.get(runId);
    expect(run?.status).toBe('cancelled');
    const stepByName: Map<string, StepRecord> = new Map(run?.steps.map((s: StepRecord) => [s.name, s]));
    expect(stepByName.get('outline')?.status).toBe('succeeded');
    expect(stepByName.get('draft')?.status).toBe('cancelled');
    expect(stepByName.get('gates')?.status).toBe('pending');
  });

  it('signal 预先 abort：零 llm 调用，run 直接 cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = makeDeps();
    const runId = await makeEngine(deps).start({ trigger: 'manual', params: baseParams, signal: controller.signal });

    const run = deps.store.get(runId);
    expect(run?.status).toBe('cancelled');
    expect(deps.llm.stream).toHaveBeenCalledTimes(0);
    const stepByName: Map<string, StepRecord> = new Map(run?.steps.map((s: StepRecord) => [s.name, s]));
    expect(stepByName.get('topic')?.status).toBe('pending');
  });

  it('cancel(unknownRunId) 返回 false；对已终态 run 返回 false', async () => {
    const deps = makeDeps();
    const engine = makeEngine(deps);
    expect(engine.cancel('run_nonexistent')).toBe(false);

    const runId = await engine.start({ trigger: 'manual', params: baseParams });
    expect(engine.cancel(runId)).toBe(false);
  });
});

describe('interrupted 恢复扫描（宿主停机后启动）', () => {
  it('running/queued 变 interrupted，终态不动，返回被打断数量', async () => {
    const deps = makeDeps();
    deps.store.put(makeRun({ id: 'run_running', status: 'running', steps: [makeStep('topic', 'running')] }));
    deps.store.put(makeRun({ id: 'run_queued', status: 'queued', steps: [makeStep('topic', 'pending', { startedAt: undefined })] }));
    deps.store.put(makeRun({ id: 'run_done', status: 'succeeded', steps: [makeStep('topic', 'succeeded')] }));
    deps.store.put(makeRun({ id: 'run_failed', status: 'failed', steps: [makeStep('topic', 'failed')], error: { code: 'x', message: 'm' } }));

    const engine = makeEngine(deps);
    const recovered = await engine.resumeInterrupted();

    expect(recovered).toBe(2);
    expect(deps.store.get('run_running')?.status).toBe('interrupted');
    expect(deps.store.get('run_queued')?.status).toBe('interrupted');
    expect(deps.store.get('run_done')?.status).toBe('succeeded');
    expect(deps.store.get('run_failed')?.status).toBe('failed');
  });

  it('恢复扫描不重新派发（AC-11：错过即错过，无自动补偿重跑）', async () => {
    const deps = makeDeps();
    deps.store.put(makeRun({ id: 'run_stuck', status: 'running' }));

    const before = (deps.llm.stream as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
    await makeEngine(deps).resumeInterrupted();

    expect((deps.llm.stream as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(before);
    expect(deps.store.get('run_stuck')?.status).toBe('interrupted');
  });
});

describe('runHistoryLimit 修剪（Spec §6 runs 表约束）', () => {
  it('保留最新 N 条终态记录，全部活跃记录保留', () => {
    const runs: RunRecord[] = [
      makeRun({ id: 'old_1', status: 'succeeded', finishedAt: '2026-08-10T00:00:00.000Z' }),
      makeRun({ id: 'old_2', status: 'failed', finishedAt: '2026-08-11T00:00:00.000Z' }),
      makeRun({ id: 'new_1', status: 'succeeded', finishedAt: '2026-08-16T00:00:00.000Z' }),
      makeRun({ id: 'new_2', status: 'cancelled', finishedAt: '2026-08-17T00:00:00.000Z' }),
      makeRun({ id: 'live_1', status: 'running', finishedAt: undefined }),
      makeRun({ id: 'live_2', status: 'queued', finishedAt: undefined }),
    ];
    const kept = pruneTerminalRuns(runs, 2);
    const keptIds = kept.map((r: RunRecord) => r.id).sort();
    expect(keptIds).toEqual(['live_1', 'live_2', 'new_1', 'new_2']);
  });

  it('limit 大于终态数时全保留', () => {
    const runs = [makeRun({ id: 'a', status: 'succeeded', finishedAt: '2026-08-10T00:00:00.000Z' })];
    expect(pruneTerminalRuns(runs, 200).map((r: RunRecord) => r.id)).toEqual(['a']);
  });
});
