/**
 * 微信客户端的两个自救原语（从 client.ts 拆出的纯函数，单独可测）：
 *
 * 1) fetchWithTimeout：裸 fetch 没有超时，网络黑洞时请求会永远挂着，推送卡死且无提示。
 *    用 AbortSignal.timeout 起一条竞速闸——即使底层 fetch（或 mock）不理会 signal，
 *    race 也会在时限到点后以 TimeoutError 拒绝，调用方据此转成 TIMEOUT 分类。
 *
 * 2) isTokenExpiredError：42001/40001 表示 access_token 已失效——微信可能提前吊销
 *    旧 token，本地缓存没到期也会被打回。client 据此清缓存、换新 token 重发一次。
 */
import { WeChatApiError } from './diagnostics';

/** 默认 20s：微信官方接口正常响应远低于此，再等下去多半是网络/代理黑洞，干耗无益。 */
export const DEFAULT_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  // 外部传入的 signal（如有）与超时闸合并：任一触发都中止请求。
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  const fetchPromise = fetchImpl(url, { ...init, signal });
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    // reason 是 DOMException('TimeoutError')——调用方按 name 分流 TIMEOUT / NETWORK。
    const rejectWithReason = () => reject(timeoutSignal.reason);
    if (timeoutSignal.aborted) rejectWithReason();
    else timeoutSignal.addEventListener('abort', rejectWithReason, { once: true });
  });
  return Promise.race([fetchPromise, timeoutPromise]);
}

/** access_token 失效码：42001 token 过期；40001 credential 无效（微信吊销旧 token 时同样回它）。 */
export const TOKEN_EXPIRED_ERRCODES = new Set([42001, 40001]);

export function isTokenExpiredError(error: unknown): boolean {
  return error instanceof WeChatApiError && TOKEN_EXPIRED_ERRCODES.has(error.errcode);
}
