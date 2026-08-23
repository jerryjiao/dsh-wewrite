// src/shared/contract.ts
import { z as z3 } from "zod";

// src/shared/schema-base.ts
import { z } from "zod";

// src/shared/image-provider-ids.ts
var IMAGE_PROVIDER_IDS = [
  "openai",
  "doubao",
  "dashscope",
  "jimeng",
  "minimax",
  "azure_openai",
  "gemini",
  "openrouter",
  "replicate"
];
var DEFAULT_IMAGE_PROVIDER_CHAIN = [...IMAGE_PROVIDER_IDS];
var DEFAULT_PROVIDER_MODELS = {
  openai: "gpt-image-2",
  doubao: "doubao-seededit-3-0-i2i",
  dashscope: "wanx2.1-t2i-turbo",
  jimeng: "jimeng-2.1-latest",
  minimax: "image-01",
  azure_openai: "gpt-image-2",
  gemini: "gemini-2.5-flash-image",
  openrouter: "openai/gpt-image-2",
  replicate: "black-forest-labs/flux-schnell"
};
var CREDENTIAL_REFS = {
  wechatSecret: "WEWRITE_WECHAT_SECRET",
  image: (providerId) => `WEWRITE_IMG_${providerId.toUpperCase()}`
};
function isImageProviderId(value) {
  return IMAGE_PROVIDER_IDS.includes(value);
}

// src/shared/schema-base.ts
function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
var TimeZoneSchema = z.string().refine(isValidTimeZone, { message: "\u5FC5\u987B\u662F\u5408\u6CD5 IANA \u65F6\u533A" });
var SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "slug \u5FC5\u987B\u662F kebab-case" });
var CredentialRefSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/, { message: "\u51ED\u636E\u5F15\u7528\u5FC5\u987B\u662F POSIX \u73AF\u5883\u53D8\u91CF\u540D" });
var IMAGE_SIZES = z.enum(["1024x1024", "1024x1536", "1536x1024", "1344x768", "768x1344"]);
var ImageProviderConfigSchema = z.strictObject({
  providerId: z.enum(IMAGE_PROVIDER_IDS),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
  credentialRef: z.string()
});
var LlmOverrideSchema = z.strictObject({
  provider: z.string().optional(),
  model: z.string().optional()
});
var RunParamsSchema = z.strictObject({
  topicMode: z.enum(["hotspots", "fixed"]),
  topic: z.string().optional(),
  theme: z.string().optional(),
  imageCount: z.number().int().min(0).max(10).optional(),
  llm: LlmOverrideSchema.optional()
});
var ARTICLE_STATUSES = ["editing", "rendered", "pushed", "failed"];
var RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled", "interrupted"];

// src/shared/view-schemas.ts
import { z as z2 } from "zod";
var HotspotItemSchema = z2.strictObject({
  title: z2.string(),
  source: z2.string(),
  rank: z2.number().int().min(1),
  url: z2.string()
});
var HotspotDigestItemSchema = z2.strictObject({
  rank: z2.number().int().min(1).max(100),
  title: z2.string().min(1).max(500),
  // Spec §1 只收 http(s)——fetch 侧同协议白名单，契约层先拒（QA v0.3 advisory-1 收紧）
  url: z2.string().regex(/^https?:\/\//, "\u5FC5\u987B\u662F http(s) URL")
});
var HotspotItemDigestSchema = z2.strictObject({
  digest: z2.string().min(1).max(4e3),
  source: z2.enum(["article", "title"]),
  model: z2.string(),
  generatedAtIso: z2.iso.datetime()
});
var ArticleListItemSchema = z2.strictObject({
  id: z2.string(),
  slug: SlugSchema,
  title: z2.string(),
  digest: z2.string(),
  status: z2.enum(ARTICLE_STATUSES),
  updatedAt: z2.string()
});
var ArticleDetailSchema = ArticleListItemSchema.extend({
  v: z2.number().int().min(1),
  markdown: z2.string(),
  theme: z2.string(),
  bodyImageIds: z2.array(z2.string()),
  coverImageId: z2.string().optional(),
  createdAt: z2.string().optional(),
  wechatMediaId: z2.string().optional(),
  thumbMediaId: z2.string().optional(),
  lastRunId: z2.string().optional()
});
var RunSummarySchema = z2.strictObject({
  id: z2.string(),
  trigger: z2.enum(["manual", "schedule"]),
  scheduleId: z2.string().optional(),
  articleId: z2.string().optional(),
  status: z2.enum(RUN_STATUSES),
  startedAt: z2.string(),
  finishedAt: z2.string().optional(),
  error: z2.strictObject({ code: z2.string(), message: z2.string() }).optional()
});
var ScheduleViewModelSchema = z2.strictObject({
  id: z2.string(),
  revision: z2.number().int().min(1),
  name: z2.string(),
  rrule: z2.string(),
  timeZone: z2.string(),
  params: RunParamsSchema,
  enabled: z2.boolean(),
  publishTarget: z2.literal("draft"),
  nextRunAt: z2.string(),
  lastRunAt: z2.string().optional()
});
var CredentialsDescriptorSchema = z2.strictObject({
  configured: z2.boolean(),
  writable: z2.boolean()
});
var ConfigSettingsViewSchema = z2.strictObject({
  wechatAppId: z2.string(),
  wechatApiBaseUrl: z2.string(),
  wechatAuthor: z2.string(),
  defaultTheme: z2.string(),
  defaultImageSize: z2.enum(["1024x1024", "1024x1536", "1536x1024", "1344x768", "768x1344"]),
  llmDefault: LlmOverrideSchema,
  agentToolsEnabled: z2.boolean(),
  runHistoryLimit: z2.number().int().min(1).max(1e3),
  hotspotAggregatorUrl: z2.string().optional()
});
var ConfigViewSchema = z2.strictObject({
  settings: ConfigSettingsViewSchema,
  credentials: z2.record(z2.string(), CredentialsDescriptorSchema),
  imageProviders: z2.array(ImageProviderConfigSchema)
});
var CapabilitiesSchema = z2.strictObject({
  // 与 contract.ts 的 CONTRACT_VERSION 同值（分层所限本地字面量；改版本时两处同步）
  contractVersion: z2.literal(1),
  features: z2.array(z2.string())
});
var SnapshotResponseSchema = z2.strictObject({
  articles: z2.array(ArticleListItemSchema),
  runs: z2.array(RunSummarySchema),
  schedules: z2.array(ScheduleViewModelSchema),
  config: ConfigViewSchema,
  serverNow: z2.iso.datetime(),
  capabilities: CapabilitiesSchema
});

// src/shared/contract.ts
var RPC_CHANNEL = "/dsh-wewrite";
var RPC_AUTHORITY = "loopback";
var CONTRACT_VERSION = 1;
var RPC_ENDPOINTS = [
  "snapshot",
  "hotspots/fetch",
  "hotspots/digestItem",
  "article/list",
  "article/get",
  "article/save",
  "article/delete",
  "article/preview",
  "article/rewrite",
  "run/start",
  "run/cancel",
  "schedule/save",
  "schedule/delete",
  "schedule/toggle",
  "schedule/runNow",
  "config/get",
  "config/set",
  "credentials/set",
  "credentials/describe",
  "llm/options",
  "wechat/pushDraft",
  "wechat/diagnose"
];
var EmptyRequest = z3.strictObject({});
var RunParamsWithTopicSchema = RunParamsSchema.superRefine((params, ctx) => {
  if (params.topicMode === "fixed" && !params.topic) {
    ctx.addIssue({ code: "custom", message: "\u56FA\u5B9A\u9009\u9898\u6A21\u5F0F\u4E0B topic \u4E0D\u80FD\u4E3A\u7A7A" });
  }
});
var ConfigSetRequestSchema = z3.strictObject({
  wechatAppId: z3.string().optional(),
  wechatApiBaseUrl: z3.string().optional(),
  wechatAuthor: z3.string().optional(),
  defaultTheme: z3.string().optional(),
  defaultImageSize: IMAGE_SIZES.optional(),
  llmDefault: LlmOverrideSchema.optional(),
  agentToolsEnabled: z3.boolean().optional(),
  runHistoryLimit: z3.number().int().min(1).max(1e3).optional(),
  hotspotAggregatorUrl: z3.string().optional(),
  imageProviders: z3.array(ImageProviderConfigSchema).optional()
});
var rpcContract = {
  snapshot: { request: EmptyRequest, response: SnapshotResponseSchema },
  "hotspots/fetch": {
    request: z3.strictObject({ limit: z3.number().int().min(1).max(100).optional() }),
    response: z3.array(HotspotItemSchema)
  },
  "hotspots/digestItem": {
    request: HotspotDigestItemSchema,
    response: HotspotItemDigestSchema
  },
  "article/list": { request: EmptyRequest, response: z3.array(ArticleListItemSchema) },
  "article/get": {
    request: z3.strictObject({ id: z3.string().min(1) }),
    response: ArticleDetailSchema
  },
  "article/save": {
    request: z3.strictObject({
      id: z3.string().optional(),
      slug: SlugSchema,
      title: z3.string().min(1),
      digest: z3.string(),
      markdown: z3.string(),
      theme: z3.string()
    }),
    response: ArticleDetailSchema
  },
  "article/delete": {
    request: z3.strictObject({ id: z3.string().min(1) }),
    response: z3.strictObject({ deleted: z3.boolean() })
  },
  "article/preview": {
    request: z3.union([
      z3.strictObject({ id: z3.string().min(1) }),
      z3.strictObject({ markdown: z3.string(), theme: z3.string() })
    ]),
    response: z3.strictObject({ html: z3.string() })
  },
  "article/rewrite": {
    request: z3.strictObject({
      text: z3.string().min(1).max(8e3),
      instruction: z3.string().min(1).max(200),
      title: z3.string().max(200).optional()
    }),
    response: z3.strictObject({ text: z3.string().min(1).max(16e3) })
  },
  "run/start": {
    request: z3.strictObject({ articleId: z3.string().optional(), params: RunParamsWithTopicSchema }),
    response: z3.strictObject({ runId: z3.string().min(1) })
  },
  "run/cancel": {
    request: z3.strictObject({ runId: z3.string().min(1) }),
    response: z3.strictObject({ ok: z3.boolean() })
  },
  "schedule/save": {
    request: z3.strictObject({
      id: z3.string().optional(),
      name: z3.string().min(1),
      rrule: z3.string().min(1),
      timeZone: TimeZoneSchema,
      params: RunParamsWithTopicSchema,
      enabled: z3.boolean()
    }),
    response: ScheduleViewModelSchema
  },
  "schedule/delete": {
    request: z3.strictObject({ id: z3.string().min(1) }),
    response: z3.strictObject({ deleted: z3.boolean() })
  },
  "schedule/toggle": {
    request: z3.strictObject({ id: z3.string().min(1), enabled: z3.boolean() }),
    response: ScheduleViewModelSchema
  },
  "schedule/runNow": {
    request: z3.strictObject({ id: z3.string().min(1) }),
    response: z3.strictObject({ runId: z3.string().min(1) })
  },
  "config/get": { request: EmptyRequest, response: ConfigViewSchema },
  "config/set": {
    request: ConfigSetRequestSchema,
    response: ConfigViewSchema
  },
  "credentials/set": {
    request: z3.strictObject({ ref: CredentialRefSchema, value: z3.string().min(1) }),
    response: z3.strictObject({ ok: z3.boolean() })
  },
  "credentials/describe": {
    request: EmptyRequest,
    response: z3.record(z3.string(), CredentialsDescriptorSchema)
  },
  "llm/options": {
    request: EmptyRequest,
    response: z3.strictObject({
      providers: z3.array(z3.strictObject({ id: z3.string(), models: z3.array(z3.string()) }))
    })
  },
  "wechat/pushDraft": {
    request: z3.strictObject({ articleId: z3.string().min(1) }),
    response: z3.strictObject({ mediaId: z3.string().min(1), thumbMediaId: z3.string().min(1) })
  },
  "wechat/diagnose": {
    request: EmptyRequest,
    response: z3.strictObject({
      reachable: z3.boolean(),
      ipWhitelisted: z3.boolean().optional(),
      errcode: z3.number().optional(),
      hint: z3.string().min(1)
    })
  }
};

// src/shared/view-models.ts
var CAPABILITY_FEATURES = ["scheduler", "images", "hotspots", "gates", "wechat-draft"];
export {
  ARTICLE_STATUSES,
  ArticleDetailSchema,
  ArticleListItemSchema,
  CAPABILITY_FEATURES,
  CONTRACT_VERSION,
  CREDENTIAL_REFS,
  CapabilitiesSchema,
  ConfigSettingsViewSchema,
  ConfigViewSchema,
  CredentialRefSchema,
  CredentialsDescriptorSchema,
  DEFAULT_IMAGE_PROVIDER_CHAIN,
  DEFAULT_PROVIDER_MODELS,
  HotspotDigestItemSchema,
  HotspotItemDigestSchema,
  HotspotItemSchema,
  IMAGE_PROVIDER_IDS,
  IMAGE_SIZES,
  ImageProviderConfigSchema,
  LlmOverrideSchema,
  RPC_AUTHORITY,
  RPC_CHANNEL,
  RPC_ENDPOINTS,
  RUN_STATUSES,
  RunParamsSchema,
  RunSummarySchema,
  ScheduleViewModelSchema,
  SlugSchema,
  SnapshotResponseSchema,
  TimeZoneSchema,
  isImageProviderId,
  isValidTimeZone,
  rpcContract
};
//# sourceMappingURL=shared.js.map
