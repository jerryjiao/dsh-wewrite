/**
 * 文本步（outline / draft）：一次生成 + 两层重试。
 *
 * 为什么单独成文件：engine 只该管编排（六步、状态机、合法终态），而「怎么拿到一段文本」
 * 要处理两件彼此无关的事——供应商暂时性故障（退避重试）与模型没照骨架写（带反馈重写一次）。
 * 混在 engine 的 for 循环里，两套 attempt 计数会被读错。
 */

import type { RunParams } from '../../../shared/contract';
import { PipelineStepError, PIPELINE_ABORT } from '../errors';
import {
  draftUserPrompt,
  outlineUserPrompt,
  pipelineSystemPrompt,
  streamLlmText,
  stripOuterFence,
  type LlmStreamOptions,
  type PipelineLlm,
} from '../llm';
import { LLM_RETRY_DELAYS_MS, abortableSleep, isRetryableLlmFailure, llmFailureHint } from '../llm-retry';
import { findInventedUrls, isSourceUrlVisible } from './gates';

/** 一次等待的可观测事实（engine 把它写进 run 记录，界面据此显示进度）。 */
export interface LlmRetryNotice {
  readonly code: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly waitMs: number;
  readonly notBefore: string;
}

export interface TextStepDeps {
  readonly llm: PipelineLlm;
  readonly signal: AbortSignal;
  /** 注入时钟：等待结束时刻要写进 run 记录，测试里不能依赖真实 time。 */
  readonly now: () => Date;
  /** 进入等待前回调（engine 落库 retry 字段）。 */
  readonly onRetryWait?: (notice: LlmRetryNotice) => void;
  /** 等待结束（睡满或被中断）后回调（engine 清掉 retry 字段）。 */
  readonly onRetryEnd?: () => void;
}

/** draft 自愈与 gates 来源门禁共用的用户原文（其中的 URL 视为已授权）。 */
export function briefUserText(topic: string, brief: RunParams['brief']): string[] {
  return [
    topic,
    ...(brief?.title ? [brief.title] : []),
    ...(brief?.approach ? [brief.approach] : []),
    ...(brief?.outline ?? []),
  ];
}

/** LLM 步的供应商/模型（GenerateOptions 必填）：service 已把 settings.llmDefault 合并进 params.llm。 */
function resolveLlmCall(params: RunParams): { provider: string; model: string } {
  const merged = (params.llm ?? {}) as { provider?: string; model?: string };
  if (!merged.provider || !merged.model) {
    throw new PipelineStepError('llm-not-configured', '模型服务未配置：请在 设置 → 模型服务 选择供应商与模型后再运行管线');
  }
  return { provider: merged.provider, model: merged.model };
}

/**
 * 单次文本生成的退避重试外壳：可重试的故障按 5s/15s/45s 重试三次，其余立刻抛错并说清该改哪里。
 * 等待用 abortableSleep——取消必须立刻生效，不能让用户等满 45 秒。
 */
async function generateText(deps: TextStepDeps, options: LlmStreamOptions): Promise<string> {
  const maxAttempts = LLM_RETRY_DELAYS_MS.length;
  for (let attempt = 0; ; attempt += 1) {
    const outcome = await streamLlmText(deps.llm, options, deps.signal);
    if (outcome.status === 'aborted') throw PIPELINE_ABORT;
    if (outcome.status === 'error') {
      const retryable = isRetryableLlmFailure(outcome.code);
      if (!retryable || attempt >= maxAttempts) {
        // 立即失败要给出去处；耗尽重试要给「已经试过几次」，否则用户以为这次没重试。
        const tried = attempt > 0 ? `（已退避重试 ${attempt} 次仍失败）` : '';
        throw new PipelineStepError(outcome.code, `${outcome.message}${tried}——${llmFailureHint(outcome.code)}`);
      }
      const waitMs = LLM_RETRY_DELAYS_MS[attempt];
      deps.onRetryWait?.({
        code: outcome.code,
        attempt: attempt + 1,
        maxAttempts,
        waitMs,
        notBefore: new Date(deps.now().getTime() + waitMs).toISOString(),
      });
      const slept = await abortableSleep(waitMs, deps.signal);
      deps.onRetryEnd?.();
      if (!slept) throw PIPELINE_ABORT;
      continue;
    }
    return stripOuterFence(outcome.text);
  }
}

/**
 * outline 步：v0.5 骨架绑——brief.outline 给定时为「校验+补洞」模式，给定节名必须原样出现；
 * 首轮遗漏带反馈重写一次，仍遗漏即步骤失败（机械校验，不猜模型意图）。
 */
export async function generateOutline(
  deps: TextStepDeps,
  input: { readonly params: RunParams; readonly topic: string },
): Promise<{ text: string; skeletonApplied: boolean }> {
  const llmCall = resolveLlmCall(input.params);
  const skeleton = input.params.brief?.outline?.length ? input.params.brief.outline : undefined;
  let retryMissing: readonly string[] | undefined;
  for (let qualityAttempt = 0; ; qualityAttempt += 1) {
    const text = await generateText(deps, {
      purpose: 'wewrite-pipeline',
      system: pipelineSystemPrompt(),
      user: outlineUserPrompt(input.topic, input.params.brief, retryMissing),
      ...llmCall,
    });
    if (!skeleton) return { text, skeletonApplied: false };
    const missing = skeleton.filter((section) => !text.includes(section));
    if (!missing.length) return { text, skeletonApplied: true };
    if (qualityAttempt >= 1) {
      throw new PipelineStepError(
        'outline-skeleton-violated',
        `大纲未原样保留用户给定节：${missing.map((section) => `「${section}」`).join('、')}`,
      );
    }
    retryMissing = missing;
  }
}

/**
 * draft 步：outline 守住的大纲可能被成稿改写、来源可能被写成链接语法、正文可能编造 URL——
 * 先带反馈重写一次；仍不合规交 gates 终检拦（单一强制执行点）。
 */
export async function generateDraft(
  deps: TextStepDeps,
  input: { readonly params: RunParams; readonly topic: string; readonly outline: string },
): Promise<string> {
  const llmCall = resolveLlmCall(input.params);
  const skeleton = input.params.brief?.outline?.length ? input.params.brief.outline : undefined;
  const briefSources = input.params.brief?.sources?.length ? input.params.brief.sources : undefined;
  const userText = briefUserText(input.topic, input.params.brief);
  let retryMissing: readonly string[] | undefined;
  let retryInvisible: readonly string[] | undefined;
  let retryInvented: readonly string[] | undefined;
  for (let qualityAttempt = 0; ; qualityAttempt += 1) {
    const text = await generateText(deps, {
      purpose: 'wewrite-pipeline',
      system: pipelineSystemPrompt(),
      user: draftUserPrompt(input.topic, input.outline, input.params.brief, retryMissing, retryInvisible, retryInvented),
      ...llmCall,
    });
    if (!skeleton && !briefSources) return text;
    const missing = skeleton ? skeleton.filter((section) => !text.includes(section)) : [];
    const invisible = briefSources ? briefSources.filter((url) => !isSourceUrlVisible(text, url)) : [];
    const invented = briefSources ? findInventedUrls(text, briefSources, userText) : [];
    if ((!missing.length && !invisible.length && !invented.length) || qualityAttempt >= 1) return text;
    retryMissing = missing.length ? missing : undefined;
    retryInvisible = invisible.length ? invisible : undefined;
    retryInvented = invented.length ? invented : undefined;
  }
}
