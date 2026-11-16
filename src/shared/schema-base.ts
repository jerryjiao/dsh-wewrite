/**
 * 契约基础形状（分层底座）：被 view-schemas 与 contract 两层单向消费，杜绝环。
 * 本层只依赖 zod 与 image-provider-ids，不依赖其他 shared 模块。
 */

import { z } from 'zod';
import { IMAGE_PROVIDER_IDS } from './image-provider-ids';

/** IANA 时区校验（Intl 真实解析，'UTC+8'/'Mars/Olympus' 等均拒）。 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const TimeZoneSchema = z.string().refine(isValidTimeZone, { message: '必须是合法 IANA 时区' });
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug 必须是 kebab-case' });
export const CredentialRefSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/, { message: '凭据引用必须是 POSIX 环境变量名' });

export const IMAGE_SIZES = z.enum(['1024x1024', '1024x1536', '1536x1024', '1344x768', '768x1344']);

export const ImageProviderConfigSchema = z.strictObject({
  providerId: z.enum(IMAGE_PROVIDER_IDS),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
  credentialRef: z.string(),
});
export type ImageProviderConfig = z.infer<typeof ImageProviderConfigSchema>;

export const LlmOverrideSchema = z.strictObject({
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type LlmOverride = z.infer<typeof LlmOverrideSchema>;

/**
 * 启动 brief（v0.5 变密度输入合同，docs/v0.5-launch-brief.md §2）：
 * 主题之外全部可选——一句话路径零损伤；给了即按分层绑定生效（标题/思路硬绑、大纲骨架绑、来源硬绑+门禁）。
 */
export const LaunchBriefSchema = z.strictObject({
  /** 硬绑：给了就是最终标题（落库覆盖推导标题，微信标题上限 64 字）。 */
  title: z.string().trim().min(1).max(64).optional(),
  /** 硬绑：文章主张的锚（draft 提示词围绕它展开，不得偏离）。 */
  approach: z.string().trim().min(1).max(2000).optional(),
  /** 骨架绑：给定节名不删不改、管线可补节（outline 步校验+补洞+机械校验）。 */
  outline: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional(),
  /** 硬绑：来源必须以可见 URL 文本进正文（gates 机械检查），AI 不得编造未给来源。 */
  sources: z.array(z.url()).min(1).max(10).optional(),
});
export type LaunchBrief = z.infer<typeof LaunchBriefSchema>;

/** 管线运行参数（Spec §5 run/start.params；调度 paramsSnapshot 同型）。 */
export const RunParamsSchema = z.strictObject({
  topicMode: z.enum(['hotspots', 'fixed']),
  topic: z.string().optional(),
  brief: LaunchBriefSchema.optional(),
  theme: z.string().optional(),
  imageCount: z.number().int().min(0).max(10).optional(),
  llm: LlmOverrideSchema.optional(),
});
export type RunParams = z.infer<typeof RunParamsSchema>;

export const ARTICLE_STATUSES = ['editing', 'rendered', 'pushed', 'failed'] as const;
export const RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted'] as const;

/**
 * 退避重试的可见进度（真机 29% 的 run 死在 RATE_LIMIT，等待期最长 45 秒）。
 * 为什么进契约：这 45 秒里界面上不能是一片空白——用户要知道「在等」而不是「卡死」；
 * 放在 schema-base 是因为 run 记录（domain）与 run 视图（view-schemas）都要用它。
 */
export const RunRetrySchema = z.strictObject({
  /** 正在重试的步骤名（topic/outline/draft/gates/render/images）。 */
  step: z.string().min(1),
  /** 归一化前的原始失败码（RATE_LIMIT、TIMEOUT、AUTH…），便于排查对照供应商文档。 */
  code: z.string().min(1),
  /** 第几次重试，从 1 开始（1 就表示第一次重试前的等待）。 */
  attempt: z.number().int().min(1),
  /** 允许的重试次数上限（当前策略 3）。 */
  maxAttempts: z.number().int().min(1),
  /** 本次等待时长（毫秒）。 */
  waitMs: z.number().int().min(0),
  /** 等待结束时刻（ISO8601）——界面据此说「N 秒后」，不用自己算开始时间。 */
  notBefore: z.iso.datetime(),
});
export type RunRetry = z.infer<typeof RunRetrySchema>;
