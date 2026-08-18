/**
 * 图片供应商 ID 联合常量（架构 §7.1）。
 * 与 tests/host/providers-registry.test.ts 钉定的 9 家集合与默认链顺序一致：
 * openai(gpt-image-2) 恒第一（Jerry 指令），其余 8 家按 fallback 矩阵排序。
 */

export const IMAGE_PROVIDER_IDS = [
  'openai',
  'doubao',
  'dashscope',
  'jimeng',
  'minimax',
  'azure_openai',
  'gemini',
  'openrouter',
  'replicate',
] as const;

export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

/** 默认 fallback 链：用户可在设置里重排/删减，但缺省顺序锁定。 */
export const DEFAULT_IMAGE_PROVIDER_CHAIN: readonly ImageProviderId[] = [...IMAGE_PROVIDER_IDS];

/** 各家缺省模型（ResolvedProviderConfig.model 缺省时的回退值；openai 由 Jerry 指令锁定 gpt-image-2）。 */
export const DEFAULT_PROVIDER_MODELS: Readonly<Record<ImageProviderId, string>> = {
  openai: 'gpt-image-2',
  doubao: 'doubao-seededit-3-0-i2i',
  dashscope: 'wanx2.1-t2i-turbo',
  jimeng: 'jimeng-2.1-latest',
  minimax: 'image-01',
  azure_openai: 'gpt-image-2',
  gemini: 'gemini-2.5-flash-image',
  openrouter: 'openai/gpt-image-2',
  replicate: 'black-forest-labs/flux-schnell',
};

/** 凭据引用（ctx.credentials 的 POSIX 环境变量名，F19/F20）。 */
export const CREDENTIAL_REFS = {
  wechatSecret: 'WEWRITE_WECHAT_SECRET',
  image: (providerId: ImageProviderId): string => `WEWRITE_IMG_${providerId.toUpperCase()}`,
} as const;

export function isImageProviderId(value: string): value is ImageProviderId {
  return (IMAGE_PROVIDER_IDS as readonly string[]).includes(value);
}
