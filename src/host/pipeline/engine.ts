/**
 * 管线引擎（架构 §3 / ADR-003）：run 生命周期 + AbortSignal 贯穿 + 六步骤编排。
 * 步骤序列锁定：topic -> outline -> draft -> gates -> render -> images。
 * 未执行步骤 status='pending'（六步始终全列出）；images 是降级步——全失败时该步
 * failed 但 run 仍 succeeded（AC-9 无图推进）；gates 失败则 run failed（AC-4 阻断）。
 */

import { randomUUID } from 'node:crypto';
import type { RunRecord, StepRecord } from '../domain';
import { PipelineStepError, PIPELINE_ABORT } from './errors';
import { TERMINAL_STATUSES } from './prune';
import { briefUserText, generateDraft, generateOutline, type TextStepDeps } from './steps/text';
import { PIPELINE_STEP_NAMES, type PipelineDeps, type PipelineEngine, type PipelineStepName, type StartOptions } from './types';

export { PipelineStepError } from './errors';
export { pruneTerminalRuns } from './prune';
export * from './types';
export type { LlmStreamOptions, PipelineLlm, PipelineLlmChunk } from './llm';

export function createPipelineEngine(deps: PipelineDeps): PipelineEngine {
  const nowIso = () => (deps.now ? deps.now().toISOString() : new Date().toISOString());
  const controllers = new Map<string, AbortController>();
  const completionWaiters = new Map<string, Set<(record: RunRecord | undefined) => void>>();

  function patchStep(runId: string, name: PipelineStepName, patch: Partial<StepRecord>): void {
    deps.store.update(runId, (run) => ({
      ...run,
      steps: run.steps.map((step) => (step.name === name ? { ...step, ...patch } : step)),
    }));
  }

  /** 清掉退避字段：等待结束、成功、失败都要清——残留会让界面在跑完之后还显示「重试中」。 */
  function clearRetry(runId: string): void {
    deps.store.update(runId, (run) => {
      if (!run.retry) return run;
      const next: RunRecord = { ...run };
      delete next.retry;
      return next;
    });
  }

  /** LLM 文本步的退避进度回调：等待期落库 run.retry，界面据此显示「第 N/3 次重试」。 */
  function textDeps(stepName: PipelineStepName, signal: AbortSignal, runId: string): TextStepDeps {
    return {
      llm: deps.llm,
      signal,
      now: () => (deps.now ? deps.now() : new Date()),
      onRetryWait: (notice) => {
        deps.store.update(runId, (run) => ({ ...run, retry: { step: stepName, ...notice } }));
      },
      onRetryEnd: () => clearRetry(runId),
    };
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
          const { text, skeletonApplied } = await generateOutline(textDeps(stepName, signal, runId), { params, topic });
          outline = text;
          patchStep(runId, stepName, {
            metrics: { chars: outline.length, ...(skeletonApplied ? { skeletonPreserved: true } : {}) },
          });
        } else if (stepName === 'draft') {
          draft = await generateDraft(textDeps(stepName, signal, runId), { params, topic, outline });
          patchStep(runId, stepName, { metrics: { chars: draft.length } });
        } else if (stepName === 'gates') {
          const brief = params.brief;
          const verdict = await deps.gates.run({
            markdown: draft,
            ...(brief?.sources?.length
              ? {
                  sources: brief.sources,
                  userText: briefUserText(topic, brief),
                }
              : {}),
            ...(brief?.outline?.length ? { outlineSkeleton: brief.outline } : {}),
          });
          patchStep(runId, stepName, { metrics: { report: verdict.report } });
          if (!verdict.passed) {
            const issues = (verdict.report as { issues?: unknown }).issues;
            const summary =
              Array.isArray(issues) && issues.length
                ? `质量门禁未通过：${issues.slice(0, 3).map(String).join('；')}${issues.length > 3 ? ' 等' : ''}`
                : '质量门禁未通过，默认推送路径已被阻断';
            throw new PipelineStepError('gates-failed', summary, verdict.report);
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
        if (thrown === PIPELINE_ABORT || signal.aborted) {
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

    clearRetry(runId);
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
        // 崩溃恢复：状态改成 interrupted 时同时清掉退避字段——那是上一个进程留下的等待进度，
        // 留着会让重启后的界面显示「正在重试」而实际没有任何重试在发生。
        deps.store.update(run.id, (current) => {
          const next: RunRecord = { ...current, status: 'interrupted', finishedAt: nowIso() };
          delete next.retry;
          return next;
        });
        recovered += 1;
      }
      return recovered;
    },
  };
  return api;
}
