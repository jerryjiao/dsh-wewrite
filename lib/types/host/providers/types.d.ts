/**
 * ImageProvider 抽象（架构 §7.1）：图片≠文本流协议，自建 9 家接口。
 * 错误约定：ImageProviderError 携带分类码；retryable 按 code 派生——
 * AUTH=false（换凭据才有意义），RATE_LIMIT/TIMEOUT/NETWORK/PROVIDER=true。
 */
import type { ImageProviderId } from '../../shared/image-provider-ids';
export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024' | '1344x768' | '768x1344';
export interface ImageGenRequest {
    readonly prompt: string;
    readonly size: ImageSize;
    readonly n: number;
    readonly signal?: AbortSignal;
}
export interface GeneratedImage {
    readonly buffer: Buffer;
    readonly mime: string;
}
export interface ImageGenResult {
    readonly images: readonly GeneratedImage[];
    /** 实际命中的 model id（fallback 审计链）。 */
    readonly model: string;
    /**
     * 联合访问面（tests 契约先例）：调用方以 `promise.catch(() => error)` 取
     * ImageGenResult | ImageProviderError 联合后直接访问 code/retryable/providerId。
     * 成功结果恒不携带 code/retryable；providerId 供命中审计回填。
     */
    readonly providerId?: string;
    readonly code?: undefined;
    readonly retryable?: undefined;
}
/** credentialRef 解析后的统一配置（各家差异字段进 extra）。 */
export interface ResolvedProviderConfig {
    readonly apiKey: string;
    readonly baseUrl?: string;
    readonly model?: string;
    readonly extra?: Readonly<Record<string, string>>;
}
export type ImageErrorCode = 'AUTH' | 'RATE_LIMIT' | 'TIMEOUT' | 'NETWORK' | 'PROVIDER';
export declare class ImageProviderError extends Error {
    readonly providerId: string;
    readonly code: ImageErrorCode;
    readonly retryable: boolean;
    constructor(input: {
        providerId: string;
        code: ImageErrorCode;
        message: string;
        retryable?: boolean;
    });
}
export interface ImageProvider {
    readonly id: ImageProviderId;
    generate(req: ImageGenRequest, cfg: ResolvedProviderConfig): Promise<ImageGenResult>;
}
