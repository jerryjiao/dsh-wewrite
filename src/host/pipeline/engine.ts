/**
 * 管线引擎（架构 §3 / ADR-003）：run 生命周期 + AbortSignal 贯穿 + 六步骤编排。
 * 步骤序列锁定：topic -> outline -> draft -> gates -> render -> images。
 * 未执行步骤 status='pending'（六步始终全列出）；images 是降级步——全失败时该步
 * failed 但 run 仍 succeeded（AC-9 无图推进）；gates 失败则 run failed（AC-4 阻断）。
 */

import { randomUUID } from 'node:crypto';
import type { RunParams } from '../../shared/contract';
import type { RunRecord, StepRecord } from '../domain';
import { draftUserPrompt, outlineUserPrompt, pipelineSystemPrompt, streamLlmText, type PipelineLlm } from './llm';

export type { LlmStreamOptions, PipelineLlm, PipelineLlmChunk } from './llm';

export const PIPELINE_STEP_NAMES = ['topic', 'outline', 'draft', 'gates', 'render', 'images'] as const;
export type PipelineStepName = (typeof PIPELINE_STEP_NAMES)[number];

export interface RunStore {
  put(run: RunRecord): void;
  get(runId: string): RunRecord | undefined;
  update(runId: string, patch: (run: RunRecord) => RunRecord): void;
  all(): RunRecord[];
}

export interface TopicSource {
  fetch(limit: number): Promise<readonly { title: string; url: string; source: string; rank: number }[]>;
}

export interface GatesRunner {
  run(input: { markdown: string }): Promise<{ passed: boolean; report: unknown }>;
}

export interface Renderer {
  convert(input: { markdown: string; theme?: string }): string;
}

export interface ImagesGenerator {
  /** articleId 为 render 步落库的文章 id（供 ImageRecord 溯源与回绑）。 */
  generate(input: { count: number; articleId?: string }): Promise<{ coverImageId?: string; bodyImageIds: string[] }>;
}

export interface PipelineDeps {
  readonly llm: PipelineLlm;
  readonly store: RunStore;
  readonly topicSource?: TopicSource;
  readonly gates: GatesRunner;
  readonly renderer: Renderer;
  readonly images: ImagesGenerator;
  readonly now?: () => Date;
  /** 渲染完成后回调（service 层把成稿落 article 记录）；返回文章 id 供后续回绑。 */
  readonly onProduced?: (output: { markdown: string; runId: string }) => Promise<string | void>;
  /** images 步完成后回调（封面/正文图回写文章，P0-1：推送核心流绑定链）。 */
  readonly onImagesBound?: (output: {
    readonly articleId: string;
    readonly coverImageId?: string;
    readonly bodyImageIds: readonly string[];
  }) => Promise<void>;
}

export interface StartOptions {
  readonly trigger: 'manual' | 'schedule';
  readonly params: RunParams;
  readonly scheduleId?: string;
  readonly articleId?: string;
  readonly signal?: AbortSignal;
}

export interface PipelineEngine {
  start(opts: StartOptions): Promise<string>;
  /** 立即取 runId，终态 promise 由调用方决定是否等待（RPC run/start 语义）。 */
  begin(opts: StartOptions): { runId: string; done: Promise<string> };
  cancel(runId: string): boolean;
  /** chat-integration M1：等指定 run 到终态并 resolve RunRecord；未知 runId → undefined（不挂起不抛错）。 */
  awaitDone(runId: string): Promise<RunRecord | undefined>;
  resumeInterrupted(): Promise<number>;
}

export class PipelineStepError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PipelineStepError';
  }
}

/** 终态集合（修剪与恢复扫描共用）。 */
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

/** 修剪 run 历史（Spec §6 runs 约束）：活跃记录全保留，终态记录按完成时间新→旧截取 limit 条。 */
export function pruneTerminalRuns(runs: readonly RunRecord[], limit: number): RunRecord[] {
  const active = runs.filter((run) => !TERMINAL_STATUSES.has(run.status));
  const terminal = runs
    .filter((run) => TERMINAL_STATUSES.has(run.status))
    .sort((left, right) => Date.parse(right.finishedAt ?? right.startedAt) - Date.parse(left.finishedAt ?? left.startedAt));
  return [...active, ...terminal.slice(0, Math.max(0, limit))];
}

export function createPipelineEngine(deps: PipelineDeps): PipelineEngine {
  const nowIso = () => (deps.now ? deps.now().toISOString() : new Date().toISOString());
  const controllers = new Map<string, AbortController>();
  const completionWaiters = new Map<string, Set<(record: RunRecord | undefined) => void>>();
  const ABORT_SENTINEL = Symbol('wewrite-abort');
  function throwAborted(): never {
    throw ABORT_SENTINEL;
  }

  function patchStep(runId: string, name: PipelineStepName, patch: Partial<StepRecord>): void {
    deps.store.update(runId, (run) => ({
      ...run,
      steps: run.steps.map((step) => (step.name === name ? { ...step, ...patch } : step)),
    }));
  }

  /** LLM 步的供应商/模型（GenerateOptions 必填）：service 已把 settings.llmDefault 合并进 params.llm。 */
  function resolveLlmCall(params: RunParams): { provider: string; model: string } {
    const merged = (params.llm ?? {}) as { provider?: string; model?: string };
    if (!merged.provider || !merged.model) {
      throw new PipelineStepError(
        'llm-not-configured',
        '模型服务未配置：请在 设置 → 模型服务 选择供应商与模型后再运行管线',
      );
    }
    return { provider: merged.provider, model: merged.model };
  }

  async function execute(runId: string, opts: StartOptions, signal: AbortSignal): Promise<void> {
    const { params } = opts;
    deps.store.update(runId, (run) => ({ ...run, status: 'running' }));
    let topic = '';
    let outline = '';
    let draft = '';
    let producedArticleId: string | undefined;
    let runStatus: 'succeeded' | 'failed' | 'cancelled' = 'succeeded';
    let runError: { code: string; message: string } | undefined;
    let imagesResult: { coverImageId?: string; bodyImageIds: string[] } | undefined;

    const finishRun = (status: RunRecord['status'], error?: { code: string; message: string }) => {
      deps.store.update(runId, (run) => ({
        ...run,
        status,
        ...(error ? { error } : {}),
        finishedAt: nowIso(),
      }));
    };

    for (const stepName of PIPELINE_STEP_NAMES) {
      if (signal.aborted) {
        runStatus = 'cancelled';
        break;
      }
      const startedAt = nowIso();
      patchStep(runId, stepName, { status: 'running', startedAt });
      try {
        if (stepName === 'topic') {
          if (params.topicMode === 'hotspots') {
            if (!deps.topicSource) throw new PipelineStepError('topic-source-missing', '热榜源未装配，无法以热榜模式选题');
            const items = await deps.topicSource.fetch(20);
            const first = items[0];
            if (!first) throw new PipelineStepError('topic-empty', '热榜源全部为空，本次运行无题可选');
            topic = first.title;
            patchStep(runId, stepName, { metrics: { topicSource: first.source, topicUrl: first.url } });
          } else {
            if (!params.topic) throw new PipelineStepError('topic-missing', '固定选题模式下 topic 不能为空');
            topic = params.topic;
          }
        } else if (stepName === 'outline') {
          const llmCall = resolveLlmCall(params);
          const outcome = await streamLlmText(
            deps.llm,
            { purpose: 'wewrite-pipeline', system: pipelineSystemPrompt(), user: outlineUserPrompt(topic), ...llmCall },
            signal,
          );
          if (outcome.status === 'aborted') throwAborted();
          if (outcome.status === 'error') throw new PipelineStepError(outcome.code, outcome.message);
          outline = outcome.text;
          patchStep(runId, stepName, { metrics: { chars: outline.length } });
        } else if (stepName === 'draft') {
          const llmCall = resolveLlmCall(params);
          const outcome = await streamLlmText(
            deps.llm,
            { purpose: 'wewrite-pipeline', system: pipelineSystemPrompt(), user: draftUserPrompt(topic, outline), ...llmCall },
            signal,
          );
          if (outcome.status === 'aborted') throwAborted();
          if (outcome.status === 'error') throw new PipelineStepError(outcome.code, outcome.message);
          draft = outcome.text;
          patchStep(runId, stepName, { metrics: { chars: draft.length } });
        } else if (stepName === 'gates') {
          const verdict = await deps.gates.run({ markdown: draft });
          patchStep(runId, stepName, { metrics: { report: verdict.report } });
          if (!verdict.passed) {
            throw new PipelineStepError('gates-failed', '质量门禁未通过，默认推送路径已被阻断', verdict.report);
          }
        } else if (stepName === 'render') {
          const html = deps.renderer.convert({ markdown: draft, theme: params.theme });
          patchStep(runId, stepName, { metrics: { htmlChars: html.length } });
          if (deps.onProduced) {
            const returnedArticleId = await deps.onProduced({ markdown: draft, runId });
            if (typeof returnedArticleId === 'string' && returnedArticleId) producedArticleId = returnedArticleId;
          }
        } else {
          const count = params.imageCount ?? 0;
          if (count > 0) {
            imagesResult = await deps.images.generate({
              count,
              ...(producedArticleId ? { articleId: producedArticleId } : {}),
            });
            patchStep(runId, stepName, {
              metrics: {
                coverImageId: imagesResult.coverImageId,
                bodyImageCount: imagesResult.bodyImageIds.length,
              },
            });
            if (producedArticleId && deps.onImagesBound && (imagesResult.coverImageId || imagesResult.bodyImageIds.length)) {
              await deps.onImagesBound({
                articleId: producedArticleId,
                ...(imagesResult.coverImageId ? { coverImageId: imagesResult.coverImageId } : {}),
                bodyImageIds: imagesResult.bodyImageIds,
              });
            }
          } else {
            patchStep(runId, stepName, { metrics: { skipped: 'imageCount=0' } });
          }
        }
        patchStep(runId, stepName, { status: 'succeeded', finishedAt: nowIso() });
      } catch (thrown) {
        if (thrown === ABORT_SENTINEL || signal.aborted) {
          patchStep(runId, stepName, { status: 'cancelled', finishedAt: nowIso() });
          runStatus = 'cancelled';
          break;
        }
        const code = thrown instanceof PipelineStepError ? thrown.code : 'step-error';
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        patchStep(runId, stepName, {
          status: 'failed',
          finishedAt: nowIso(),
          error: { code, message },
        });
        if (stepName === 'images') {
          // AC-9：图片步全失败可无图推进——run 仍 succeeded，不设 run 级 error。
          continue;
        }
        runStatus = 'failed';
        runError = { code, message };
        break;
      }
    }

    finishRun(runStatus, runError);
    controllers.delete(runId);
  }

  const begin = (opts: StartOptions): { runId: string; done: Promise<string> } => {
    const runId = `run_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const controller = new AbortController();
    controllers.set(runId, controller);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const run: RunRecord = {
      v: 1,
      id: runId,
      trigger: opts.trigger,
      ...(opts.scheduleId ? { scheduleId: opts.scheduleId } : {}),
      ...(opts.articleId ? { articleId: opts.articleId } : {}),
      paramsSnapshot: opts.params,
      status: 'queued',
      steps: PIPELINE_STEP_NAMES.map((name) => ({ name, status: 'pending' as const })),
      startedAt: nowIso(),
    };
    deps.store.put(run);
    const done = execute(runId, opts, controller.signal).then(() => {
      const record = deps.store.get(runId);
      const waiters = completionWaiters.get(runId);
      completionWaiters.delete(runId);
      if (waiters) for (const resolve of waiters) resolve(record);
      return runId;
    });
    return { runId, done };
  };

  function awaitDone(runId: string): Promise<RunRecord | undefined> {
    const current = deps.store.get(runId);
    if (!current || TERMINAL_STATUSES.has(current.status)) return Promise.resolve(current);
    const waiters = completionWaiters.get(runId) ?? new Set<(record: RunRecord | undefined) => void>();
    completionWaiters.set(runId, waiters);
    return new Promise((resolve) => {
      waiters.add(resolve);
    });
  }

  const api: PipelineEngine = {
    begin,
    start: (opts: StartOptions): Promise<string> => begin(opts).done,
    awaitDone,

    cancel(runId: string): boolean {
      const controller = controllers.get(runId);
      const run = deps.store.get(runId);
      if (!controller || !run) return false;
      if (run.status !== 'running' && run.status !== 'queued') return false;
      controller.abort();
      return true;
    },

    async resumeInterrupted(): Promise<number> {
      let recovered = 0;
      for (const run of deps.store.all()) {
        if (run.status !== 'running' && run.status !== 'queued') continue;
        deps.store.update(run.id, (current) => ({ ...current, status: 'interrupted', finishedAt: nowIso() }));
        recovered += 1;
      }
      return recovered;
    },
  };
  return api;
}
