/**
 * fallback 编排（AC-9 / 架构 §7.1）：按序尝试，单家 retryable 错误重试恰好一次，
 * 非 retryable 立即降级下一家；尝试史随结果/异常返回，全部失败抛 ImageFallbackExhaustedError。
 */

import type { ImageProviderId } from '../../shared/image-provider-ids';
import { ImageProviderError, type ImageGenRequest, type ImageGenResult, type ImageProvider, type ResolvedProviderConfig } from './types';

export interface ImageAttempt {
  readonly providerId: ImageProviderId;
  readonly tries: number;
  readonly outcome: 'success' | 'error';
  readonly codes: readonly string[];
}

export interface FallbackOutcome {
  readonly result: ImageGenResult;
  readonly providerId: ImageProviderId;
  readonly attempts: readonly ImageAttempt[];
}

export class ImageFallbackExhaustedError extends Error {
  constructor(readonly attempts: readonly ImageAttempt[]) {
    super(`全部图片供应商失败（${attempts.length} 家尝试链）`);
    this.name = 'ImageFallbackExhaustedError';
  }
}

/** 单家最大尝试次数：首试 + 一次重试。 */
const MAX_TRIES_PER_PROVIDER = 2;

export async function runImageFallback(
  providers: readonly ImageProvider[],
  resolveConfig: (providerId: ImageProviderId) => ResolvedProviderConfig,
  req: ImageGenRequest,
): Promise<FallbackOutcome> {
  if (req.signal?.aborted) {
    throw new ImageProviderError({ providerId: 'openai', code: 'NETWORK', message: '请求已中止，未发起任何供应商调用' });
  }
  const attempts: ImageAttempt[] = [];
  for (const provider of providers) {
    const codes: string[] = [];
    let tries = 0;
    for (;;) {
      tries += 1;
      try {
        const result = await provider.generate(req, resolveConfig(provider.id));
        attempts.push({ providerId: provider.id, tries, outcome: 'success', codes });
        return { result, providerId: provider.id, attempts };
      } catch (thrown) {
        const error =
          thrown instanceof ImageProviderError
            ? thrown
            : new ImageProviderError({
                providerId: provider.id,
                code: 'PROVIDER',
                message: thrown instanceof Error ? thrown.message : String(thrown ?? '未知错误'),
              });
        codes.push(error.code);
        if (error.retryable && tries < MAX_TRIES_PER_PROVIDER) continue;
        attempts.push({ providerId: provider.id, tries, outcome: 'error', codes });
        break;
      }
    }
  }
  throw new ImageFallbackExhaustedError(attempts);
}
