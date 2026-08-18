/**
 * fallback 编排（AC-9 / 架构 §7.1）：按序尝试，单家 retryable 错误重试恰好一次，
 * 非 retryable 立即降级下一家；尝试史随结果/异常返回，全部失败抛 ImageFallbackExhaustedError。
 */
import type { ImageProviderId } from '../../shared/image-provider-ids';
import { type ImageGenRequest, type ImageGenResult, type ImageProvider, type ResolvedProviderConfig } from './types';
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
export declare class ImageFallbackExhaustedError extends Error {
    readonly attempts: readonly ImageAttempt[];
    constructor(attempts: readonly ImageAttempt[]);
}
export declare function runImageFallback(providers: readonly ImageProvider[], resolveConfig: (providerId: ImageProviderId) => ResolvedProviderConfig, req: ImageGenRequest): Promise<FallbackOutcome>;
