/**
 * 视图模型 schema（分层中层）：client 面板与 host service 的投影形状。
 * 单向依赖 schema-base；被 contract.ts 汇总再导出（tests 钉定 '@/shared/contract' 面）。
 */

import { z } from 'zod';
import {
  ARTICLE_STATUSES,
  ImageProviderConfigSchema,
  LlmOverrideSchema,
  RUN_STATUSES,
  RunParamsSchema,
  SlugSchema,
} from './schema-base';

export const HotspotItemSchema = z.strictObject({
  title: z.string(),
  source: z.string(),
  rank: z.number().int().min(1),
  url: z.string(),
});
export type HotspotItem = z.infer<typeof HotspotItemSchema>;

export const ArticleListItemSchema = z.strictObject({
  id: z.string(),
  slug: SlugSchema,
  title: z.string(),
  digest: z.string(),
  status: z.enum(ARTICLE_STATUSES),
  updatedAt: z.string(),
});
export type ArticleListItem = z.infer<typeof ArticleListItemSchema>;

export const ArticleDetailSchema = ArticleListItemSchema.extend({
  v: z.number().int().min(1),
  markdown: z.string(),
  theme: z.string(),
  bodyImageIds: z.array(z.string()),
  coverImageId: z.string().optional(),
  createdAt: z.string().optional(),
  wechatMediaId: z.string().optional(),
  thumbMediaId: z.string().optional(),
  lastRunId: z.string().optional(),
});
export type ArticleDetail = z.infer<typeof ArticleDetailSchema>;

export const RunSummarySchema = z.strictObject({
  id: z.string(),
  trigger: z.enum(['manual', 'schedule']),
  scheduleId: z.string().optional(),
  articleId: z.string().optional(),
  status: z.enum(RUN_STATUSES),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  error: z.strictObject({ code: z.string(), message: z.string() }).optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const ScheduleViewModelSchema = z.strictObject({
  id: z.string(),
  revision: z.number().int().min(1),
  name: z.string(),
  rrule: z.string(),
  timeZone: z.string(),
  params: RunParamsSchema,
  enabled: z.boolean(),
  publishTarget: z.literal('draft'),
  nextRunAt: z.string(),
  lastRunAt: z.string().optional(),
});
export type ScheduleViewModel = z.infer<typeof ScheduleViewModelSchema>;

export const CredentialsDescriptorSchema = z.strictObject({
  configured: z.boolean(),
  writable: z.boolean(),
});
export type CredentialsDescriptor = z.infer<typeof CredentialsDescriptorSchema>;

export const ConfigSettingsViewSchema = z.strictObject({
  wechatAppId: z.string(),
  wechatApiBaseUrl: z.string(),
  wechatAuthor: z.string(),
  defaultTheme: z.string(),
  defaultImageSize: z.enum(['1024x1024', '1024x1536', '1536x1024', '1344x768', '768x1344']),
  llmDefault: LlmOverrideSchema,
  agentToolsEnabled: z.boolean(),
  runHistoryLimit: z.number().int().min(1).max(1000),
  hotspotAggregatorUrl: z.string().optional(),
});
export type ConfigSettingsView = z.infer<typeof ConfigSettingsViewSchema>;

export const ConfigViewSchema = z.strictObject({
  settings: ConfigSettingsViewSchema,
  credentials: z.record(z.string(), CredentialsDescriptorSchema),
  imageProviders: z.array(ImageProviderConfigSchema),
});
export type ConfigView = z.infer<typeof ConfigViewSchema>;

export const CapabilitiesSchema = z.strictObject({
  // 与 contract.ts 的 CONTRACT_VERSION 同值（分层所限本地字面量；改版本时两处同步）
  contractVersion: z.literal(1),
  features: z.array(z.string()),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const SnapshotResponseSchema = z.strictObject({
  articles: z.array(ArticleListItemSchema),
  runs: z.array(RunSummarySchema),
  schedules: z.array(ScheduleViewModelSchema),
  config: ConfigViewSchema,
  serverNow: z.iso.datetime(),
  capabilities: CapabilitiesSchema,
});
export type SnapshotResponse = z.infer<typeof SnapshotResponseSchema>;
