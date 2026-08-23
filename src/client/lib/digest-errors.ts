/**
 * 热榜逐条 AI 速览的错误文案映射与当日失败记忆（QA qa-digest 确诊修复）。
 *
 * 背景：LLM 错误（内容过滤 1301 / 拥挤 1305 / 限流 429 / 超时）经 RPC 信封
 * 透传后 message 可能是 ~1.7KB 的 zod JSON 墙（宿主白名单拒绝非契约 code 时）。
 * 后端正把信封收成 `[PI_AI_ERROR] Provider finish_reason: sensitive` 形态；
 * 本模块按该形态（兼容残留 JSON 墙）给出人话文案，真实 message 截断后放 hint。
 *
 * 失败记忆（模块级 Map，URL → 错误 message）：
 * - 展开即自动 generate 的懒加载会因失败条目反复重打 RPC（QA 实测 ~5s 一堵墙）；
 *   命中失败记忆的条目挂载时直接呈现错误态，只有用户点「重试」才再打（重试清记录）。
 * - 页面刷新即清零（Map 即可，不落 localStorage——失败是当日会话内事实）。
 */

export interface DigestErrorNotice {
  /** 一句话人话标题（具体、可行动）。 */
  title: string;
  /** 二级提示：截断后的真实 message（≤160 字），供排障。 */
  hint?: string;
}

const HINT_MAX_CHARS = 160;
const JSON_WALL_MIN_CHARS = 200;

/** message 形如序列化 JSON（以 [ 或 { 开头且很长）→ 视为透传的校验错误墙，不给人看。 */
export function looksLikeSerializedJson(message: string): boolean {
  return (message.startsWith('[') || message.startsWith('{')) && message.length > JSON_WALL_MIN_CHARS;
}

function hintOf(message: string): string | undefined {
  if (!message || looksLikeSerializedJson(message)) return undefined;
  return message.length > HINT_MAX_CHARS ? `${message.slice(0, HINT_MAX_CHARS)}…` : message;
}

/** 速览失败的分类人话文案（匹配信封 message 内容；JSON 墙兜底通用文案）。 */
export function describeDigestError(message: string): DigestErrorNotice {
  if (looksLikeSerializedJson(message)) {
    return { title: '速览生成失败，请重试。' };
  }
  const lowered = message.toLowerCase();
  // 信封 code 的连字符/下划线两种拼写归一（宿主白名单连字符，消息文本两种都可能出现）
  const normalized = lowered.replaceAll('_', '-');
  if (lowered.includes('sensitive') || message.includes('1301')) {
    return { title: '这条内容被模型安全过滤，跳过或稍后再试。', hint: hintOf(message) };
  }
  if (message.includes('1305') || lowered.includes('拥挤')) {
    return { title: '模型当前拥挤，稍后再试。', hint: hintOf(message) };
  }
  if (normalized.includes('rate-limit') || message.includes('429')) {
    return { title: '触发限流，稍后再试。', hint: hintOf(message) };
  }
  if (normalized.includes('digest-timeout') || lowered.includes('timeout') || message.includes('超时')) {
    return { title: '速览生成超时，请重试。', hint: hintOf(message) };
  }
  if (normalized.includes('llm-not-configured')) {
    return { title: '还没选择生成模型——到设置里选一个模型后再试。', hint: hintOf(message) };
  }
  if (normalized.includes('digest-empty')) {
    return { title: '模型未返回内容，请重试。', hint: hintOf(message) };
  }
  return { title: '速览生成失败，请重试。', hint: hintOf(message) };
}

// ── 当日失败记忆（模块级；页面刷新即清零） ────────────────────────────────────

const digestFailures = new Map<string, string>();

export function rememberDigestFailure(url: string, message: string): void {
  digestFailures.set(url, message);
}

/** 重试前清记录：失败记忆只拦「自动重试」，不拦用户主动重试。 */
export function clearDigestFailure(url: string): void {
  digestFailures.delete(url);
}

export function recallDigestFailure(url: string): string | undefined {
  return digestFailures.get(url);
}
