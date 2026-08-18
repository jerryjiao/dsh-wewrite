/**
 * 供应商共享传输层：POST + 统一响应解析 + 错误分类 + 魔数嗅探。
 * 响应协议统一支持 {data:[{b64_json}]} 与 {data:[{url}]} 双形态（源脚本 image_gen.mjs 先例，
 * QA 契约 §7.2-8）；各家远端形状差异由 adapter 归一到本层。
 * signal 原样透传给 fetch（身份相等，不包装超时控制器）。
 */
import { type ImageGenRequest, type ImageGenResult, type ImageProvider, type ResolvedProviderConfig } from './types';
import type { ImageProviderId } from '../../shared/image-provider-ids';
export declare function joinUrl(baseUrl: string, path: string): string;
interface TransportInput {
    readonly providerId: ImageProviderId;
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: unknown;
    readonly req: ImageGenRequest;
    /** 响应里的 images[].url 形态需要二次拉取时走 GET。 */
    readonly resultModel: string;
    readonly fetchImpl?: typeof fetch;
}
export declare function postJsonImages(input: TransportInput): Promise<ImageGenResult>;
/** 单家 provider 的声明式定义——9 家实现共用本工厂，差异只在 endpoint/headers/body。 */
export interface ProviderDeclaration {
    readonly id: ImageProviderId;
    readonly defaultBaseUrl: string;
    readonly defaultModel: string;
    endpoint(req: ImageGenRequest, cfg: ResolvedProviderConfig): {
        path: string;
        query?: string;
    };
    headers(cfg: ResolvedProviderConfig): Record<string, string>;
    body(req: ImageGenRequest, model: string): Record<string, unknown>;
}
export declare function declareProvider(declaration: ProviderDeclaration, fetchImpl?: typeof fetch): ImageProvider;
export {};
