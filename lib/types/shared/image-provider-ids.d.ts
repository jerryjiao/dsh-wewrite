/**
 * 图片供应商 ID 联合常量（架构 §7.1）。
 * 与 tests/host/providers-registry.test.ts 钉定的 9 家集合与默认链顺序一致：
 * openai(gpt-image-2) 恒第一（Jerry 指令），其余 8 家按 fallback 矩阵排序。
 */
export declare const IMAGE_PROVIDER_IDS: readonly ["openai", "doubao", "dashscope", "jimeng", "minimax", "azure_openai", "gemini", "openrouter", "replicate"];
export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];
/** 默认 fallback 链：用户可在设置里重排/删减，但缺省顺序锁定。 */
export declare const DEFAULT_IMAGE_PROVIDER_CHAIN: readonly ImageProviderId[];
/** 各家缺省模型（ResolvedProviderConfig.model 缺省时的回退值；openai 由 Jerry 指令锁定 gpt-image-2）。 */
export declare const DEFAULT_PROVIDER_MODELS: Readonly<Record<ImageProviderId, string>>;
/** 凭据引用（ctx.credentials 的 POSIX 环境变量名，F19/F20）。 */
export declare const CREDENTIAL_REFS: {
    readonly wechatSecret: "WEWRITE_WECHAT_SECRET";
    readonly image: (providerId: ImageProviderId) => string;
};
export declare function isImageProviderId(value: string): value is ImageProviderId;
