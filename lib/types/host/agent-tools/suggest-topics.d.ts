/**
 * wewrite_suggest_topics（M3 / Spec §5 增补第 5 工具，AC-M3-04）：热榜 top-N + 逐条 AI 速览。
 * Spec 裁决：选题交互走「工具 + agent 原生问答」——agent 拿到候选后用自己的问答能力呈现，
 * 用户选定主题再以 wewrite_run 进入管线（不直接调 ctx.userQuestions）。
 */
import type { WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
export declare function buildSuggestTopicsTool(service: WeWriteService): WewriteToolDefinition;
