/**
 * RPC 契约（Spec §5 / 架构 §6）：22 端点的 request/response zod schema。
 * client 与 host 之间的唯一契约载体——双端共用，payload/response 全过校验。
 * 端点集合与形状由 tests/shared/contract.test.ts 钉定，禁漂移。
 * 分层：schema-base（基础形状）→ view-schemas（视图投影）→ 本文件（端点表 + 汇总再导出）。
 */

import { z } from 'zod';
import {
  CredentialRefSchema,
  IMAGE_SIZES,
  ImageProviderConfigSchema,
  LlmOverrideSchema,
  RunParamsSchema,
  SlugSchema,
  TimeZoneSchema,
} from './schema-base';
import {
  ArticleDetailSchema,
  ArticleListItemSchema,
  ConfigViewSchema,
  CredentialsDescriptorSchema,
  HotspotDigestItemSchema,
  HotspotItemDigestSchema,
  HotspotItemSchema,
  RunDetailSchema,
  ScheduleViewModelSchema,
  SnapshotResponseSchema,
} from './view-schemas';

export * from './schema-base';
export * from './view-schemas';

// 平台 RPC 目标串带前导斜杠（dsh-automation 真身：rpc.handle("/dsh-automation", ...)，
// 客户端同通道串拼接 endpoint 成 "/dsh-wewrite/snapshot"——无斜杠会 invalid RPC target，2026-08-19 实测）。
export const RPC_CHANNEL = '/dsh-wewrite';
export const RPC_AUTHORITY = 'loopback';
export const CONTRACT_VERSION = 1;

export const RPC_ENDPOINTS = [
  'snapshot',
  'hotspots/fetch',
  'hotspots/digestItem',
  'article/list',
  'article/get',
  'article/save',
  'article/delete',
  'article/preview',
  'article/rewrite',
  'run/start',
  'run/cancel',
  'run/detail',
  'schedule/save',
  'schedule/delete',
  'schedule/toggle',
  'schedule/runNow',
  'config/get',
  'config/set',
  'credentials/set',
  'credentials/describe',
  'llm/options',
  'wechat/pushDraft',
  'wechat/diagnose',
] as const;

export type RpcEndpoint = (typeof RPC_ENDPOINTS)[number];

// ── 端点契约组装 ─────────────────────────────────────────────────────────────

const EmptyRequest = z.strictObject({});

/** 固定选题语义：topicMode='fixed' 时必须携带 topic（run/start 与 schedule/save 共用）。
 *  v0.5：brief 只在 fixed 模式合法——热榜模式选题未定，携带标题/思路/来源是自相矛盾。 */
const RunParamsWithTopicSchema = RunParamsSchema.superRefine((params, ctx) => {
  if (params.topicMode === 'fixed' && !params.topic) {
    ctx.addIssue({ code: 'custom', message: '固定选题模式下 topic 不能为空' });
  }
  if (params.topicMode === 'hotspots' && params.brief) {
    ctx.addIssue({ code: 'custom', message: '热榜模式不支持携带 brief（选题来自热榜，标题/思路/来源无从绑定）' });
  }
});

const ConfigSetRequestSchema = z.strictObject({
  wechatAppId: z.string().optional(),
  wechatApiBaseUrl: z.string().optional(),
  wechatAuthor: z.string().optional(),
  defaultTheme: z.string().optional(),
  defaultImageSize: IMAGE_SIZES.optional(),
  llmDefault: LlmOverrideSchema.optional(),
  agentToolsEnabled: z.boolean().optional(),
  runHistoryLimit: z.number().int().min(1).max(1000).optional(),
  hotspotAggregatorUrl: z.string().optional(),
  imageProviders: z.array(ImageProviderConfigSchema).optional(),
});

export const rpcContract: Record<string, { readonly request: z.ZodType; readonly response: z.ZodType }> = {
  snapshot: { request: EmptyRequest, response: SnapshotResponseSchema },
  'hotspots/fetch': {
    request: z.strictObject({ limit: z.number().int().min(1).max(100).optional() }),
    response: z.array(HotspotItemSchema),
  },
  'hotspots/digestItem': {
    request: HotspotDigestItemSchema,
    response: HotspotItemDigestSchema,
  },
  'article/list': { request: EmptyRequest, response: z.array(ArticleListItemSchema) },
  'article/get': {
    request: z.strictObject({ id: z.string().min(1) }),
    response: ArticleDetailSchema,
  },
  'article/save': {
    request: z.strictObject({
      id: z.string().optional(),
      slug: SlugSchema,
      title: z.string().min(1),
      digest: z.string(),
      markdown: z.string(),
      theme: z.string(),
    }),
    response: ArticleDetailSchema,
  },
  'article/delete': {
    request: z.strictObject({ id: z.string().min(1) }),
    response: z.strictObject({ deleted: z.boolean() }),
  },
  'article/preview': {
    request: z.union([
      z.strictObject({ id: z.string().min(1) }),
      z.strictObject({ markdown: z.string(), theme: z.string() }),
    ]),
    response: z.strictObject({ html: z.string() }),
  },
  'article/rewrite': {
    request: z.strictObject({
      text: z.string().min(1).max(8000),
      instruction: z.string().min(1).max(200),
      title: z.string().max(200).optional(),
    }),
    response: z.strictObject({ text: z.string().min(1).max(16000) }),
  },
  'run/start': {
    request: z.strictObject({ articleId: z.string().optional(), params: RunParamsWithTopicSchema }),
    response: z.strictObject({ runId: z.string().min(1) }),
  },
  'run/cancel': {
    request: z.strictObject({ runId: z.string().min(1) }),
    response: z.strictObject({ ok: z.boolean() }),
  },
  // chat-integration 增补（AC-M2-01 运行卡消费面）：纯新增端点，22 端点原样（§7 保证 1）。
  // runId/callId 二选一（M2 运行卡 runId 断链修复：presentCall 先于 execute 拿不到 runId，
  // 前端推导链 args.runId→rawInput.runId→callId 兜底——callId 由 host 侧 execute 时绑定）。
  'run/detail': {
    request: z.union([z.strictObject({ runId: z.string().min(1) }), z.strictObject({ callId: z.string().min(1) })]),
    response: RunDetailSchema,
  },
  'schedule/save': {
    request: z.strictObject({
      id: z.string().optional(),
      name: z.string().min(1),
      rrule: z.string().min(1),
      timeZone: TimeZoneSchema,
      params: RunParamsWithTopicSchema,
      enabled: z.boolean(),
    }),
    response: ScheduleViewModelSchema,
  },
  'schedule/delete': {
    request: z.strictObject({ id: z.string().min(1) }),
    response: z.strictObject({ deleted: z.boolean() }),
  },
  'schedule/toggle': {
    request: z.strictObject({ id: z.string().min(1), enabled: z.boolean() }),
    response: ScheduleViewModelSchema,
  },
  'schedule/runNow': {
    request: z.strictObject({ id: z.string().min(1) }),
    response: z.strictObject({ runId: z.string().min(1) }),
  },
  'config/get': { request: EmptyRequest, response: ConfigViewSchema },
  'config/set': {
    request: ConfigSetRequestSchema,
    response: ConfigViewSchema,
  },
  'credentials/set': {
    request: z.strictObject({ ref: CredentialRefSchema, value: z.string().min(1) }),
    response: z.strictObject({ ok: z.boolean() }),
  },
  'credentials/describe': {
    request: EmptyRequest,
    response: z.record(z.string(), CredentialsDescriptorSchema),
  },
  'llm/options': {
    request: EmptyRequest,
    response: z.strictObject({
      providers: z.array(z.strictObject({ id: z.string(), models: z.array(z.string()) })),
    }),
  },
  'wechat/pushDraft': {
    request: z.strictObject({ articleId: z.string().min(1) }),
    response: z.strictObject({ mediaId: z.string().min(1), thumbMediaId: z.string().min(1) }),
  },
  'wechat/diagnose': {
    request: EmptyRequest,
    response: z.strictObject({
      reachable: z.boolean(),
      ipWhitelisted: z.boolean().optional(),
      errcode: z.number().optional(),
      hint: z.string().min(1),
    }),
  },
} as const;

export type RpcContract = typeof rpcContract;
export type RpcEndpointSchemas = { readonly request: z.ZodType; readonly response: z.ZodType };
