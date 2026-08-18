/**
 * 图片步装配（F7 / AC-9）：providers fallback 链 + ImageRecord 产线。
 * 从 service 拆出（单文件 <=300 行纪律）；凭据经注入的 resolver 读取（ADR-006）。
 */
import { type ImageProviderId } from '../shared/image-provider-ids';
import type { ImageRecord, SettingsRecord } from './domain';
import type { ImagesGenerator } from './pipeline/engine';
import type { ImageProvider } from './providers/types';
export declare const PROVIDER_FACTORIES: Readonly<Record<ImageProviderId, (fetchImpl?: typeof fetch) => ImageProvider>>;
export interface ImagesGeneratorDeps {
    readonly getSettings: () => SettingsRecord;
    readonly resolveCredential: (ref: string) => Promise<string | undefined>;
    readonly now: () => Date;
    readonly persist: (records: readonly ImageRecord[]) => Promise<void>;
    /** 传输层注入（测试路由 / 出口代理），缺省走全局 fetch。 */
    readonly fetchImpl?: typeof fetch;
}
export declare function createImagesGenerator(deps: ImagesGeneratorDeps): ImagesGenerator;
