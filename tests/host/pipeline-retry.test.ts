import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunRecord, StepRecord } from '@/host/domain';
import type { RunParams } from '@/shared/contract';
import { RunRecordSchema } from '@/host/domain';
import { RunSummarySchema } from '@/shared/contract';
import { runToSummary } from '@/host/views';
import {
  LLM_RETRY_DELAYS_MS,
  abortableSleep,
  classifyLlmFailure,
  isRetryableLlmFailure,
  llmFailureHint,
  normalizeLlmCode,
} from '@/host/pipeline/llm-retry';
import { createPipelineEngine, type PipelineLlm, type RunStore } from '@/host/pipeline/engine';

/**
 * 限流退避重试（真机 29% 的 run 死在 RATE_LIMIT）：
 * 可重试错误等 5s/15s/45s 再试；不可重试错误立刻失败并指出该改哪里；
 * 等待期 run 记录带 retry 字段供界面显示；取消必须立刻打断等待（不能等满 45 秒）。
 *
 * 全部用假定时器：真等 45 秒的测试没人会跑，且这是宿主侧行为、与真实时钟无关。
 */

type Chunk =
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'finish'; reason: { kind: 'stop' | 'error' | 'aborted'; failure?: { code: string; message: string } } };

const makeStream = (chunks: Chunk[]) =>
  (async function* () {
    for (const chunk of chunks) yield chunk;
  })();

const okStream = (text: string) => makeStream([{ type: 'text-delta', index: 0, text }, { type: 'finish', reason: { kind: 'stop' } }]);
const errorStream = (code: string, message = '供应商返回错误') =>
  makeStream([{ type: 'finish', reason: { kind: 'error', failure: { code, message } } }]);

const baseParams: RunParams = {
  topicMode: 'fixed',
  topic: 'AI 写作管线产品化',
  theme: 'professional-clean',
  imageCount: 0,
  llm: { provider: 'zhipu', model: 'glm-4.5-flash' },
};

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

function makeDeps(stream: PipelineLlm['stream']) {
  const store = new MemoryRunStore();
  return {
    store,
    deps: {
      llm: { stream },
      store,
      gates: { run: vi.fn(async (_input: { markdown: string }) => ({ passed: true, report: { strict: true } })) },
      renderer: { convert: vi.fn(() => '<section>html</section>') },
      images: { generate: vi.fn(async () => ({ bodyImageIds: [] as string[] })) },
      now: () => new Date('2026-11-16T08:00:00.000Z'),
    },
  };
}

/** 推进假时钟并让已排队的微任务跑完（一次 advance 只推进定时器，不替我们等 promise）。 */
const tick = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

function stepOf(run: RunRecord, name: string): StepRecord | undefined {
  return run.steps.find((step) => step.name === name);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('退避策略纯函数（哪些错误值得再试）', () => {
  it('大小写/连字符/空格归一化，判定不受写法影响', () => {
    expect(normalizeLlmCode(' RATE_LIMIT ')).toBe('rate_limit');
    expect(normalizeLlmCode('Rate-Limit-Exceeded')).toBe('rate_limit_exceeded');
    expect(classifyLlmFailure('RATE_LIMIT_EXCEEDED')).toBe('rate-limit');
    expect(classifyLlmFailure('llm:timeout')).toBe('timeout');
  });

  it('可重试：限流/超时/网络/过载；不可重试：鉴权/额度/未知', () => {
    for (const code of ['RATE_LIMIT', 'rate_limit_exceeded', 'TIMEOUT', 'ECONNRESET', 'network_error', 'overloaded', '503']) {
      expect(isRetryableLlmFailure(code), code).toBe(true);
    }
    for (const code of ['AUTH_FAILED', 'unauthorized', '401', 'insufficient_quota', 'billing_required', 'some_unknown_code']) {
      expect(isRetryableLlmFailure(code), code).toBe(false);
    }
  });

  it('不可重试错误的提示必须指出该改哪里（设置 → 模型服务）', () => {
    expect(llmFailureHint('AUTH_FAILED')).toContain('设置 → 模型服务');
    expect(llmFailureHint('insufficient_quota')).toContain('设置 → 模型服务');
    expect(classifyLlmFailure('overloaded')).toBe('overload');
  });

  it('abortableSleep 被中断时立刻返回 false，不等满时长', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const sleeping = abortableSleep(45_000, controller.signal);
    controller.abort();
    await expect(sleeping).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('引擎退避重试：等待 → 成功', () => {
  it('限流一次后重试成功：等待期 run.retry 可见，成功后清空', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const stream = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? errorStream('rate_limit_exceeded') : okStream('生成的正文段落');
    });
    const { deps, store } = makeDeps(stream as unknown as PipelineLlm['stream']);
    const engine = createPipelineEngine(deps);

    const { runId, done } = engine.begin({ trigger: 'manual', params: baseParams });
    await tick(0); // 第一次尝试失败 → 进入退避等待
    const waiting = store.get(runId);
    expect(waiting?.retry).toMatchObject({
      step: 'outline',
      code: 'rate_limit_exceeded',
      attempt: 1,
      maxAttempts: LLM_RETRY_DELAYS_MS.length,
      waitMs: 5_000,
    });
    // notBefore 用注入的时钟算：宿主与客户端时钟不同源，唯一可信的是 run 记录里的绝对时刻。
    expect(waiting?.retry?.notBefore).toBe('2026-11-16T08:00:05.000Z');
    expect(stepOf(waiting!, 'outline')?.status).toBe('running');

    await tick(5_000); // 睡满 5 秒 → 第二次尝试成功
    await done;

    const finished = store.get(runId);
    expect(finished?.status).toBe('succeeded');
    expect(finished?.retry).toBeUndefined();
    expect(stepOf(finished!, 'outline')?.status).toBe('succeeded');
    // outline 两次尝试 + draft 一次 = 3 次
    expect(stream).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    expect(RunRecordSchema.safeParse(finished).success).toBe(true);
  });
});

describe('引擎退避重试：不可重试错误立刻失败', () => {
  it('鉴权失败不等待，错误信息带去处提示，且从未写 retry 字段', async () => {
    vi.useFakeTimers();
    const stream = vi.fn(async () => errorStream('AUTH_FAILED', '密钥无效'));
    const { deps, store } = makeDeps(stream as unknown as PipelineLlm['stream']);
    const engine = createPipelineEngine(deps);

    const { runId, done } = engine.begin({ trigger: 'manual', params: baseParams });
    await done; // 没有任何定时器需要推进：不可重试就是立刻失败
    const run = store.get(runId);
    expect(run?.status).toBe('failed');
    expect(run?.error?.code).toBe('AUTH_FAILED');
    expect(run?.error?.message).toContain('密钥无效');
    expect(run?.error?.message).toContain('设置 → 模型服务');
    expect(run?.retry).toBeUndefined();
    expect(stream).toHaveBeenCalledTimes(1); // 只试了一次
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('引擎退避重试：耗尽三次后失败', () => {
  it('连续限流：5s/15s/45s 各等一次，第 4 次尝试仍失败即终态 failed 并说明已重试', async () => {
    vi.useFakeTimers();
    const stream = vi.fn(async () => errorStream('RATE_LIMIT', '请求过于频繁'));
    const { deps, store } = makeDeps(stream as unknown as PipelineLlm['stream']);
    const engine = createPipelineEngine(deps);

    const { runId, done } = engine.begin({ trigger: 'manual', params: baseParams });
    await tick(0);
    for (const [index, waitMs] of LLM_RETRY_DELAYS_MS.entries()) {
      expect(store.get(runId)?.retry).toMatchObject({ attempt: index + 1, waitMs });
      await tick(waitMs);
    }
    await done;

    const run = store.get(runId);
    expect(run?.status).toBe('failed');
    expect(run?.error?.code).toBe('RATE_LIMIT');
    expect(run?.error?.message).toContain('已退避重试 3 次仍失败');
    expect(stream).toHaveBeenCalledTimes(4); // 1 次原始 + 3 次重试
    expect(run?.retry).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('引擎退避重试：取消立刻打断等待', () => {
  it('等待中 cancel：不推进任何时间即到 cancelled，retry 清空', async () => {
    vi.useFakeTimers();
    const stream = vi.fn(async () => errorStream('RATE_LIMIT'));
    const { deps, store } = makeDeps(stream as unknown as PipelineLlm['stream']);
    const engine = createPipelineEngine(deps);

    const { runId, done } = engine.begin({ trigger: 'manual', params: baseParams });
    await tick(0);
    expect(store.get(runId)?.retry?.waitMs).toBe(5_000);

    expect(engine.cancel(runId)).toBe(true);
    await done; // 关键：不 advance 任何时间也必须结束——否则说明还在睡 5 秒

    const run = store.get(runId);
    expect(run?.status).toBe('cancelled');
    expect(run?.retry).toBeUndefined();
    expect(stepOf(run!, 'outline')?.status).toBe('cancelled');
    expect(stream).toHaveBeenCalledTimes(1); // 没有发起第二次尝试
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('崩溃恢复（AC-4 续跑语义不受影响）', () => {
  it('重启扫描把 running 改成 interrupted 时清掉残留的退避进度', async () => {
    const { deps, store } = makeDeps((async () => okStream('x')) as unknown as PipelineLlm['stream']);
    deps.store.put({
      v: 1,
      id: 'run_orphan1',
      trigger: 'manual',
      paramsSnapshot: baseParams,
      status: 'running',
      steps: [{ name: 'outline', status: 'running', startedAt: '2026-11-16T07:59:00.000Z' }],
      retry: { step: 'outline', code: 'RATE_LIMIT', attempt: 2, maxAttempts: 3, waitMs: 15_000, notBefore: '2026-11-16T07:59:15.000Z' },
      startedAt: '2026-11-16T07:59:00.000Z',
    });
    const engine = createPipelineEngine(deps);
    await expect(engine.resumeInterrupted()).resolves.toBe(1);
    const run = store.get('run_orphan1');
    expect(run?.status).toBe('interrupted');
    expect(run?.retry).toBeUndefined();
    expect(run?.finishedAt).toBeDefined();
  });
});

describe('retry 字段的视图投影', () => {
  it('runToSummary 在等待期带 retry，且投影通过 RunSummarySchema', () => {
    const run: RunRecord = {
      v: 1,
      id: 'run_retry01',
      trigger: 'manual',
      paramsSnapshot: baseParams,
      status: 'running',
      steps: [{ name: 'outline', status: 'running', startedAt: '2026-11-16T08:00:00.000Z' }],
      retry: {
        step: 'outline',
        code: 'RATE_LIMIT',
        attempt: 2,
        maxAttempts: 3,
        waitMs: 15_000,
        notBefore: '2026-11-16T08:00:15.000Z',
      },
      startedAt: '2026-11-16T08:00:00.000Z',
    };
    const summary = runToSummary(run);
    expect(summary.retry).toEqual(run.retry);
    expect(RunSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('无 retry 的 run 投影不带该键（界面据此判断不显示那一行）', () => {
    const run: RunRecord = {
      v: 1,
      id: 'run_retry02',
      trigger: 'manual',
      paramsSnapshot: baseParams,
      status: 'running',
      steps: [{ name: 'topic', status: 'running', startedAt: '2026-11-16T08:00:00.000Z' }],
      startedAt: '2026-11-16T08:00:00.000Z',
    };
    expect('retry' in runToSummary(run)).toBe(false);
  });
});
