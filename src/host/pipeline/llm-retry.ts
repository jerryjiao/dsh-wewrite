/**
 * 供应商失败的退避重试策略（纯函数 + 可打断等待）。
 *
 * 为什么独立成一个文件：真机 35 次 run 里 10 次死在 RATE_LIMIT（29%），
 * 这类错误等几秒自己就好了；而密钥失效、额度耗尽再重试 100 次也没用，只会让用户
 * 多等一分钟才看到同一句话。所以「哪些错误值得再试」必须是一条可单测的规则，
 * 不能散落在步骤代码的 catch 里靠记忆维护。
 */

/** 失败分类：决定重试，以及不重试时告诉用户去改哪里。 */
export type LlmFailureKind = 'rate-limit' | 'timeout' | 'network' | 'overload' | 'auth' | 'quota' | 'unknown';

/** 归一化：大小写、连字符、空格都不该影响判定（供应商之间写法不统一）。 */
export function normalizeLlmCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** 不可重试：再试一次结果相同，只会白等（顺序在前——「insufficient_quota」也含 quota 类词根）。 */
const AUTH_MARKERS = ['auth', 'unauthorized', 'forbidden', 'invalid_key', 'invalid_api_key', 'api_key_invalid', 'no_api_key', '401', '403'];
const QUOTA_MARKERS = ['insufficient_quota', 'quota', 'billing', 'payment', 'balance', 'credit', '402'];

/** 可重试：与时间有关的暂时性故障。 */
const RATE_MARKERS = ['rate_limit', 'ratelimit', 'too_many', '429'];
const TRANSIENT_MARKERS = [
  'timeout',
  'timed_out',
  'deadline',
  'network',
  'econnreset',
  'econnrefused',
  'etimedout',
  'enotfound',
  'fetch_failed',
  'socket',
  'overload',
  'unavailable',
  'server_error',
  'internal_error',
  'bad_gateway',
  '500',
  '502',
  '503',
  '504',
];

/** 命中即算（子串匹配：供应商常把码写成 rate_limit_exceeded / llm:timeout 这类变体）。 */
function hits(normalized: string, markers: readonly string[]): boolean {
  return markers.some((marker) => normalized.includes(marker));
}

export function classifyLlmFailure(code: string): LlmFailureKind {
  const normalized = normalizeLlmCode(code);
  if (hits(normalized, AUTH_MARKERS)) return 'auth';
  if (hits(normalized, QUOTA_MARKERS)) return 'quota';
  if (hits(normalized, RATE_MARKERS)) return 'rate-limit';
  if (hits(normalized, TRANSIENT_MARKERS)) {
    if (normalized.includes('overload')) return 'overload';
    if (normalized.includes('timeout') || normalized.includes('timed_out') || normalized.includes('deadline')) return 'timeout';
    if (normalized.includes('network') || normalized.includes('socket') || normalized.includes('econn') || normalized.includes('enotfound')) {
      return 'network';
    }
    return 'overload';
  }
  // 未识别的码默认不重试：宁可当场报错让用户看见，也不要让他等三次未知的退避。
  return 'unknown';
}

export function isRetryableLlmFailure(code: string): boolean {
  const kind = classifyLlmFailure(code);
  return kind === 'rate-limit' || kind === 'timeout' || kind === 'network' || kind === 'overload';
}

/** 退避序列（毫秒）：合计 65 秒，覆盖限流常见的分钟窗口，又不至于让用户等到放弃。 */
export const LLM_RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;

/** 不重试或重试耗尽时，告诉用户「该去改哪里」——错误信息只写供应商原话等于没说。 */
export function llmFailureHint(code: string): string {
  switch (classifyLlmFailure(code)) {
    case 'auth':
      return '密钥无效或未授权：请在 设置 → 模型服务 重新填写该供应商的 API Key';
    case 'quota':
      return '账户额度已耗尽：请在供应商控制台充值，或在 设置 → 模型服务 换一个可用 key';
    case 'rate-limit':
      return '供应商限流：稍后重试，或在 设置 → 模型服务 换一个额度更宽的供应商';
    default:
      return '重试无法解决：请检查 设置 → 模型服务 的供应商与模型配置，并按错误码查运行日志';
  }
}

/**
 * 可被 AbortSignal 立刻打断的等待：取消按钮按下时用户不该再等剩余退避时间。
 * 返回 false 表示被中断（调用方据此走取消分支，而不是继续下一次尝试）。
 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
