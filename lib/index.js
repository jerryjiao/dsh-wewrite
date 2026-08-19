// src/host/index.ts
import { z as z5 } from "zod";

// src/host/domain.ts
import { z as z4 } from "zod";

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
var CREDENTIAL_REFS = {
  wechatSecret: "WEWRITE_WECHAT_SECRET",
  image: (providerId) => `WEWRITE_IMG_${providerId.toUpperCase()}`
};

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

// src/host/domain.ts
var SlugSchema2 = z4.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "slug \u5FC5\u987B\u662F kebab-case" });
var TimeZoneSchema2 = z4.string().refine(isValidTimeZone, { message: "\u5FC5\u987B\u662F\u5408\u6CD5 IANA \u65F6\u533A" });
var IMAGE_BASE64_MAX_CHARS = 10 * 1024 * 1024;
var SettingsRecordSchema = z4.strictObject({
  wechatAppId: z4.string().default(""),
  wechatApiBaseUrl: z4.string().default("https://api.weixin.qq.com"),
  wechatAuthor: z4.string().default(""),
  defaultTheme: z4.string().default("professional-clean"),
  defaultImageSize: z4.enum(["1024x1024", "1024x1536", "1536x1024", "1344x768", "768x1344"]).default("1024x1024"),
  llmDefault: LlmOverrideSchema.default({}),
  imageProviders: z4.array(ImageProviderConfigSchema).default([
    { providerId: "openai", credentialRef: "WEWRITE_IMG_OPENAI" }
  ]),
  agentToolsEnabled: z4.boolean().default(false),
  runHistoryLimit: z4.number().int().min(1).max(1e3).default(200),
  hotspotAggregatorUrl: z4.string().default("")
});
var ArticleRecordSchema = z4.strictObject({
  v: z4.number().int().min(1),
  id: z4.string().min(1),
  slug: SlugSchema2,
  title: z4.string().min(1),
  digest: z4.string(),
  status: z4.enum(["editing", "rendered", "pushed", "failed"]),
  markdown: z4.string(),
  theme: z4.string(),
  bodyImageIds: z4.array(z4.string()).max(10).default([]),
  coverImageId: z4.string().optional(),
  wechatMediaId: z4.string().optional(),
  thumbMediaId: z4.string().optional(),
  lastRunId: z4.string().optional(),
  createdAt: z4.string(),
  updatedAt: z4.string()
});
var StepRecordSchema = z4.strictObject({
  name: z4.string().min(1),
  status: z4.enum(["pending", "running", "succeeded", "failed", "cancelled"]),
  startedAt: z4.string().optional(),
  finishedAt: z4.string().optional(),
  error: z4.strictObject({ code: z4.string().min(1), message: z4.string() }).optional(),
  metrics: z4.record(z4.string(), z4.unknown()).optional()
});
var RunRecordSchema = z4.strictObject({
  v: z4.number().int().min(1),
  id: z4.string().min(1),
  trigger: z4.enum(["manual", "schedule"]),
  scheduleId: z4.string().optional(),
  articleId: z4.string().optional(),
  paramsSnapshot: RunParamsSchema,
  status: z4.enum(RUN_STATUSES),
  steps: z4.array(StepRecordSchema),
  error: z4.strictObject({ code: z4.string().min(1), message: z4.string() }).optional(),
  summary: z4.string().optional(),
  startedAt: z4.string(),
  finishedAt: z4.string().optional()
});
var ScheduleRecordSchema = z4.strictObject({
  v: z4.number().int().min(1),
  id: z4.string().min(1),
  revision: z4.number().int().min(1),
  name: z4.string().min(1),
  rrule: z4.string().min(1),
  timeZone: TimeZoneSchema2,
  params: RunParamsSchema,
  publishTarget: z4.literal("draft"),
  enabled: z4.boolean(),
  nextRunAt: z4.string(),
  lastRunAt: z4.string().optional(),
  createdAt: z4.string().optional(),
  updatedAt: z4.string().optional()
});
var ImageRecordSchema = z4.strictObject({
  v: z4.number().int().min(1),
  id: z4.string().min(1),
  articleId: z4.string().min(1),
  kind: z4.enum(["cover", "body"]),
  mime: z4.string().regex(/^image\//, { message: "mime \u5FC5\u987B image/*" }),
  base64: z4.string().max(IMAGE_BASE64_MAX_CHARS),
  provider: z4.string().min(1),
  model: z4.string().min(1),
  prompt: z4.string(),
  wechatUrl: z4.string().optional(),
  wechatMediaId: z4.string().optional(),
  createdAt: z4.string()
});
var GlobalStateSchema = z4.strictObject({
  v: z4.literal(1),
  settings: SettingsRecordSchema,
  claimedOccurrences: z4.array(z4.string()).default([])
});
var INITIAL_GLOBAL = {
  v: 1,
  settings: SettingsRecordSchema.parse({}),
  claimedOccurrences: []
};
var domainSpec = {
  // 存储单元名受平台 UNIT_NAME_RE（/^[a-z][a-z0-9_]*$/）约束，连字符非法——
  // 用下划线形态，与 cordis 插件名（dsh-wewrite）区分。
  name: "dsh_wewrite",
  version: 1,
  global: { schema: GlobalStateSchema, initial: INITIAL_GLOBAL },
  tables: {
    articles: { valueSchema: ArticleRecordSchema },
    runs: { valueSchema: RunRecordSchema },
    schedules: { valueSchema: ScheduleRecordSchema },
    images: { valueSchema: ImageRecordSchema }
  }
};

// src/host/platform.ts
function resolveLogger(ctx, name2) {
  const candidate = typeof ctx.logger === "function" ? ctx.logger(name2) : ctx.logger;
  if (candidate) return candidate;
  const fallback = {
    info: (message) => console.log(`[${name2}] ${message}`),
    warn: (message) => console.warn(`[${name2}] ${message}`),
    error: (message) => console.error(`[${name2}] ${message}`)
  };
  return fallback;
}
function typedTable(domain, name2) {
  return domain.table(name2);
}

// src/host/rpc.ts
async function dispatch(service, endpoint, payload) {
  switch (endpoint) {
    case "snapshot":
      return service.snapshot();
    case "hotspots/fetch":
      return service.fetchHotspots(payload.limit ?? 20);
    case "article/list":
      return service.listArticles();
    case "article/get":
      return service.getArticle(String(payload.id));
    case "article/save":
      return service.saveArticle({
        ...payload.id ? { id: payload.id } : {},
        slug: String(payload.slug),
        title: String(payload.title),
        digest: String(payload.digest),
        markdown: String(payload.markdown),
        theme: String(payload.theme)
      });
    case "article/delete":
      return service.deleteArticle(String(payload.id));
    case "article/preview":
      return service.previewArticle(
        payload.id ? { id: payload.id } : { markdown: String(payload.markdown), theme: String(payload.theme) }
      );
    case "run/start":
      return service.startRun({
        trigger: "manual",
        params: payload.params,
        ...payload.articleId ? { articleId: payload.articleId } : {}
      });
    case "run/cancel":
      return service.cancelRun(String(payload.runId));
    case "schedule/save":
      return service.saveSchedule({
        ...payload.id ? { id: payload.id } : {},
        name: String(payload.name),
        rrule: String(payload.rrule),
        timeZone: String(payload.timeZone),
        params: payload.params,
        enabled: Boolean(payload.enabled)
      });
    case "schedule/delete":
      return service.deleteSchedule(String(payload.id));
    case "schedule/toggle":
      return service.toggleSchedule(String(payload.id), Boolean(payload.enabled));
    case "schedule/runNow":
      return service.runScheduleNow(String(payload.id));
    case "config/get":
      return service.getConfig();
    case "config/set":
      return service.setConfig(payload);
    case "credentials/set":
      return service.setCredential(String(payload.ref), String(payload.value));
    case "credentials/describe":
      return service.describeCredentials();
    case "llm/options":
      return service.listLlmOptions();
    case "wechat/pushDraft":
      return service.pushArticleDraft(String(payload.articleId));
    case "wechat/diagnose":
      return service.diagnoseWeChat();
    default:
      throw new Error(`\u672A\u77E5\u7AEF\u70B9\uFF1A${endpoint}`);
  }
}
function registerWewriteRpc(rpc, service, logger) {
  if (!rpc) {
    logger?.warn("dsh-wewrite: connection.rpc \u670D\u52A1\u7F3A\u5931\uFF0CWeb \u9762\u677F\u4E0D\u53EF\u7528\uFF08Agent \u5DE5\u5177\u4ECD\u53EF\u7528\uFF09");
    return Promise.resolve(() => void 0);
  }
  const truncate = (text) => text.length > 500 ? `${text.slice(0, 500)}\u2026` : text;
  const registered = rpc.handle(
    RPC_CHANNEL,
    async (endpoint, payload) => {
      const entry = rpcContract[endpoint];
      if (!entry) throw new Error(`\u672A\u77E5\u7AEF\u70B9\uFF1A${endpoint}`);
      const parsedRequest = entry.request.safeParse(payload ?? {});
      if (!parsedRequest.success || parsedRequest.data === void 0) {
        const issues = parsedRequest.error?.issues ?? [];
        throw new Error(`\u8BF7\u6C42\u6821\u9A8C\u5931\u8D25\uFF08${endpoint}\uFF09\uFF1A${issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
      }
      try {
        const result = await dispatch(service, endpoint, parsedRequest.data);
        const checked = entry.response.safeParse(result);
        if (!checked.success || checked.data === void 0) {
          const issues = checked.error?.issues ?? [];
          throw new Error(`\u54CD\u5E94\u5F62\u72B6\u6F02\u79FB\uFF08${endpoint}\uFF09\uFF1A${issues[0] ? `${issues[0].path.join(".")}: ${issues[0].message}` : "\u672A\u77E5\u95EE\u9898"}`);
        }
        return { ok: true, value: checked.data };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof Error && "code" in error ? String(error.code) : "rpc-failed",
            message: truncate(error instanceof Error ? error.message : String(error))
          }
        };
      }
    },
    { authority: RPC_AUTHORITY }
  );
  if (typeof registered === "function") return Promise.resolve(registered);
  return registered.then((dispose) => dispose ?? (() => void 0));
}

// src/render/blocks.ts
import { marked } from "marked";

// src/render/sanitize.ts
var TEXT_ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
var ATTR_ESCAPE = { "&": "&amp;", "<": "&lt;", '"': "&quot;" };
function escapeText(text) {
  return text.replace(/[&<>]/g, (ch) => TEXT_ESCAPE[ch]);
}
function escapeAttr(text) {
  return text.replace(/[&<"]/g, (ch) => ATTR_ESCAPE[ch]);
}
function escapeCode(text) {
  return text.replace(/[&<>"']/g, (ch) => ({ ...TEXT_ESCAPE, '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
var URL_SAFE_CHARS = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;
var URL_SCHEMES = /* @__PURE__ */ new Set(["http", "https", "mailto"]);
function sanitizeUrl(rawUrl) {
  const url = rawUrl.trim();
  if (!url) return null;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  if (scheme && !URL_SCHEMES.has(scheme[1].toLowerCase())) return null;
  if (!URL_SAFE_CHARS.test(url)) return null;
  return url;
}
var ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "font",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
]);
var ALLOWED_ATTRS = /* @__PURE__ */ new Set([
  "align",
  "alt",
  "class",
  "colspan",
  "height",
  "href",
  "rowspan",
  "size",
  "src",
  "start",
  "style",
  "title",
  "width"
]);
var VOID_TAGS = /* @__PURE__ */ new Set(["br", "hr", "img"]);
function sanitizeHtmlTag(rawTag) {
  const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)>$/s.exec(rawTag);
  if (!match) return null;
  const [, closing, rawName, attrText] = match;
  const name2 = rawName.toLowerCase();
  if (!ALLOWED_TAGS.has(name2)) return null;
  if (closing) return `</${name2}>`;
  const attrs = [];
  const attrRe = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let attrMatch;
  while (attrMatch = attrRe.exec(attrText)) {
    const attrName = attrMatch[1].toLowerCase();
    if (!ALLOWED_ATTRS.has(attrName) || attrName.startsWith("on")) continue;
    const rawValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
    if (attrName === "href" || attrName === "src") {
      const url = sanitizeUrl(rawValue);
      if (url === null) continue;
      attrs.push(`${attrName}="${escapeAttr(url)}"`);
      continue;
    }
    const value = rawValue.replace(/[<>]/g, "").replace(/[\u0000-\u001f]/g, "");
    attrs.push(`${attrName}="${escapeAttr(value)}"`);
  }
  const attrSuffix = attrs.length ? ` ${attrs.join(" ")}` : "";
  return VOID_TAGS.has(name2) ? `<${name2}${attrSuffix} />` : `<${name2}${attrSuffix}>`;
}
function sanitizeHtmlFragment(text) {
  return text.replace(/<\/?[a-zA-Z][^>]*>|[^<]+/gs, (part) => {
    if (!part.startsWith("<")) return escapeText(part);
    const sanitized = sanitizeHtmlTag(part);
    return sanitized ?? escapeText(part);
  });
}

// src/render/inline.ts
function pythonInlineToHtml(text, theme, breaks = true) {
  let html = "";
  let rest = text;
  for (let guard = 0; guard < 1e5 && rest; guard += 1) {
    const position = text.length - rest.length;
    const prevChar = position > 0 ? text[position - 1] : "";
    const allowLeadingSpace = position > 0 && !/[\s*]/.test(prevChar);
    let match;
    if (match = /^\\([\\`*_{}[\]()#+\-.!>~|])/.exec(rest)) {
      html += escapeText(match[1]);
      rest = rest.slice(match[0].length);
      continue;
    }
    if (match = /^`+/.exec(rest)) {
      const run = match[0];
      const closerMatch = new RegExp(`(?<!\`)${run}(?!\`)`).exec(rest.slice(run.length));
      if (closerMatch) {
        const content = rest.slice(run.length, run.length + closerMatch.index).trim();
        html += `<code style="${theme.code}">${escapeCode(content)}</code>`;
        rest = rest.slice(run.length + closerMatch.index + run.length);
        continue;
      }
      html += escapeText(rest[0]);
      rest = rest.slice(1);
      continue;
    }
    if ((match = /^(\*\*)([\s\S]+?)\*\*/.exec(rest)) && (allowLeadingSpace || !/^\s/.test(match[2]))) {
      html += `<strong style="${theme.strong}">${pythonInlineToHtml(match[2], theme, breaks)}</strong>`;
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = /^\*([^*\n]+?)\*/.exec(rest)) && (allowLeadingSpace || !/^\s/.test(match[1]))) {
      html += `<em style="${theme.em}">${pythonInlineToHtml(match[1], theme, breaks)}</em>`;
      rest = rest.slice(match[0].length);
      continue;
    }
    if (match = /^!\[([^\]]*)\]\(\s*([^)\s]+)\s*(?:['"]([^)]*)['"]\s*)?\)/.exec(rest)) {
      const url = sanitizeUrl(match[2]);
      if (url === null) {
        html += escapeText(match[1]);
      } else {
        html += `<img alt="${escapeAttr(match[1])}" src="${escapeAttr(url)}" style="${theme.img}"${match[3] ? ` title="${escapeAttr(match[3])}"` : ""} />`;
      }
      rest = rest.slice(match[0].length);
      continue;
    }
    if (match = /^\[([^\]]*)\]\(\s*([^)\s]+)\s*(?:['"]([^)]*)['"]\s*)?\)/.exec(rest)) {
      const url = sanitizeUrl(match[2]);
      const inner = pythonInlineToHtml(match[1], theme, breaks);
      if (url === null) {
        html += inner;
      } else {
        html += `<a href="${escapeAttr(url)}" style="${theme.a}"${match[3] ? ` title="${escapeAttr(match[3])}"` : ""}>${inner}</a>`;
      }
      rest = rest.slice(match[0].length);
      continue;
    }
    if (match = /^<\/?[a-zA-Z][^>]*>/.exec(rest)) {
      const sanitized = sanitizeHtmlTag(match[0]);
      html += sanitized ?? escapeText(match[0]);
      rest = rest.slice(match[0].length);
      continue;
    }
    if (match = /^&[a-zA-Z][a-zA-Z0-9]*;|^&#\d+;|^&#x[0-9a-fA-F]+;/.exec(rest)) {
      html += match[0];
      rest = rest.slice(match[0].length);
      continue;
    }
    const textRun = /^[^\\`*[!<&]+/.exec(rest);
    const chunkSource = textRun ? textRun[0] : rest[0];
    const chunk = breaks ? escapeText(chunkSource).replace(/\n/g, "<br />\n") : escapeText(chunkSource);
    html += chunk;
    rest = rest.slice(chunkSource.length);
  }
  return html;
}
function stripParagraphLines(text) {
  return text.split("\n").map((line) => line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "")).join("\n");
}

// src/render/repairs.ts
function mergeAdjacentBlockquotes(tokens) {
  const merged = [];
  for (const token of tokens) {
    if (token.type === "space") {
      merged.push(token);
      continue;
    }
    let previous = merged[merged.length - 1];
    while (previous?.type === "space") {
      merged.pop();
      previous = merged[merged.length - 1];
    }
    if (token.type === "blockquote" && previous?.type === "blockquote") {
      const index = merged.indexOf(previous);
      merged[index] = { ...previous, tokens: [...previous.tokens ?? [], ...token.tokens ?? []] };
      continue;
    }
    merged.push(token);
  }
  return merged;
}
function splitDetachedTails(tokens) {
  const out = [];
  for (const token of tokens) {
    if (token.type !== "list") {
      out.push(token);
      continue;
    }
    let currentItems = [];
    const flush = () => {
      if (!currentItems.length) return;
      const firstMarker = /^\s*(\d+)[.)][ \t]/.exec(currentItems[0].raw ?? "");
      const start = token.ordered && firstMarker ? Number(firstMarker[1]) : void 0;
      out.push({
        ...token,
        items: currentItems,
        raw: currentItems.map((item) => item.raw).join(""),
        ...start !== void 0 ? { start } : {}
      });
      currentItems = [];
    };
    for (const item of token.items ?? []) {
      const raw = item.raw ?? "";
      const firstBlank = raw.match(/[ \t]*\n/) ? raw.search(/\n[ \t]*\n/) : -1;
      const tail = firstBlank === -1 ? null : raw.slice(firstBlank);
      const tailLines = tail ? tail.split("\n").filter((line) => line.trim()) : [];
      const tailIsDetached = tail !== null && tailLines.length > 0 && tailLines.every((line) => /^[ \t]{1,3}\S/.test(line)) && !tailLines.some((line) => /^[ \t]*([-*+]|\d+[.)])[ \t]/.test(line)) && !tail.includes("```");
      if (!tailIsDetached) {
        currentItems.push(item);
        continue;
      }
      currentItems.push({ ...item, raw: `${raw.slice(0, firstBlank)}
` });
      flush();
      for (const paragraphText of tail.split(/\n[ \t]*\n/)) {
        const text = paragraphText.replace(/\n+$/, "");
        if (text.trim()) out.push({ type: "paragraph", raw: text, text });
      }
    }
    flush();
  }
  return out;
}
function repairListInterrupts(tokens) {
  const repaired = [];
  for (const token of tokens) {
    if (token.type === "blockquote" && Array.isArray(token.tokens)) {
      repaired.push({ ...token, tokens: repairListInterrupts(token.tokens) });
      continue;
    }
    if (token.type === "list" && Array.isArray(token.items)) {
      repaired.push({
        ...token,
        items: token.items.map(
          (item) => Array.isArray(item.tokens) ? { ...item, tokens: repairBlockTokensInItem(item.tokens) } : item
        )
      });
      continue;
    }
    repaired.push(token);
  }
  return mergeInterruptedPairs(repaired);
}
function repairBlockTokensInItem(tokens) {
  const repaired = tokens.map(
    (token) => token.type === "blockquote" && Array.isArray(token.tokens) ? { ...token, tokens: repairListInterrupts(token.tokens) } : token
  );
  return mergeInterruptedPairs(repaired);
}
function mergeInterruptedPairs(tokens) {
  const merged = [...tokens];
  for (let index = 1; index < merged.length; index += 1) {
    const previous = merged[index - 1];
    const current = merged[index];
    const interrupting = current?.type === "list" || current?.type === "table";
    if (interrupting && previous?.type === "paragraph" && !/\n\s*\n$/.test(previous.raw ?? "")) {
      const mergedText = `${previous.raw ?? ""}${current.raw ?? ""}`;
      merged.splice(index - 1, 2, { type: "paragraph", raw: mergedText, text: mergedText.trim() });
      index -= 1;
    }
  }
  return merged;
}

// src/render/blocks.ts
var PIPE_SENTINEL = "\uE000";
var ALIGN_STYLE = {
  left: "text-align: left;",
  center: "text-align: center;",
  right: "text-align: right;"
};
function renderCodeBlock(token, theme) {
  const raw = token.text ?? "";
  const code = raw.endsWith("\n") ? raw : `${raw}
`;
  const cleaned = code.replace(/[ \t]+\n/g, "\n");
  return `<pre style="${theme.pre}"><code style="${theme.preCode}">${escapeCode(cleaned)}</code></pre>
`;
}
function renderHeading(token, theme) {
  const depth = token.depth ?? 1;
  const level = depth <= 2 ? 2 : 3;
  const style = level === 2 ? theme.h2 : theme.h3;
  return `<h${level} style="${style}">${pythonInlineToHtml(token.text ?? "", theme)}</h${level}>`;
}
function renderBlock(token, theme) {
  switch (token.type) {
    case "paragraph":
      return `<p style="${theme.p}">${pythonInlineToHtml(stripParagraphLines(token.text ?? ""), theme)}</p>`;
    case "heading":
      return renderHeading(token, theme);
    case "text":
      return pythonInlineToHtml(token.text ?? "", theme);
    case "code":
      return renderCodeBlock(token, theme);
    case "blockquote": {
      if ((token.tokens ?? []).some((child) => child.type === "code")) {
        const groups = [];
        let current = [];
        for (const child of token.tokens ?? []) {
          if (child.type === "space") {
            if (current.length) groups.push(current);
            current = [];
            continue;
          }
          current.push(child);
        }
        if (current.length) groups.push(current);
        const paragraphs = groups.map(
          (group) => group.map((child) => {
            if (child.type === "code") return (child.raw ?? "").replace(/\n```/, "```");
            return (child.raw ?? child.text ?? "").replace(/\n+$/, "");
          }).join("\n")
        ).map((text) => `<p style="${theme.p}">${pythonInlineToHtml(text, theme)}</p>`);
        return `<blockquote style="${theme.blockquote}">
${paragraphs.join("\n")}
</blockquote>`;
      }
      const inner = renderBlocks(token.tokens ?? [], theme).join("\n");
      return `<blockquote style="${theme.blockquote}">
${inner}
</blockquote>`;
    }
    case "hr":
      return `<hr style="${theme.hr}" />`;
    case "list":
      return renderList(token, theme);
    case "table":
      return renderTable(token, theme);
    case "html":
      return sanitizeHtmlFragment(token.text ?? "");
    case "space":
      return "";
    default:
      return escapeText(token.raw ?? "");
  }
}
function renderBlocks(tokens, theme) {
  return tokens.map((token) => renderBlock(token, theme)).filter((block) => block !== "");
}
function renderList(token, theme) {
  const tag = token.ordered ? "ol" : "ul";
  const startAttr = token.ordered && token.start != null && token.start !== 1 ? ` start="${token.start}"` : "";
  const items = (token.items ?? []).map((item, itemIndex, items2) => {
    const prevRaw = itemIndex > 0 ? items2[itemIndex - 1].raw ?? "" : "";
    const hasBlankAfterPrev = /\n[ \t]*\n[ \t]*$/.test(prevRaw);
    const hasBlankAfterSelf = /\n[ \t]*\n[ \t]*$/.test(item.raw ?? "");
    const loose = hasBlankAfterPrev || hasBlankAfterSelf;
    const inlineFence = (child) => (child.raw ?? "").replace(/^[ \t]+(?=```)/, "").replace(/\n```/, "```");
    const itemFirstNewline = (item.raw ?? "").indexOf("\n");
    const itemRest = itemFirstNewline === -1 ? "" : (item.raw ?? "").slice(itemFirstNewline + 1);
    const hasShallowSublist = /^[ \t]{1,3}(?:[-*+]|\d+[.)]) /m.test(itemRest);
    if (loose) {
      const hasNested = (item.tokens ?? []).some(
        (child) => child.type === "list" && !hasShallowSublist || child.type === "blockquote"
      );
      if (!hasNested) {
        const rawLines = (item.raw ?? "").replace(/\n+$/, "").split("\n");
        const firstLine = rawLines[0].replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/, "");
        const restLines = rawLines.slice(1);
        const paragraphGroups = [];
        let group = [firstLine];
        for (const line of restLines) {
          if (!line.trim()) {
            paragraphGroups.push(group);
            group = [];
            continue;
          }
          group.push(line);
        }
        paragraphGroups.push(group);
        const paragraphs = paragraphGroups.filter((lines) => lines.length).map((lines) => lines.map((line) => line.replace(/[ \t]+$/, "").replace(/^[ \t]+(?=```)/, "")).join("\n")).map((text) => `<p style="${theme.p}">${pythonInlineToHtml(text, theme)}</p>`);
        return `<li style="${theme.li}">
${paragraphs.join("\n")}
</li>`;
      }
      const blocks = (item.tokens ?? []).filter((child) => !child.hidden && child.type !== "space").map((child) => {
        if (child.type === "code") return `<p style="${theme.p}">${pythonInlineToHtml(inlineFence(child), theme)}</p>`;
        if (child.type === "text" || child.type === "paragraph") {
          return `<p style="${theme.p}">${pythonInlineToHtml((child.text ?? "").replace(/\n+$/, ""), theme)}</p>`;
        }
        return renderBlock(child, theme);
      }).filter((part) => part !== "");
      return `<li style="${theme.li}">
${blocks.join("\n")}
</li>`;
    }
    const innerTokens = item.tokens ?? [];
    const taskPrefix = item.task ? `[${item.checked ? "x" : " "}] ` : "";
    const textParts = [];
    const nestedBlocks = [];
    for (const child of innerTokens) {
      if ((child.type === "text" || child.type === "paragraph") && !child.hidden) {
        textParts.push(child.text ?? "");
      } else if (child.type === "code") {
        textParts.push(inlineFence(child));
      } else if (child.type === "list" && !hasShallowSublist) nestedBlocks.push(child);
      else if (child.type === "blockquote") nestedBlocks.push(child);
    }
    let leadText = textParts.join("\n");
    if (!nestedBlocks.length && textParts.length) {
      const raw = (item.raw ?? "").replace(/\n+$/, "");
      let firstLine = raw.split("\n", 1)[0].replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/, "");
      if (item.task) firstLine = firstLine.replace(/^\[[ xX]\][ \t]+/, "");
      const newlineIndex = raw.indexOf("\n");
      const restLines = newlineIndex === -1 ? [] : raw.slice(newlineIndex + 1).split("\n");
      const allLines = [firstLine, ...restLines].map(
        (line) => line.replace(/[ \t]+$/, "").replace(/^[ \t]+(?=```)/, "")
      );
      leadText = allLines.join("\n").replace(/\n+$/, "");
    }
    const lead = pythonInlineToHtml(taskPrefix + leadText, theme);
    const nested = nestedBlocks.map((child) => renderBlock(child, theme));
    const body = nested.length ? [lead, ...nested].filter((part) => part !== "").join("\n") : lead;
    return `<li style="${theme.li}">${body}</li>`;
  });
  return `<${tag} style="${token.ordered ? theme.ol : theme.ul}"${startAttr}>
${items.join("\n")}
</${tag}>`;
}
function renderTable(token, theme) {
  const cellText = (cell) => pythonInlineToHtml((cell.text ?? "").replace(/\uE000/g, "|"), theme);
  const headCells = (token.header ?? []).map((cell, index) => `<th${mergeStyle(theme.th, (token.align ?? [])[index])}>${cellText(cell)}</th>`).join("\n");
  const rows = (token.rows ?? []).map(
    (row) => `<tr>
${row.map((cell, index) => `<td${mergeStyle(theme.td, (token.align ?? [])[index])}>${cellText(cell)}</td>`).join("\n")}
</tr>`
  );
  return [
    `<table style="${theme.table}">`,
    "<thead>",
    `<tr>
${headCells}
</tr>`,
    "</thead>",
    "<tbody>",
    ...rows,
    "</tbody>",
    "</table>"
  ].join("\n");
}
function mergeStyle(baseStyle, align) {
  const alignStyle = align ? ALIGN_STYLE[align] : "";
  return ` style="${alignStyle ? `${baseStyle} ${alignStyle}` : baseStyle}"`;
}
function renderMarkdownBody(markdownText, theme) {
  const prepared = markdownText.split("\n").map((line) => {
    if (!line.startsWith("|")) return line;
    return line.replace(/\\\|/g, PIPE_SENTINEL).replace(/`[^`|]*\|[^`]*`/g, (span) => span.replace(/\|/g, PIPE_SENTINEL));
  }).join("\n");
  const tokens = marked.lexer(prepared, { gfm: true, breaks: true });
  const repaired = splitDetachedTails(mergeAdjacentBlockquotes(repairListInterrupts(tokens)));
  return renderBlocks(repaired, theme).join("\n");
}

// src/render/themes.ts
var BASE_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
var MONO_FONT = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
var professionalClean = {
  id: "professional-clean",
  section: `font-family: ${BASE_FONT}; line-height: 1.8; color: #333; font-size: 16px; padding: 0 16px; max-width: 100%; box-sizing: border-box;`,
  p: "margin: 12px 0; text-align: justify;",
  h2: "font-size: 19px; font-weight: bold; margin: 22px 0 12px; color: #222;",
  h3: "font-size: 17px; font-weight: bold; margin: 18px 0 10px; color: #333;",
  strong: "color: #111; font-weight: 600;",
  em: "color: #555;",
  a: "color: #576b95; text-decoration: none; word-break: break-all;",
  code: `background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: ${MONO_FONT}; font-size: 14px; color: #c7254e;`,
  pre: "background: #282c34; color: #abb2bf; padding: 16px; border-radius: 6px; overflow-x: auto; margin: 14px 0; line-height: 1.5;",
  preCode: "background: none; padding: 0; color: inherit; font-size: 13px; white-space: pre;",
  blockquote: "border-left: 4px solid #ddd; margin: 14px 0; padding: 8px 16px; color: #666; background: #fafafa;",
  table: "width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px;",
  th: "border: 1px solid #ddd; padding: 8px 12px; text-align: left; background: #f5f5f5; font-weight: 600;",
  td: "border: 1px solid #ddd; padding: 8px 12px; text-align: left;",
  ul: "padding-left: 20px; margin: 10px 0;",
  ol: "padding-left: 20px; margin: 10px 0;",
  li: "margin: 4px 0;",
  hr: "border: none; border-top: 1px solid #eee; margin: 20px 0;",
  img: "max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 4px;"
};
var techDark = {
  ...professionalClean,
  id: "tech-dark",
  section: `font-family: ${BASE_FONT}; line-height: 1.8; color: #d7dae0; font-size: 16px; padding: 0 16px; max-width: 100%; box-sizing: border-box; background: #1e222a;`,
  h2: "font-size: 19px; font-weight: bold; margin: 22px 0 12px; color: #e8eaed;",
  h3: "font-size: 17px; font-weight: bold; margin: 18px 0 10px; color: #cfd3dc;",
  strong: "color: #f2f3f5; font-weight: 600;",
  code: `background: #2c313a; padding: 2px 6px; border-radius: 3px; font-family: ${MONO_FONT}; font-size: 14px; color: #98c379;`,
  blockquote: "border-left: 4px solid #4b5263; margin: 14px 0; padding: 8px 16px; color: #9da5b4; background: #23272f;",
  th: "border: 1px solid #4b5263; padding: 8px 12px; text-align: left; background: #2c313a; font-weight: 600;",
  td: "border: 1px solid #4b5263; padding: 8px 12px; text-align: left;"
};
var minimalGray = {
  ...professionalClean,
  id: "minimal-gray",
  p: "margin: 14px 0; text-align: justify; color: #444;",
  h2: "font-size: 18px; font-weight: bold; margin: 24px 0 12px; color: #111; padding-left: 10px; border-left: 3px solid #999;",
  h3: "font-size: 16px; font-weight: bold; margin: 18px 0 10px; color: #333;",
  code: `background: #ececec; padding: 2px 5px; border-radius: 2px; font-family: ${MONO_FONT}; font-size: 14px; color: #333;`,
  blockquote: "border-left: 3px solid #bbb; margin: 14px 0; padding: 6px 14px; color: #777;"
};
var THEMES = {
  "professional-clean": professionalClean,
  "tech-dark": techDark,
  "minimal-gray": minimalGray
};
function resolveTheme(themeId) {
  return THEMES[themeId ?? ""] ?? professionalClean;
}

// src/render/convert.ts
function cjkSpacing(text) {
  return text.replace(/([A-Za-z0-9])([^\x00-\x7f])/g, "$1 $2").replace(/([^\x00-\x7f])([A-Za-z0-9])/g, "$1 $2");
}
function stripInternalMarkers(text) {
  return text.replace(/<!--\s*\u270F\uFE0F\s*编辑(?:建议|提醒)[\s\S]*?-->/g, "").replace(/^.*\u270F\uFE0F\s*编辑(?:建议|提醒).*$/gm, "");
}
function convertArticle(input) {
  const theme = resolveTheme(input.theme);
  const processed = stripInternalMarkers(input.markdown ?? "");
  const bodyHtml = cjkSpacing(renderMarkdownBody(processed, theme).replace(/\n+$/, ""));
  return `<section style="${theme.section}">
${bodyHtml}
</section>`;
}

// src/host/pipeline/engine.ts
import { randomUUID } from "node:crypto";

// src/host/pipeline/llm.ts
function toHostOptions(options) {
  return {
    purpose: options.purpose,
    provider: options.provider,
    model: options.model,
    system: options.system,
    messages: [
      {
        id: `wewrite-${Date.now().toString(36)}`,
        role: "user",
        content: [{ type: "text", text: options.user }],
        source: { kind: "plugin", plugin: "dsh-wewrite", form: "live" }
      }
    ],
    ...options.maxTokens ? { maxTokens: options.maxTokens } : {}
  };
}
var BlockAssembler = class {
  parts = [];
  push(chunk) {
    if (chunk.type !== "text-delta") return;
    const text = chunk.text;
    if (typeof text === "string" && text) this.parts.push(text);
  }
  getText() {
    return this.parts.join("").trim();
  }
};
async function streamLlmText(llm, options, signal) {
  const assembler = new BlockAssembler();
  const iterable = await llm.stream(toHostOptions(options));
  for await (const chunk of iterable) {
    if (signal.aborted) return { status: "aborted" };
    if (chunk.type === "text-delta") {
      assembler.push(chunk);
      continue;
    }
    if (chunk.type === "finish") {
      const reason = chunk.reason;
      if (reason?.kind === "aborted") return { status: "aborted" };
      if (reason?.kind === "error") {
        return {
          status: "error",
          code: reason.failure?.code || "llm-error",
          message: reason.failure?.message || "\u4F9B\u5E94\u5546\u8FD4\u56DE\u9519\u8BEF\uFF08\u65E0\u8BE6\u7EC6\u4FE1\u606F\uFF09"
        };
      }
      return { status: "ok", text: assembler.getText() };
    }
  }
  return { status: "ok", text: assembler.getText() };
}
var SYSTEM_STYLE = [
  "\u4F60\u662F\u4E00\u4F4D\u957F\u671F\u7ED9\u6280\u672F\u7C7B\u516C\u4F17\u53F7\u5199\u7A3F\u7684\u4F5C\u8005\uFF0C\u884C\u6587\u514B\u5236\u3001\u4FE1\u606F\u5BC6\u5EA6\u9AD8\u3002",
  "\u4E0D\u5199\u5957\u8BDD\u4E0E\u603B\u7ED3\u8154\uFF0C\u4E0D\u7528\u300C\u603B\u800C\u8A00\u4E4B\u300D\u300C\u503C\u5F97\u4E00\u63D0\u300D\u4E00\u7C7B\u7A7A\u8F6C\u8BCD\u3002",
  "\u9762\u5411\u5DF2\u5177\u5907\u5DE5\u7A0B\u80CC\u666F\u7684\u8BFB\u8005\uFF0C\u76F4\u63A5\u8FDB\u5165\u5177\u4F53\u4E8B\u5B9E\u4E0E\u53D6\u820D\u3002"
].join("");
function outlineUserPrompt(topic) {
  return [
    `\u4E3B\u9898\uFF1A${topic}`,
    "",
    "\u8BF7\u7ED9\u51FA\u4E00\u7BC7\u6587\u7AE0\u5927\u7EB2\uFF1A",
    "- 5 \u5230 8 \u4E2A\u4E8C\u7EA7\u6807\u9898\u5C0F\u8282\uFF0C\u6BCF\u8282\u4E00\u53E5\u8BDD\u8BF4\u660E\u8981\u8986\u76D6\u7684\u5177\u4F53\u5185\u5BB9\uFF1B",
    "- \u6807\u6CE8\u6BCF\u8282\u8BA1\u5212\u51FA\u73B0\u7684\u5177\u4F53\u8BC1\u636E\u7C7B\u578B\uFF08\u6570\u636E/\u547D\u4EE4/\u5BF9\u6BD4/\u4EB2\u5386\u7EC6\u8282\uFF09\uFF1B",
    "- \u4E0D\u5199\u5F15\u8A00\u8282\u4E0E\u603B\u7ED3\u8282\uFF0C\u9996\u8282\u76F4\u63A5\u5207\u5165\u4E3B\u4F53\u3002"
  ].join("\n");
}
function draftUserPrompt(topic, outline) {
  return [
    `\u4E3B\u9898\uFF1A${topic}`,
    "",
    "\u5927\u7EB2\u5982\u4E0B\uFF1A",
    outline,
    "",
    "\u8BF7\u6210\u7A3F\uFF1A",
    "- Markdown \u8F93\u51FA\uFF0C\u6807\u9898\u5C42\u7EA7\u4ECE ## \u5F00\u59CB\uFF08\u4E00\u7EA7\u6807\u9898\u7531\u53D1\u5E03\u5B57\u6BB5\u627F\u8F7D\uFF0C\u6B63\u6587\u4E0D\u51FA\u73B0\uFF09\uFF1B",
    "- \u6BCF\u8282\u5305\u542B\u81F3\u5C11\u4E00\u5904\u5177\u4F53\u7EC6\u8282\uFF08\u6570\u5B57\u3001\u547D\u4EE4\u3001\u4EE3\u7801\u6216\u5BF9\u6BD4\u7ED3\u8BBA\uFF09\uFF1B",
    "- \u6BB5\u843D\u957F\u77ED\u4EA4\u66FF\uFF0C\u907F\u514D\u8FDE\u7EED\u540C\u957F\u6BB5\uFF1B",
    "- \u6B63\u6587\u914D\u56FE\u4F4D\u7F6E\u4EE5\u300C![\u63CF\u8FF0](\u56FE\u7247\u5F85\u751F\u6210)\u300D\u5360\u4F4D\uFF0C\u540E\u7EED\u7BA1\u7EBF\u4F1A\u66FF\u6362\u3002"
  ].join("\n");
}
function pipelineSystemPrompt() {
  return SYSTEM_STYLE;
}

// src/host/pipeline/engine.ts
var PIPELINE_STEP_NAMES = ["topic", "outline", "draft", "gates", "render", "images"];
var PipelineStepError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "PipelineStepError";
  }
  code;
  details;
};
var TERMINAL_STATUSES = /* @__PURE__ */ new Set(["succeeded", "failed", "cancelled", "interrupted"]);
function pruneTerminalRuns(runs, limit) {
  const active = runs.filter((run) => !TERMINAL_STATUSES.has(run.status));
  const terminal = runs.filter((run) => TERMINAL_STATUSES.has(run.status)).sort((left, right) => Date.parse(right.finishedAt ?? right.startedAt) - Date.parse(left.finishedAt ?? left.startedAt));
  return [...active, ...terminal.slice(0, Math.max(0, limit))];
}
function createPipelineEngine(deps) {
  const nowIso = () => deps.now ? deps.now().toISOString() : (/* @__PURE__ */ new Date()).toISOString();
  const controllers = /* @__PURE__ */ new Map();
  const ABORT_SENTINEL = /* @__PURE__ */ Symbol("wewrite-abort");
  function throwAborted() {
    throw ABORT_SENTINEL;
  }
  function patchStep(runId, name2, patch) {
    deps.store.update(runId, (run) => ({
      ...run,
      steps: run.steps.map((step) => step.name === name2 ? { ...step, ...patch } : step)
    }));
  }
  function resolveLlmCall(params) {
    const merged = params.llm ?? {};
    if (!merged.provider || !merged.model) {
      throw new PipelineStepError(
        "llm-not-configured",
        "\u6A21\u578B\u670D\u52A1\u672A\u914D\u7F6E\uFF1A\u8BF7\u5728 \u8BBE\u7F6E \u2192 \u6A21\u578B\u670D\u52A1 \u9009\u62E9\u4F9B\u5E94\u5546\u4E0E\u6A21\u578B\u540E\u518D\u8FD0\u884C\u7BA1\u7EBF"
      );
    }
    return { provider: merged.provider, model: merged.model };
  }
  async function execute(runId, opts, signal) {
    const { params } = opts;
    deps.store.update(runId, (run) => ({ ...run, status: "running" }));
    let topic = "";
    let outline = "";
    let draft = "";
    let producedArticleId;
    let runStatus = "succeeded";
    let runError;
    let imagesResult;
    const finishRun = (status, error) => {
      deps.store.update(runId, (run) => ({
        ...run,
        status,
        ...error ? { error } : {},
        finishedAt: nowIso()
      }));
    };
    for (const stepName of PIPELINE_STEP_NAMES) {
      if (signal.aborted) {
        runStatus = "cancelled";
        break;
      }
      const startedAt = nowIso();
      patchStep(runId, stepName, { status: "running", startedAt });
      try {
        if (stepName === "topic") {
          if (params.topicMode === "hotspots") {
            if (!deps.topicSource) throw new PipelineStepError("topic-source-missing", "\u70ED\u699C\u6E90\u672A\u88C5\u914D\uFF0C\u65E0\u6CD5\u4EE5\u70ED\u699C\u6A21\u5F0F\u9009\u9898");
            const items = await deps.topicSource.fetch(20);
            const first = items[0];
            if (!first) throw new PipelineStepError("topic-empty", "\u70ED\u699C\u6E90\u5168\u90E8\u4E3A\u7A7A\uFF0C\u672C\u6B21\u8FD0\u884C\u65E0\u9898\u53EF\u9009");
            topic = first.title;
            patchStep(runId, stepName, { metrics: { topicSource: first.source, topicUrl: first.url } });
          } else {
            if (!params.topic) throw new PipelineStepError("topic-missing", "\u56FA\u5B9A\u9009\u9898\u6A21\u5F0F\u4E0B topic \u4E0D\u80FD\u4E3A\u7A7A");
            topic = params.topic;
          }
        } else if (stepName === "outline") {
          const llmCall = resolveLlmCall(params);
          const outcome = await streamLlmText(
            deps.llm,
            { purpose: "wewrite-pipeline", system: pipelineSystemPrompt(), user: outlineUserPrompt(topic), ...llmCall },
            signal
          );
          if (outcome.status === "aborted") throwAborted();
          if (outcome.status === "error") throw new PipelineStepError(outcome.code, outcome.message);
          outline = outcome.text;
          patchStep(runId, stepName, { metrics: { chars: outline.length } });
        } else if (stepName === "draft") {
          const llmCall = resolveLlmCall(params);
          const outcome = await streamLlmText(
            deps.llm,
            { purpose: "wewrite-pipeline", system: pipelineSystemPrompt(), user: draftUserPrompt(topic, outline), ...llmCall },
            signal
          );
          if (outcome.status === "aborted") throwAborted();
          if (outcome.status === "error") throw new PipelineStepError(outcome.code, outcome.message);
          draft = outcome.text;
          patchStep(runId, stepName, { metrics: { chars: draft.length } });
        } else if (stepName === "gates") {
          const verdict = await deps.gates.run({ markdown: draft });
          patchStep(runId, stepName, { metrics: { report: verdict.report } });
          if (!verdict.passed) {
            throw new PipelineStepError("gates-failed", "\u8D28\u91CF\u95E8\u7981\u672A\u901A\u8FC7\uFF0C\u9ED8\u8BA4\u63A8\u9001\u8DEF\u5F84\u5DF2\u88AB\u963B\u65AD", verdict.report);
          }
        } else if (stepName === "render") {
          const html = deps.renderer.convert({ markdown: draft, theme: params.theme });
          patchStep(runId, stepName, { metrics: { htmlChars: html.length } });
          if (deps.onProduced) {
            const returnedArticleId = await deps.onProduced({ markdown: draft, runId });
            if (typeof returnedArticleId === "string" && returnedArticleId) producedArticleId = returnedArticleId;
          }
        } else {
          const count = params.imageCount ?? 0;
          if (count > 0) {
            imagesResult = await deps.images.generate({
              count,
              ...producedArticleId ? { articleId: producedArticleId } : {}
            });
            patchStep(runId, stepName, {
              metrics: {
                coverImageId: imagesResult.coverImageId,
                bodyImageCount: imagesResult.bodyImageIds.length
              }
            });
            if (producedArticleId && deps.onImagesBound && (imagesResult.coverImageId || imagesResult.bodyImageIds.length)) {
              await deps.onImagesBound({
                articleId: producedArticleId,
                ...imagesResult.coverImageId ? { coverImageId: imagesResult.coverImageId } : {},
                bodyImageIds: imagesResult.bodyImageIds
              });
            }
          } else {
            patchStep(runId, stepName, { metrics: { skipped: "imageCount=0" } });
          }
        }
        patchStep(runId, stepName, { status: "succeeded", finishedAt: nowIso() });
      } catch (thrown) {
        if (thrown === ABORT_SENTINEL || signal.aborted) {
          patchStep(runId, stepName, { status: "cancelled", finishedAt: nowIso() });
          runStatus = "cancelled";
          break;
        }
        const code = thrown instanceof PipelineStepError ? thrown.code : "step-error";
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        patchStep(runId, stepName, {
          status: "failed",
          finishedAt: nowIso(),
          error: { code, message }
        });
        if (stepName === "images") {
          continue;
        }
        runStatus = "failed";
        runError = { code, message };
        break;
      }
    }
    finishRun(runStatus, runError);
    controllers.delete(runId);
  }
  const begin = (opts) => {
    const runId = `run_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const controller = new AbortController();
    controllers.set(runId, controller);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const run = {
      v: 1,
      id: runId,
      trigger: opts.trigger,
      ...opts.scheduleId ? { scheduleId: opts.scheduleId } : {},
      ...opts.articleId ? { articleId: opts.articleId } : {},
      paramsSnapshot: opts.params,
      status: "queued",
      steps: PIPELINE_STEP_NAMES.map((name2) => ({ name: name2, status: "pending" })),
      startedAt: nowIso()
    };
    deps.store.put(run);
    const done = execute(runId, opts, controller.signal).then(() => runId);
    return { runId, done };
  };
  const api = {
    begin,
    start: (opts) => begin(opts).done,
    cancel(runId) {
      const controller = controllers.get(runId);
      const run = deps.store.get(runId);
      if (!controller || !run) return false;
      if (run.status !== "running" && run.status !== "queued") return false;
      controller.abort();
      return true;
    },
    async resumeInterrupted() {
      let recovered = 0;
      for (const run of deps.store.all()) {
        if (run.status !== "running" && run.status !== "queued") continue;
        deps.store.update(run.id, (current) => ({ ...current, status: "interrupted", finishedAt: nowIso() }));
        recovered += 1;
      }
      return recovered;
    }
  };
  return api;
}

// src/host/pipeline/steps/topic.ts
async function aggregateHotspots(sources, limit) {
  const failures = [];
  const items = [];
  const settled = await Promise.allSettled(sources.map((source) => source.fetch()));
  settled.forEach((result, index) => {
    const source = sources[index];
    if (result.status === "fulfilled") {
      for (const item of result.value) {
        if (item && item.title) items.push(item);
      }
      return;
    }
    const reason = result.reason;
    failures.push({
      sourceId: source.id,
      message: reason instanceof Error ? reason.message : String(reason ?? "\u672A\u77E5\u9519\u8BEF")
    });
  });
  items.sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title));
  return { items: items.slice(0, Math.max(0, limit)), failures };
}
function createHackerNewsSource(fetchImpl = fetch) {
  return {
    id: "hackernews",
    async fetch() {
      const endpoint = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30";
      const response = await fetchImpl(endpoint, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(1e4)
      });
      if (!response.ok) throw new Error(`Hacker News API \u8FD4\u56DE HTTP ${response.status}`);
      const data = await response.json();
      return (data.hits ?? []).filter((hit) => Boolean(hit.title)).map((hit, index) => ({
        title: hit.title,
        source: "hackernews",
        rank: index + 1,
        url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID ?? ""}`
      }));
    }
  };
}
function createAggregatorSource(baseUrl, fetchImpl = fetch) {
  return {
    id: "custom-relay",
    async fetch() {
      const response = await fetchImpl(baseUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(1e4)
      });
      if (!response.ok) throw new Error(`\u805A\u5408\u6E90\u8FD4\u56DE HTTP ${response.status}`);
      const payload = await response.json();
      const entries = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
      return entries.filter((entry) => entry.title && entry.url).map((entry, index) => ({
        title: entry.title ?? "",
        source: entry.name ?? "custom-relay",
        rank: index + 1,
        url: entry.url ?? ""
      }));
    }
  };
}
function buildHotspotSources(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sources = [createHackerNewsSource(fetchImpl)];
  const aggregatorUrl = options.aggregatorUrl?.trim();
  if (aggregatorUrl) sources.push(createAggregatorSource(aggregatorUrl, fetchImpl));
  return sources;
}

// src/host/pipeline/steps/gates.ts
var BANNED_WORDS = [
  "\u603B\u800C\u8A00\u4E4B",
  "\u503C\u5F97\u4E00\u63D0",
  "\u4E0D\u5BB9\u5FFD\u89C6",
  "\u6BCB\u5EB8\u7F6E\u7591",
  "\u7EFC\u4E0A\u6240\u8FF0",
  "\u7531\u6B64\u53EF\u89C1",
  "\u663E\u800C\u6613\u89C1",
  "\u4E0D\u8A00\u800C\u55BB",
  "\u7EDD\u7EDD\u5B50",
  "yyds",
  "\u7834\u9632\u4E86",
  "\u597D\u5BB6\u4F19",
  "\u5C31\u4E00\u4E2A\u8DEF\u5F84\u95EE\u9898",
  "\u6574\u633A\u597D",
  "DNA\u52A8\u4E86"
];
var INTERNAL_MARKER_PATTERNS = [
  /\u270F\uFE0F\s*编辑(?:建议|提醒)/g,
  /<!--[\s\S]*?编辑(?:建议|提醒)[\s\S]*?-->/g,
  /[\[【]\s*请填写[^\]】]*[\]】]/g,
  /[\[【]\s*待补充[^\]】]*[\]】]/g,
  /^\s*(?:待确认)\s*[：:].*$/gm,
  /(?:事实边界|核验来源)\s*[：:]/g
];
var SPECIFIC_PATTERNS = [
  /\d+[\.\d]*\s*(?:秒|分钟|小时|天|月|年|%|元|美元|GB|MB|KB|文件|行|次|轮)/g,
  /`[^`]+`/g,
  /\$[\d,]+/g,
  /v?\d+\.\d+(?:\.\d+)?/g
];
var cpLength = (text) => [...text].length;
function countMatches(text, regex) {
  const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  return (text.match(global) ?? []).length;
}
function analyzeSentences(text) {
  const sentences = text.split(/[。！？\n]/).map((part) => part.trim()).filter((part) => cpLength(part) > 5);
  if (!sentences.length) return { count: 0, mean: 0, varianceRatio: 0 };
  const lengths = sentences.map(cpLength);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const std = lengths.length > 1 ? Math.sqrt(lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / (lengths.length - 1)) : 0;
  return { count: lengths.length, mean, varianceRatio: mean > 0 ? std / mean : 0 };
}
function auditNumbering(markdown) {
  const issues = [];
  let inFence = false;
  let expected = 1;
  let listSeen = false;
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^([ \t]*)(\d+)[.)]\s+\S/.exec(line);
    if (!match) {
      if (listSeen) {
        listSeen = false;
        expected = 1;
      }
      continue;
    }
    const value = Number(match[2]);
    if (!listSeen) {
      listSeen = true;
      expected = 1;
    }
    if (value !== expected) {
      issues.push(`\u6709\u5E8F\u5217\u8868\u7F16\u53F7\u65AD\u88C2\uFF1A\u671F\u671B ${expected}\uFF0C\u5B9E\u9645 ${value}\uFF08\u884C\uFF1A${line.trim().slice(0, 40)}\uFF09`);
    }
    expected = value + 1;
  }
  return { passed: issues.length === 0, issues };
}
function auditFigureNumbering(markdown, imageCount) {
  const references = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)];
  const numbered = references.map((match) => /^图\s*(\d+)/.exec(match[1] ?? ""));
  const issues = [];
  const explicit = numbered.filter(Boolean);
  for (let index = 0; index < explicit.length; index += 1) {
    if (Number(explicit[index][1]) !== index + 1) {
      issues.push(`\u914D\u56FE\u7F16\u53F7\u4E0D\u8FDE\u7EED\uFF1A\u7B2C ${index + 1} \u5F20\u88AB\u6807\u4E3A \u56FE${explicit[index][1]}`);
      break;
    }
  }
  if (references.length !== imageCount && imageCount > 0) {
    issues.push(`\u914D\u56FE\u6570\u4E0D\u4E00\u81F4\uFF1A\u6B63\u6587\u5F15\u7528 ${references.length} \u5904\uFF0C\u7BA1\u7EBF\u4EA7\u56FE ${imageCount} \u5F20`);
  }
  return { passed: issues.length === 0, issues };
}
function runQualityGates(input) {
  const text = input.markdown;
  const bannedWords = BANNED_WORDS.flatMap((word) => {
    const count = countMatches(text, new RegExp(word, "g"));
    return count ? [{ pattern: word, count }] : [];
  });
  const internalMarkers = INTERNAL_MARKER_PATTERNS.reduce((acc, regex) => acc + countMatches(text, regex), 0);
  const sentence = analyzeSentences(text);
  const chars = cpLength(text);
  const detailCount = SPECIFIC_PATTERNS.reduce((acc, regex) => acc + countMatches(text, regex), 0);
  const infoDensity = chars > 0 ? detailCount / (chars / 500) : 0;
  const codeBlocks = countMatches(text, /```[\s\S]*?```/g);
  const numbering = auditNumbering(text);
  const figureNumbering = auditFigureNumbering(text, input.imageCount ?? 0);
  const issues = [];
  if (bannedWords.length) issues.push(`\u7981\u7528\u8BCD\u547D\u4E2D ${bannedWords.length} \u7EC4`);
  if (internalMarkers) issues.push(`\u5185\u90E8\u6807\u8BB0\u6B8B\u7559 ${internalMarkers} \u5904`);
  if (sentence.count > 0 && sentence.varianceRatio < 0.3) issues.push("\u53E5\u957F\u65B9\u5DEE\u8FC7\u4F4E\uFF0C\u8282\u594F\u5355\u8C03");
  if (chars > 500 && infoDensity < 1) issues.push("\u4FE1\u606F\u5BC6\u5EA6\u4E0D\u8DB3\uFF08\u6BCF 500 \u5B57\u5177\u4F53\u7EC6\u8282 < 1 \u5904\uFF09");
  if (chars > 0 && chars < 300) issues.push("\u6B63\u6587\u8FC7\u77ED\uFF08< 300 \u5B57\uFF09");
  if (!numbering.passed) issues.push(...numbering.issues);
  if (!figureNumbering.passed) issues.push(...figureNumbering.issues);
  const report = {
    strict: true,
    bannedWords,
    internalMarkers,
    sentenceCount: sentence.count,
    sentenceVariance: Number(sentence.varianceRatio.toFixed(2)),
    infoDensityPer500: Number(infoDensity.toFixed(1)),
    codeBlocks,
    numbering,
    figureNumbering,
    issues
  };
  return { passed: issues.length === 0, report };
}
var qualityGatesRunner = {
  async run(input) {
    return runQualityGates({ markdown: input.markdown });
  }
};

// src/host/scheduler/rrule.ts
import rrulePackage from "rrule";
var { RRule } = rrulePackage;
var RruleValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RruleValidationError";
  }
};
var KNOWN_KEYS = /* @__PURE__ */ new Set([
  "FREQ",
  "INTERVAL",
  "COUNT",
  "UNTIL",
  "WKST",
  "BYHOUR",
  "BYMINUTE",
  "BYSECOND",
  "BYDAY",
  "BYMONTH",
  "BYMONTHDAY",
  "BYYEARDAY",
  "BYWEEKNO",
  "BYSETPOS"
]);
var FREQ_VALUES = /* @__PURE__ */ new Set(["SECONDLY", "MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
function assertIntInRange(label, raw, min, max, allowNegative) {
  if (!/^-?\d+$/.test(raw)) throw new RruleValidationError(`${label} \u5FC5\u987B\u662F\u6574\u6570\uFF1A${raw}`);
  const value = Number(raw);
  if (value === 0 && allowNegative) throw new RruleValidationError(`${label} \u4E0D\u80FD\u4E3A 0`);
  if (value < min || value > max) throw new RruleValidationError(`${label} \u8D85\u51FA\u8303\u56F4 [${min}, ${max}]\uFF1A${value}`);
  return value;
}
function normalizeRrule(raw) {
  const trimmed = raw.trim();
  if (!trimmed) throw new RruleValidationError("RRULE \u4E0D\u80FD\u4E3A\u7A7A");
  const normalized = trimmed.toUpperCase().split(";").map((part) => part.trim().replace(/\s+/g, "")).filter(Boolean).join(";");
  if (!normalized) throw new RruleValidationError("RRULE \u4E0D\u80FD\u4E3A\u7A7A");
  const seen = /* @__PURE__ */ new Set();
  for (const part of normalized.split(";")) {
    const match = /^([A-Z]+)=(.+)$/.exec(part);
    if (!match) throw new RruleValidationError(`RRULE \u6BB5\u65E0\u6CD5\u89E3\u6790\uFF1A${part}`);
    const [, key, value] = match;
    if (!KNOWN_KEYS.has(key)) throw new RruleValidationError(`RRULE \u542B\u672A\u77E5\u5C5E\u6027\uFF1A${key}`);
    if (seen.has(key)) throw new RruleValidationError(`RRULE \u5C5E\u6027\u91CD\u590D\uFF1A${key}`);
    seen.add(key);
    if (key === "FREQ" && !FREQ_VALUES.has(value)) throw new RruleValidationError(`FREQ \u53D6\u503C\u975E\u6CD5\uFF1A${value}`);
    if (key === "BYHOUR") value.split(",").forEach((v) => assertIntInRange("BYHOUR", v, 0, 23, false));
    if (key === "BYMINUTE") value.split(",").forEach((v) => assertIntInRange("BYMINUTE", v, 0, 59, false));
    if (key === "BYSECOND") value.split(",").forEach((v) => assertIntInRange("BYSECOND", v, 0, 59, false));
    if (key === "BYMONTH") value.split(",").forEach((v) => assertIntInRange("BYMONTH", v, 1, 12, false));
    if (key === "BYMONTHDAY") value.split(",").forEach((v) => assertIntInRange("BYMONTHDAY", v, -31, 31, true));
    if (key === "INTERVAL") {
      if (!/^\d+$/.test(value) || Number(value) < 1) throw new RruleValidationError(`INTERVAL \u5FC5\u987B >= 1\uFF1A${value}`);
    }
    if (key === "COUNT") {
      if (!/^\d+$/.test(value) || Number(value) < 1) throw new RruleValidationError(`COUNT \u5FC5\u987B >= 1\uFF1A${value}`);
    }
  }
  if (!seen.has("FREQ")) throw new RruleValidationError("RRULE \u7F3A\u5C11 FREQ");
  try {
    new RRule(RRule.parseString(normalized));
  } catch (error) {
    throw new RruleValidationError(`RRULE \u65E0\u6CD5\u89E3\u6790\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  return normalized;
}
function wallPartsOf(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}
function tzOffsetMs(instant, timeZone) {
  const wall = wallPartsOf(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - instant.getTime();
}
function wallClockToAbsoluteMs(wallMs, timeZone) {
  let offset = tzOffsetMs(new Date(wallMs), timeZone);
  let absolute = wallMs - offset;
  const secondPass = tzOffsetMs(new Date(absolute), timeZone);
  if (secondPass !== offset) {
    offset = secondPass;
    absolute = wallMs - offset;
  }
  return absolute;
}
function computeNextRunAt(rruleText, timeZone, from) {
  const normalized = normalizeRrule(rruleText);
  const options = RRule.parseString(normalized);
  const wall = wallPartsOf(from, timeZone);
  const fromWallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const byhourRaw = options.byhour;
  const byhour = byhourRaw === void 0 ? [0] : Array.isArray(byhourRaw) ? byhourRaw.map(Number) : [Number(byhourRaw)];
  const rule = new RRule({
    ...options,
    dtstart: new Date(Date.UTC(wall.year, wall.month - 1, wall.day)),
    byhour
  });
  const nextWall = rule.after(new Date(fromWallMs), false);
  if (!nextWall) throw new RruleValidationError(`RRULE \u5DF2\u65E0\u672A\u6765\u89E6\u53D1\u70B9\uFF1A${normalized}`);
  return new Date(wallClockToAbsoluteMs(nextWall.getTime(), timeZone)).toISOString();
}

// src/host/scheduler/service.ts
var DEFAULT_MISFIRE_GRACE_MS = 10 * 60 * 1e3;
var DEFAULT_SCHEDULER_TICK_MS = 30 * 1e3;
function scanOccurrences(occurrences, now, graceMs) {
  const nowMs = now.getTime();
  const toFire = [];
  const missed = [];
  for (const occurrence of occurrences) {
    const at = Date.parse(occurrence);
    if (Number.isNaN(at) || at > nowMs) continue;
    if (nowMs - at <= graceMs) toFire.push(occurrence);
    else missed.push(occurrence);
  }
  return { toFire, missed };
}
function createSchedulerService(deps, options = {}) {
  const graceMs = options.graceMs ?? DEFAULT_MISFIRE_GRACE_MS;
  const tickMs = options.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
  const now = deps.now ?? (() => /* @__PURE__ */ new Date());
  let timer = null;
  let pumping = false;
  async function pumpOnce() {
    const current = now();
    let fired = 0;
    let missed = 0;
    const schedules = await deps.loadSchedules();
    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      const next = computeNextRunAt(schedule.rrule, schedule.timeZone, current);
      const scan = scanOccurrences([next], current, graceMs);
      missed += scan.missed.length;
      if (scan.toFire.length === 0) {
        if (next !== schedule.nextRunAt) {
          await deps.saveSchedule({ ...schedule, nextRunAt: next, updatedAt: current.toISOString() });
        }
        continue;
      }
      const occurrenceKey = `${schedule.id}:${next}`;
      const claimed = await deps.claim(occurrenceKey);
      const after = computeNextRunAt(schedule.rrule, schedule.timeZone, new Date(current.getTime() + 1));
      if (claimed) {
        await deps.startRun(schedule, occurrenceKey);
        fired += 1;
        await deps.saveSchedule({
          ...schedule,
          nextRunAt: after,
          lastRunAt: current.toISOString(),
          updatedAt: current.toISOString()
        });
      } else {
        await deps.saveSchedule({ ...schedule, nextRunAt: after, updatedAt: current.toISOString() });
      }
    }
    return { fired, missed };
  }
  async function pumpGuarded() {
    if (pumping) return null;
    pumping = true;
    try {
      return await pumpOnce();
    } finally {
      pumping = false;
    }
  }
  return {
    pumpOnce: pumpGuarded,
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void pumpGuarded().catch(() => void 0);
      }, tickMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

// src/host/store.ts
function initialGlobalState() {
  return GlobalStateSchema.parse({ v: 1, settings: {}, claimedOccurrences: [] });
}
function parseGlobalState(raw, logger) {
  if (raw === void 0 || raw === null) return initialGlobalState();
  const parsed = GlobalStateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  logger.warn(`\u5168\u5C40\u72B6\u6001\u89E3\u6790\u5931\u8D25\uFF0C\u56DE\u843D\u9ED8\u8BA4\uFF08\u8BB0\u5F55\u7EA7 v \u5B57\u6BB5\u6F14\u8FDB\u95F8\u95E8\u751F\u6548\uFF09\uFF1A${parsed.error.issues[0]?.message ?? ""}`);
  return initialGlobalState();
}
function createDomainRunStore(table, logger) {
  const mirror = /* @__PURE__ */ new Map();
  for (const [key, value] of table.entries()) mirror.set(key, value);
  let tail = Promise.resolve();
  const flush = (key, value) => {
    tail = tail.then(() => table.put(key, value)).catch((error) => logger.warn(`run \u8BB0\u5F55\u843D\u76D8\u5931\u8D25\uFF08${key}\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`));
  };
  return {
    put(run) {
      mirror.set(run.id, run);
      flush(run.id, run);
    },
    get(runId) {
      return mirror.get(runId);
    },
    update(runId, patch) {
      const current = mirror.get(runId);
      if (!current) return;
      const next = patch(current);
      mirror.set(runId, next);
      flush(runId, next);
    },
    all() {
      return [...mirror.values()];
    }
  };
}
function openTables(domain) {
  return {
    articles: typedTable(domain, "articles"),
    runs: typedTable(domain, "runs"),
    schedules: typedTable(domain, "schedules"),
    images: typedTable(domain, "images"),
    domain
  };
}

// src/host/images.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/host/providers/types.ts
var RETRYABLE_BY_CODE = {
  AUTH: false,
  RATE_LIMIT: true,
  TIMEOUT: true,
  NETWORK: true,
  PROVIDER: true
};
var ImageProviderError = class extends Error {
  providerId;
  code;
  retryable;
  constructor(input) {
    super(`${input.providerId} ${input.code}: ${input.message}`);
    this.name = "ImageProviderError";
    this.providerId = input.providerId;
    this.code = input.code;
    this.retryable = input.retryable ?? RETRYABLE_BY_CODE[input.code];
  }
};

// src/host/providers/registry.ts
var ImageFallbackExhaustedError = class extends Error {
  constructor(attempts) {
    super(`\u5168\u90E8\u56FE\u7247\u4F9B\u5E94\u5546\u5931\u8D25\uFF08${attempts.length} \u5BB6\u5C1D\u8BD5\u94FE\uFF09`);
    this.attempts = attempts;
    this.name = "ImageFallbackExhaustedError";
  }
  attempts;
};
var MAX_TRIES_PER_PROVIDER = 2;
async function runImageFallback(providers, resolveConfig, req) {
  if (req.signal?.aborted) {
    throw new ImageProviderError({ providerId: "openai", code: "NETWORK", message: "\u8BF7\u6C42\u5DF2\u4E2D\u6B62\uFF0C\u672A\u53D1\u8D77\u4EFB\u4F55\u4F9B\u5E94\u5546\u8C03\u7528" });
  }
  const attempts = [];
  for (const provider of providers) {
    const codes = [];
    let tries = 0;
    for (; ; ) {
      tries += 1;
      try {
        const result = await provider.generate(req, resolveConfig(provider.id));
        attempts.push({ providerId: provider.id, tries, outcome: "success", codes });
        return { result, providerId: provider.id, attempts };
      } catch (thrown) {
        const error = thrown instanceof ImageProviderError ? thrown : new ImageProviderError({
          providerId: provider.id,
          code: "PROVIDER",
          message: thrown instanceof Error ? thrown.message : String(thrown ?? "\u672A\u77E5\u9519\u8BEF")
        });
        codes.push(error.code);
        if (error.retryable && tries < MAX_TRIES_PER_PROVIDER) continue;
        attempts.push({ providerId: provider.id, tries, outcome: "error", codes });
        break;
      }
    }
  }
  throw new ImageFallbackExhaustedError(attempts);
}

// src/host/redaction.ts
function truncateMessage(message, max = 500) {
  return message.length <= max ? message : message.slice(0, max);
}

// src/host/providers/transport.ts
function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
function sniffMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "image/jpeg";
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return "image/png";
}
function classifyStatus(status) {
  if (status === 401 || status === 403) return { code: "AUTH", retryable: false };
  if (status === 429) return { code: "RATE_LIMIT", retryable: true };
  return { code: "PROVIDER", retryable: true };
}
async function readImageBytes(providerId, url, req, fetchImpl) {
  const response = await fetchImpl(url, { method: "GET", signal: req.signal });
  if (!response.ok) {
    const { code, retryable } = classifyStatus(response.status);
    throw new ImageProviderError({
      providerId,
      code,
      retryable,
      message: `\u56FE\u7247\u4E0B\u8F7D\u8FD4\u56DE HTTP ${response.status}`
    });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mime: response.headers.get("content-type")?.split(";")[0] || sniffMime(buffer) };
}
async function postJsonImages(input) {
  const { providerId, req } = input;
  const fetchImpl = input.fetchImpl ?? fetch;
  let response;
  try {
    response = await fetchImpl(input.url, {
      method: "POST",
      headers: { ...input.headers },
      body: JSON.stringify(input.body),
      signal: req.signal
    });
  } catch (error) {
    if (req.signal?.aborted) {
      throw new ImageProviderError({ providerId, code: "TIMEOUT", message: "\u8BF7\u6C42\u5DF2\u4E2D\u6B62" });
    }
    throw new ImageProviderError({
      providerId,
      code: "NETWORK",
      message: truncateMessage(error instanceof Error ? error.message : String(error ?? "\u7F51\u7EDC\u5F02\u5E38"))
    });
  }
  if (!response.ok) {
    const { code, retryable } = classifyStatus(response.status);
    let detail = "";
    try {
      const payload2 = await response.json();
      detail = payload2?.error?.message ?? "";
    } catch {
      detail = "";
    }
    throw new ImageProviderError({
      providerId,
      code,
      retryable,
      message: truncateMessage(`HTTP ${response.status}${detail ? ` ${detail}` : ""}`)
    });
  }
  const payload = await response.json();
  const items = payload?.data;
  if (!Array.isArray(items) || items.length === 0) {
    throw new ImageProviderError({ providerId, code: "PROVIDER", message: "\u54CD\u5E94\u7F3A\u5C11 data \u6570\u7EC4\u6216\u4E3A\u7A7A" });
  }
  const images = [];
  for (const item of items.slice(0, Math.max(1, req.n))) {
    if (item.b64_json) {
      const buffer = Buffer.from(item.b64_json, "base64");
      images.push({ buffer, mime: sniffMime(buffer) });
    } else if (item.url) {
      const downloaded = await readImageBytes(providerId, item.url, req, fetchImpl).catch((error) => {
        if (error instanceof ImageProviderError) throw error;
        throw new ImageProviderError({ providerId, code: "NETWORK", message: String(error) });
      });
      images.push({ buffer: downloaded.buffer, mime: downloaded.mime });
    }
  }
  if (!images.length) {
    throw new ImageProviderError({ providerId, code: "PROVIDER", message: "\u54CD\u5E94\u56FE\u7247\u6761\u76EE\u65E2\u65E0 b64_json \u4E5F\u65E0 url" });
  }
  return { images, model: input.resultModel };
}
function declareProvider(declaration, fetchImpl) {
  return {
    id: declaration.id,
    async generate(req, cfg) {
      const model = cfg.model ?? declaration.defaultModel;
      const { path, query } = declaration.endpoint(req, cfg);
      const url = `${joinUrl(cfg.baseUrl ?? declaration.defaultBaseUrl, path)}${query ?? ""}`;
      return postJsonImages({
        providerId: declaration.id,
        url,
        headers: declaration.headers(cfg),
        body: declaration.body(req, model),
        req,
        resultModel: model,
        ...fetchImpl ? { fetchImpl } : {}
      });
    }
  };
}

// src/host/providers/azure-openai.ts
var API_VERSION = "2024-10-21";
function createAzureOpenAiProvider(fetchImpl) {
  return declareProvider({
    id: "azure_openai",
    defaultBaseUrl: "https://your-resource.openai.azure.com",
    defaultModel: "gpt-image-2",
    endpoint: (req, cfg) => {
      const deployment = cfg.extra?.deployment ?? cfg.model ?? "gpt-image-2";
      return { path: `/openai/deployments/${deployment}/images/generations`, query: `?api-version=${API_VERSION}` };
    },
    headers: (cfg) => ({
      "Content-Type": "application/json",
      "api-key": cfg.apiKey,
      Authorization: `Bearer ${cfg.apiKey}`
    }),
    body: (req) => ({
      prompt: req.prompt,
      size: req.size,
      n: req.n
    })
  }, fetchImpl);
}

// src/host/providers/doubao.ts
function createDoubaoProvider(fetchImpl) {
  return declareProvider({
    id: "doubao",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seedream-4-0-250828",
    endpoint: () => ({ path: "/images/generations" }),
    headers: (cfg) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`
    }),
    body: (req, model) => ({
      model,
      prompt: req.prompt,
      size: req.size,
      response_format: "b64_json",
      watermark: false
    })
  }, fetchImpl);
}

// src/host/providers/dashscope.ts
function createDashscopeProvider(fetchImpl) {
  return declareProvider({
    id: "dashscope",
    defaultBaseUrl: "https://dashscope.aliyuncs.com",
    defaultModel: "wanx2.1-t2i-turbo",
    endpoint: () => ({ path: "/services/aigc/text2image/image-synthesis", query: "?action=generate" }),
    headers: (cfg) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      "X-DashScope-Synchronous": "true"
    }),
    body: (req, model) => ({
      model,
      input: { prompt: req.prompt },
      parameters: { size: `${req.size.split("x")[0]}*${req.size.split("x")[1]}`, n: req.n }
    })
  }, fetchImpl);
}

// src/host/providers/gemini.ts
function createGeminiProvider(fetchImpl) {
  return declareProvider({
    id: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.5-flash-image",
    endpoint: (req, cfg) => {
      const model = cfg.model ?? "gemini-2.5-flash-image";
      return { path: `/v1beta/models/${model}:predict` };
    },
    headers: (cfg) => ({
      "Content-Type": "application/json",
      "x-goog-api-key": cfg.apiKey,
      Authorization: `Bearer ${cfg.apiKey}`
    }),
    body: (req) => ({
      instances: [{ prompt: req.prompt }],
      parameters: { sampleCount: req.n, imageConfig: { imageSize: req.size } }
    })
  }, fetchImpl);
}

// src/host/providers/jimeng.ts
function createJimengProvider(fetchImpl) {
  return declareProvider({
    id: "jimeng",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "jimeng-2.1-latest",
    endpoint: () => ({ path: "/images/generations" }),
    headers: (cfg) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      ...cfg.extra?.accessKeyId ? { "X-Ark-Access-Key-Id": cfg.extra.accessKeyId } : {}
    }),
    body: (req, model) => ({
      model,
      prompt: req.prompt,
      size: req.size,
      req_key: "jimeng_high_aes_general_v21",
      watermark: false
    })
  }, fetchImpl);
}

// src/host/providers/minimax.ts
function createMinimaxProvider(fetchImpl) {
  return declareProvider({
    id: "minimax",
    defaultBaseUrl: "https://api.minimax.chat",
    defaultModel: "image-01",
    endpoint: () => ({ path: "/v1/image/generation" }),
    headers: (cfg) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`
    }),
    body: (req, model) => ({
      model,
      prompt: req.prompt,
      aspect_ratio: req.size,
      response_format: "b64_json"
    })
  }, fetchImpl);
}

// src/host/providers/openai.ts
var OPENAI_DEFAULT_MODEL = "gpt-image-2";
function createOpenAiProvider(fetchImpl) {
  return declareProvider({
    id: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: OPENAI_DEFAULT_MODEL,
    endpoint: () => ({ path: "/images/generations" }),
    headers: (cfg) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`
    }),
    body: (req) => ({
      model: OPENAI_DEFAULT_MODEL,
      prompt: req.prompt,
      size: req.size,
      n: req.n
    })
  }, fetchImpl);
}

// src/host/providers/openrouter.ts
function createOpenrouterProvider(fetchImpl) {
  return declareProvider({
    id: "openrouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-image-2",
    endpoint: () => ({ path: "/images/generations" }),
    headers: (cfg) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`
    }),
    body: (req, model) => ({
      model,
      prompt: req.prompt,
      size: req.size,
      n: req.n
    })
  }, fetchImpl);
}

// src/host/providers/replicate.ts
function createReplicateProvider(fetchImpl) {
  return declareProvider({
    id: "replicate",
    defaultBaseUrl: "https://api.replicate.com",
    defaultModel: "black-forest-labs/flux-schnell",
    endpoint: (req, cfg) => {
      const modelPath = (cfg.model ?? "black-forest-labs/flux-schnell").replace(/^\/+/, "");
      return { path: `/v1/models/${modelPath}/predictions` };
    },
    headers: (cfg) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      Prefer: "wait"
    }),
    body: (req) => ({
      input: { prompt: req.prompt, image_size: req.size }
    })
  }, fetchImpl);
}

// src/host/images.ts
var PROVIDER_FACTORIES = {
  openai: createOpenAiProvider,
  doubao: createDoubaoProvider,
  dashscope: createDashscopeProvider,
  jimeng: createJimengProvider,
  minimax: createMinimaxProvider,
  azure_openai: createAzureOpenAiProvider,
  gemini: createGeminiProvider,
  openrouter: createOpenrouterProvider,
  replicate: createReplicateProvider
};
function createImagesGenerator(deps) {
  return {
    generate: async ({ count, articleId }) => {
      const settings = deps.getSettings();
      const chain = settings.imageProviders.length ? settings.imageProviders : DEFAULT_IMAGE_PROVIDER_CHAIN.map((providerId) => ({
        providerId,
        credentialRef: CREDENTIAL_REFS.image(providerId)
      }));
      const keys = await Promise.all(
        chain.map(async (entry) => String(await deps.resolveCredential(entry.credentialRef) ?? ""))
      );
      const configs = new Map(
        chain.map((entry, index) => [
          entry.providerId,
          {
            apiKey: keys[index],
            ...entry.baseUrl ? { baseUrl: entry.baseUrl } : {},
            ...entry.model ? { model: entry.model } : {}
          }
        ])
      );
      const providers = chain.filter((entry) => IMAGE_PROVIDER_IDS.includes(entry.providerId)).map((entry) => PROVIDER_FACTORIES[entry.providerId](deps.fetchImpl));
      const resolveConfig = (providerId) => configs.get(providerId) ?? { apiKey: "" };
      const make = async (prompt) => {
        const req = { prompt, size: settings.defaultImageSize, n: 1 };
        const outcome = await runImageFallback(providers, resolveConfig, req);
        const image = outcome.result.images[0];
        return {
          v: 1,
          id: `img_${randomUUID2().replaceAll("-", "").slice(0, 12)}`,
          // P0-1：真实文章 id 溯源（render 步落库后回传；无绑定场景兜底占位）
          articleId: articleId ?? "pending",
          kind: "body",
          mime: image?.mime ?? "image/png",
          base64: (image?.buffer ?? Buffer.alloc(0)).toString("base64"),
          provider: outcome.providerId,
          model: outcome.result.model,
          prompt,
          createdAt: deps.now().toISOString()
        };
      };
      const cover = await make("\u4E3A\u6587\u7AE0\u751F\u6210\u5C01\u9762\u56FE\uFF1A\u98CE\u683C\u514B\u5236\u3001\u4FE1\u606F\u5BC6\u5EA6\u9AD8\uFF0C\u6DF1\u8272\u7EAF\u8272\u80CC\u666F\uFF0C\u65E0\u6587\u5B57\u6C34\u5370");
      const bodies = [];
      for (let index = 0; index < count; index += 1) {
        bodies.push(await make(`\u6B63\u6587\u914D\u56FE ${index + 1}\uFF1A\u514B\u5236\u7684\u4FE1\u606F\u56FE\u98CE\u683C\uFF0C\u5355\u4E3B\u9898\uFF0C\u65E0\u6587\u5B57\u6C34\u5370`));
      }
      const stored = [{ ...cover, kind: "cover" }, ...bodies];
      await deps.persist(stored);
      return { coverImageId: stored[0].id, bodyImageIds: bodies.map((record) => record.id) };
    }
  };
}

// src/host/articles-store.ts
import { randomUUID as randomUUID3 } from "node:crypto";

// src/host/views.ts
function articleToListItem(record) {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    digest: record.digest,
    status: record.status,
    updatedAt: record.updatedAt
  };
}
function articleToDetail(record) {
  return {
    ...articleToListItem(record),
    v: record.v,
    markdown: record.markdown,
    theme: record.theme,
    bodyImageIds: record.bodyImageIds,
    ...record.coverImageId ? { coverImageId: record.coverImageId } : {},
    ...record.createdAt ? { createdAt: record.createdAt } : {},
    ...record.wechatMediaId ? { wechatMediaId: record.wechatMediaId } : {},
    ...record.thumbMediaId ? { thumbMediaId: record.thumbMediaId } : {},
    ...record.lastRunId ? { lastRunId: record.lastRunId } : {}
  };
}
function runToSummary(record) {
  return {
    id: record.id,
    trigger: record.trigger,
    ...record.scheduleId ? { scheduleId: record.scheduleId } : {},
    ...record.articleId ? { articleId: record.articleId } : {},
    status: record.status,
    startedAt: record.startedAt,
    ...record.finishedAt ? { finishedAt: record.finishedAt } : {},
    ...record.error ? { error: { code: record.error.code, message: record.error.message } } : {}
  };
}
function scheduleToView(record) {
  return {
    id: record.id,
    revision: record.revision,
    name: record.name,
    rrule: record.rrule,
    timeZone: record.timeZone,
    params: record.params,
    enabled: record.enabled,
    publishTarget: record.publishTarget,
    nextRunAt: record.nextRunAt,
    ...record.lastRunAt ? { lastRunAt: record.lastRunAt } : {}
  };
}
function buildConfigView(settings, credentials) {
  const descriptors = {};
  for (const [ref, descriptor] of Object.entries(credentials)) {
    descriptors[ref] = { configured: descriptor.configured, writable: descriptor.writable };
  }
  return {
    settings: {
      wechatAppId: settings.wechatAppId,
      wechatApiBaseUrl: settings.wechatApiBaseUrl,
      wechatAuthor: settings.wechatAuthor,
      defaultTheme: settings.defaultTheme,
      defaultImageSize: settings.defaultImageSize,
      llmDefault: settings.llmDefault ?? {},
      agentToolsEnabled: settings.agentToolsEnabled,
      runHistoryLimit: settings.runHistoryLimit,
      hotspotAggregatorUrl: settings.hotspotAggregatorUrl
    },
    credentials: descriptors,
    imageProviders: settings.imageProviders.map((entry) => ({
      providerId: entry.providerId,
      ...entry.model ? { model: entry.model } : {},
      ...entry.baseUrl ? { baseUrl: entry.baseUrl } : {},
      credentialRef: entry.credentialRef
    }))
  };
}

// src/host/service-errors.ts
var WewriteServiceError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "WewriteServiceError";
  }
  code;
};
function toServiceError(error) {
  if (error instanceof WewriteServiceError) return error;
  const message = error instanceof Error ? error.message : String(error ?? "\u672A\u77E5\u9519\u8BEF");
  return new WewriteServiceError("internal", message);
}

// src/host/articles-store.ts
var ArticleStore = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  list() {
    return [...this.deps.tables.articles.entries()].map(([, record]) => record).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).map(articleToListItem);
  }
  get(id) {
    const record = this.deps.tables.articles.get(id);
    if (!record) throw new WewriteServiceError("article-not-found", `\u6587\u7AE0\u4E0D\u5B58\u5728\uFF1A${id}`);
    return articleToDetail(record);
  }
  async save(input) {
    return this.deps.serialize(async () => {
      const now = this.deps.nowIso();
      const existing = input.id ? this.deps.tables.articles.get(input.id) : void 0;
      const record = ArticleRecordSchema.parse({
        v: 1,
        id: existing?.id ?? `art_${randomUUID3().replaceAll("-", "").slice(0, 12)}`,
        slug: input.slug,
        title: input.title,
        digest: input.digest,
        status: existing?.status ?? "editing",
        markdown: input.markdown,
        theme: input.theme,
        bodyImageIds: existing?.bodyImageIds ?? [],
        ...existing?.coverImageId ? { coverImageId: existing.coverImageId } : {},
        ...existing?.wechatMediaId ? { wechatMediaId: existing.wechatMediaId } : {},
        ...existing?.thumbMediaId ? { thumbMediaId: existing.thumbMediaId } : {},
        ...existing?.lastRunId ? { lastRunId: existing.lastRunId } : {},
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      await this.deps.tables.articles.put(record.id, record);
      return articleToDetail(record);
    });
  }
  async delete(id) {
    return this.deps.serialize(async () => ({ deleted: await this.deps.tables.articles.delete(id) }));
  }
  preview(input) {
    if ("id" in input) {
      const article = this.get(input.id);
      return { html: convertArticle({ markdown: article.markdown, theme: article.theme }) };
    }
    return { html: convertArticle({ markdown: input.markdown, theme: input.theme }) };
  }
  /** 管线渲染完成后落库：绑定 articleId 则更新，否则按成稿新建（slug/标题/摘要推导）。返回文章 id。 */
  async persistProduced(markdown, runId) {
    return this.deps.serialize(async () => {
      const now = this.deps.nowIso();
      const run = this.deps.runStore.get(runId);
      const existing = run?.articleId ? this.deps.tables.articles.get(run.articleId) : void 0;
      const record = ArticleRecordSchema.parse({
        v: 1,
        id: existing?.id ?? `art_${randomUUID3().replaceAll("-", "").slice(0, 12)}`,
        slug: existing?.slug ?? `run-${runId.slice(4, 16)}`,
        title: existing?.title ?? deriveTitle(markdown),
        digest: existing?.digest ?? deriveDigest(markdown),
        status: "rendered",
        markdown,
        theme: run?.paramsSnapshot.theme ?? this.deps.getSettings().defaultTheme,
        bodyImageIds: existing?.bodyImageIds ?? [],
        ...existing?.coverImageId ? { coverImageId: existing.coverImageId } : {},
        ...existing?.wechatMediaId ? { wechatMediaId: existing.wechatMediaId } : {},
        ...existing?.thumbMediaId ? { thumbMediaId: existing.thumbMediaId } : {},
        lastRunId: runId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      await this.deps.tables.articles.put(record.id, record);
      return record.id;
    });
  }
  /** images 步产物回绑（P0-1）：封面/正文图 id 写回文章记录——推送核心流的绑定链。 */
  async bindImages(articleId, bound) {
    await this.deps.serialize(async () => {
      const record = this.deps.tables.articles.get(articleId);
      if (!record) return;
      const merged = ArticleRecordSchema.parse({
        ...record,
        coverImageId: bound.coverImageId ?? record.coverImageId,
        bodyImageIds: bound.bodyImageIds.length ? [...bound.bodyImageIds] : record.bodyImageIds,
        updatedAt: this.deps.nowIso()
      });
      await this.deps.tables.articles.put(articleId, merged);
    });
  }
};
function deriveTitle(markdown) {
  const heading = /^#{0,2}\s*(.+)$/m.exec(markdown.trim());
  return (heading?.[1] ?? "\u672A\u547D\u540D\u7A3F\u4EF6").slice(0, 40);
}
function deriveDigest(markdown) {
  return markdown.replace(/[#>*`\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 110);
}

// src/host/schedules-store.ts
import { randomUUID as randomUUID4 } from "node:crypto";
var ScheduleStore = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  async save(input) {
    return this.deps.serialize(async () => {
      const now = this.deps.nowIso();
      const normalized = normalizeRrule(input.rrule);
      const existing = input.id ? this.deps.tables.schedules.get(input.id) : void 0;
      const record = {
        v: 1,
        id: existing?.id ?? `sch_${randomUUID4().replaceAll("-", "").slice(0, 12)}`,
        revision: (existing?.revision ?? 0) + 1,
        name: input.name,
        rrule: normalized,
        timeZone: input.timeZone,
        params: input.params,
        publishTarget: "draft",
        enabled: input.enabled,
        nextRunAt: computeNextRunAt(normalized, input.timeZone, new Date(now)),
        ...existing?.lastRunAt ? { lastRunAt: existing.lastRunAt } : {},
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      await this.deps.tables.schedules.put(record.id, record);
      return scheduleToView(record);
    });
  }
  async delete(id) {
    return this.deps.serialize(async () => ({ deleted: await this.deps.tables.schedules.delete(id) }));
  }
  async toggle(id, enabled) {
    return this.deps.serialize(async () => {
      const record = this.deps.tables.schedules.get(id);
      if (!record) throw new WewriteServiceError("schedule-not-found", `\u5B9A\u65F6\u4EFB\u52A1\u4E0D\u5B58\u5728\uFF1A${id}`);
      const next = { ...record, enabled, updatedAt: this.deps.nowIso() };
      await this.deps.tables.schedules.put(id, next);
      return scheduleToView(next);
    });
  }
  runNow(id) {
    const record = this.deps.tables.schedules.get(id);
    if (!record) throw new WewriteServiceError("schedule-not-found", `\u5B9A\u65F6\u4EFB\u52A1\u4E0D\u5B58\u5728\uFF1A${id}`);
    return this.deps.startRun(record);
  }
};

// src/host/wechat/diagnostics.ts
var AUTH_ERRCODES = /* @__PURE__ */ new Set([40001, 40002, 40013, 40125, 41001, 41002, 41004, 42001]);
var RATE_LIMIT_ERRCODES = /* @__PURE__ */ new Set([45009, 45011, 48001]);
function classifyErrcode(errcode) {
  if (errcode === 40164) return "IP_WHITELIST";
  if (AUTH_ERRCODES.has(errcode)) return "AUTH";
  if (RATE_LIMIT_ERRCODES.has(errcode)) return "RATE_LIMIT";
  if (errcode === -1 || errcode >= 500) return "SYSTEM";
  return "UNKNOWN";
}
function extractExitIp(errmsg) {
  const match = /invalid ip ([0-9a-fA-F.]+)/.exec(errmsg);
  return match?.[1];
}
function ipWhitelistHint(exitIp) {
  const ip = exitIp ?? "\uFF08\u89C1 errmsg \u56DE\u663E\uFF09";
  return [
    `\u51FA\u53E3 IP ${ip} \u4E0D\u5728\u516C\u4F17\u53F7\u767D\u540D\u5355\u3002`,
    "\u4E24\u6761\u51FA\u8DEF\u4EFB\u9009\u5176\u4E00\uFF1A",
    "\u4E00\u3001\u767B\u5F55\u516C\u4F17\u53F7\u540E\u53F0\uFF0C\u5728\u300C\u8BBE\u7F6E\u4E0E\u5F00\u53D1-\u57FA\u672C\u914D\u7F6E-IP \u767D\u540D\u5355\u300D\u4E2D\u52A0\u5165\u8BE5\u51FA\u53E3 IP\uFF1B",
    "\u4E8C\u3001\u914D\u7F6E\u4EE3\u7406\uFF1A\u628A\u8BBE\u7F6E\u91CC\u7684 wechatApiBaseUrl \u6307\u5411\u81EA\u5EFA relay\uFF08\u56FA\u5B9A\u51FA\u53E3 IP \u7684\u53CD\u4EE3\uFF09\uFF0C\u5E76\u628A relay \u670D\u52A1\u5668 IP \u52A0\u5165\u767D\u540D\u5355\u3002"
  ].join("");
}
var AUTH_HINT = "\u5FAE\u4FE1\u62D2\u7EDD\u4E86\u51ED\u636E\uFF1A\u8BF7\u6838\u5BF9\u8BBE\u7F6E\u9875\u7684 AppID \u4E0E Secret\uFF08Secret \u53EA\u5199\u672C\u5730 credentials\uFF0C\u4FDD\u5B58\u540E\u56DE\u663E\u63A9\u7801\uFF09\u3002";
var RATE_LIMIT_HINT = "\u89E6\u53D1\u5FAE\u4FE1\u63A5\u53E3\u8C03\u7528\u9891\u7387\u9650\u5236\uFF1A\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF0C\u6216\u964D\u4F4E\u81EA\u52A8\u63A8\u9001\u9891\u7387\u3002";
var SYSTEM_HINT = "\u5FAE\u4FE1\u670D\u52A1\u7AEF\u7E41\u5FD9\uFF08errcode \u5C5E\u7CFB\u7EDF\u7C7B\uFF09\uFF1A\u7A0D\u540E\u91CD\u8BD5\uFF1B\u6301\u7EED\u51FA\u73B0\u8BF7\u5230\u5FAE\u4FE1\u5F00\u653E\u793E\u533A\u6838\u5B9E\u670D\u52A1\u72B6\u6001\u3002";
var NETWORK_HINT = "\u65E0\u6CD5\u8FDE\u63A5\u5FAE\u4FE1\u670D\u52A1\u5668\uFF1A\u8BF7\u68C0\u67E5\u672C\u673A\u7F51\u7EDC\uFF0C\u4EE5\u53CA\u8BBE\u7F6E\u91CC\u7684 wechatApiBaseUrl\uFF08\u81EA\u5B9A\u4E49\u4EE3\u7406\u5730\u5740\uFF09\u662F\u5426\u53EF\u8FBE\u3002";
var UNKNOWN_HINT = "\u5FAE\u4FE1\u8FD4\u56DE\u672A\u5206\u7C7B\u9519\u8BEF\u7801\uFF1A\u8BF7\u628A errcode \u4E0E errmsg \u63D0\u4EA4\u7ED9\u63D2\u4EF6 issue \u6392\u67E5\u3002";
function hintForClassification(classification, exitIp) {
  switch (classification) {
    case "IP_WHITELIST":
      return ipWhitelistHint(exitIp);
    case "AUTH":
      return AUTH_HINT;
    case "RATE_LIMIT":
      return RATE_LIMIT_HINT;
    case "SYSTEM":
      return SYSTEM_HINT;
    case "NETWORK":
      return NETWORK_HINT;
    default:
      return UNKNOWN_HINT;
  }
}

// src/host/wechat/egress.ts
var DIRECT_WECHAT_API_BASE = "https://api.weixin.qq.com";
function resolveApiBaseUrl(raw) {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return DIRECT_WECHAT_API_BASE;
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`\u5FAE\u4FE1 API base URL \u5FC5\u987B\u662F http(s) \u5730\u5740\uFF1A${trimmed}`);
  }
  return trimmed;
}

// src/host/wechat/client.ts
var WeChatApiError = class extends Error {
  errcode;
  classification;
  hint;
  constructor(errcode, classification, hint, message) {
    super(message ?? `\u5FAE\u4FE1 API \u9519\u8BEF ${errcode}`);
    this.name = "WeChatApiError";
    this.errcode = errcode;
    this.classification = classification;
    this.hint = hint;
  }
};
var IMAGE_SRC_RE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)(\2)/gis;
function createWeChatClient(deps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  let cachedToken = null;
  function toApiError(errcode, errmsg) {
    const classification = classifyErrcode(errcode);
    const exitIp = classification === "IP_WHITELIST" ? extractExitIp(errmsg ?? "") : void 0;
    return new WeChatApiError(
      errcode,
      classification,
      hintForClassification(classification, exitIp),
      truncateMessage(`\u5FAE\u4FE1 API \u9519\u8BEF ${errcode}\uFF1A${errmsg ?? "\u672A\u77E5\u9519\u8BEF"}`)
    );
  }
  async function callJson(path, query, init) {
    const base = resolveApiBaseUrl(deps.getSettings().apiBaseUrl);
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let response;
    try {
      response = await fetchImpl(url.toString(), init);
    } catch (error) {
      throw new WeChatApiError(
        -2,
        "NETWORK",
        NETWORK_HINT,
        `\u5FAE\u4FE1 API \u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error ?? "\u672A\u77E5\u9519\u8BEF")}`
      );
    }
    const data = await response.json();
    const errcode = typeof data.errcode === "number" ? data.errcode : 0;
    if (errcode !== 0) throw toApiError(errcode, typeof data.errmsg === "string" ? data.errmsg : void 0);
    return data;
  }
  async function fetchAccessToken() {
    if (cachedToken && now() < cachedToken.expiresAt) return cachedToken.token;
    const { appId, secret } = deps.getCredentials();
    const data = await callJson("/cgi-bin/token", {
      grant_type: "client_credential",
      appid: appId,
      secret
    });
    const token = data.access_token;
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 0;
    if (typeof token !== "string" || !token) {
      throw new WeChatApiError(-1, "SYSTEM", "token \u54CD\u5E94\u672A\u5305\u542B access_token", "\u5FAE\u4FE1 token \u54CD\u5E94\u672A\u5305\u542B access_token");
    }
    cachedToken = { token, expiresAt: now() + expiresIn * 1e3 };
    return token;
  }
  function multipart(image, field = "media") {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(image.buffer)], { type: image.mime });
    form.append(field, blob, image.filename ?? `wewrite-${field}.${image.mime.split("/")[1] ?? "png"}`);
    return form;
  }
  async function uploadContentImage(image) {
    const token = await fetchAccessToken();
    const data = await callJson("/cgi-bin/media/uploadimg", { access_token: token }, {
      method: "POST",
      body: multipart(image)
    });
    if (typeof data.url !== "string" || !data.url) {
      throw new WeChatApiError(-1, "SYSTEM", "uploadimg \u54CD\u5E94\u672A\u5305\u542B CDN URL", "\u5FAE\u4FE1 uploadimg \u54CD\u5E94\u672A\u5305\u542B CDN URL");
    }
    return data.url;
  }
  async function uploadThumbMaterial(image) {
    const token = await fetchAccessToken();
    const data = await callJson("/cgi-bin/material/add_material", { access_token: token, type: "image" }, {
      method: "POST",
      body: multipart(image)
    });
    if (typeof data.media_id !== "string" || !data.media_id) {
      throw new WeChatApiError(-1, "SYSTEM", "add_material \u54CD\u5E94\u672A\u5305\u542B media_id", "\u5FAE\u4FE1 add_material \u54CD\u5E94\u672A\u5305\u542B media_id");
    }
    return data.media_id;
  }
  async function addDraft(input) {
    const token = await fetchAccessToken();
    const data = await callJson("/cgi-bin/draft/add", { access_token: token }, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        articles: [
          {
            title: input.title,
            author: input.author,
            digest: input.digest,
            content: input.contentHtml,
            thumb_media_id: input.thumbMediaId,
            show_cover_pic: 0
          }
        ]
      })
    });
    if (typeof data.media_id !== "string" || !data.media_id) {
      throw new WeChatApiError(-1, "SYSTEM", "draft/add \u54CD\u5E94\u672A\u5305\u542B media_id", "\u5FAE\u4FE1 draft/add \u54CD\u5E94\u672A\u5305\u542B media_id");
    }
    return data.media_id;
  }
  function replaceImageSources(html, uploadedUrls) {
    let index = 0;
    return html.replace(IMAGE_SRC_RE, (whole, prefix, quote, _source) => {
      if (index >= uploadedUrls.length) return whole;
      const replacement = uploadedUrls[index];
      index += 1;
      return `${prefix}${quote}${replacement}${quote}`;
    });
  }
  async function pushDraft(input) {
    const token = await fetchAccessToken();
    const uploadedUrls = [];
    for (const image of input.contentImages) {
      const url = await callJson("/cgi-bin/media/uploadimg", { access_token: token }, {
        method: "POST",
        body: multipart(image)
      }).then((data) => {
        if (typeof data.url !== "string" || !data.url) {
          throw new WeChatApiError(-1, "SYSTEM", "uploadimg \u54CD\u5E94\u672A\u5305\u542B CDN URL", "\u5FAE\u4FE1 uploadimg \u54CD\u5E94\u672A\u5305\u542B CDN URL");
        }
        return data.url;
      });
      uploadedUrls.push(url);
    }
    const thumbMediaId = await uploadThumbMaterial(input.thumbImage);
    const finalHtml = replaceImageSources(input.contentHtml, uploadedUrls);
    const mediaId = await addDraft({
      title: input.title,
      digest: input.digest,
      author: input.author ?? deps.getSettings().author,
      contentHtml: finalHtml,
      thumbMediaId,
      contentImageUrls: uploadedUrls
    });
    return { mediaId, thumbMediaId };
  }
  async function diagnose() {
    try {
      await fetchAccessToken();
      return { reachable: true, ipWhitelisted: true, hint: "\u5FAE\u4FE1 API \u8FDE\u63A5\u6B63\u5E38\uFF0C\u5F53\u524D\u51FA\u53E3 IP \u5DF2\u5728\u767D\u540D\u5355\u3002" };
    } catch (error) {
      if (error instanceof WeChatApiError) {
        if (error.classification === "NETWORK") {
          return { reachable: false, hint: error.hint ?? NETWORK_HINT };
        }
        if (error.classification === "IP_WHITELIST") {
          return {
            reachable: true,
            ipWhitelisted: false,
            errcode: error.errcode,
            hint: hintForClassification("IP_WHITELIST", extractExitIp(error.message))
          };
        }
        return {
          reachable: true,
          errcode: error.errcode,
          hint: error.hint ?? hintForClassification(error.classification)
        };
      }
      return { reachable: false, hint: NETWORK_HINT };
    }
  }
  return {
    fetchAccessToken,
    uploadContentImage,
    uploadThumbMaterial,
    addDraft,
    pushDraft,
    diagnose
  };
}

// src/host/wechat-flow.ts
async function pushArticleDraft(deps, articleId) {
  const article = deps.articles.get(articleId);
  if (!article) throw new WewriteServiceError("article-not-found", `\u6587\u7AE0\u4E0D\u5B58\u5728\uFF1A${articleId}`);
  if (article.status === "editing" || article.status === "failed") {
    throw new WewriteServiceError("gates-not-passed", "\u8D28\u91CF\u95E8\u7981\u672A\u8FC7\uFF1A\u8BE5\u6587\u7AE0\u5C1A\u672A\u901A\u8FC7\u7BA1\u7EBF\u95E8\u7981\uFF0C\u5B8C\u6210\u7BA1\u7EBF\u6216\u4FEE\u6539\u540E\u518D\u63A8\u9001");
  }
  if (!article.coverImageId) throw new WewriteServiceError("cover-missing", "\u7F3A\u5C11\u5C01\u9762\u56FE\uFF1A\u5148\u8FD0\u884C\u914D\u56FE\u6B65\u6216\u7ED1\u5B9A\u5C01\u9762");
  const cover = deps.images.get(article.coverImageId);
  if (!cover) throw new WewriteServiceError("cover-missing", "\u5C01\u9762\u56FE\u8BB0\u5F55\u7F3A\u5931");
  const bodyImages = article.bodyImageIds.map((id) => deps.images.get(id)).filter((image) => Boolean(image));
  await deps.refreshSecret();
  const client = createWeChatClient(deps.clientDeps);
  const html = convertArticle({ markdown: article.markdown, theme: article.theme });
  const result = await client.pushDraft({
    title: article.title,
    digest: article.digest,
    contentHtml: html,
    thumbImage: { buffer: Buffer.from(cover.base64, "base64"), mime: cover.mime },
    contentImages: bodyImages.map((image) => ({ buffer: Buffer.from(image.base64, "base64"), mime: image.mime }))
  });
  await deps.serialize(async () => {
    const current = deps.articles.get(articleId);
    if (!current) return;
    await deps.articles.put(articleId, {
      ...current,
      status: "pushed",
      wechatMediaId: result.mediaId,
      thumbMediaId: result.thumbMediaId,
      updatedAt: deps.now().toISOString()
    });
  });
  return result;
}
async function diagnoseWeChat(deps) {
  await deps.refreshSecret();
  return createWeChatClient(deps.clientDeps).diagnose();
}

// src/host/service.ts
var WeWriteService = class _WeWriteService {
  constructor(deps) {
    this.deps = deps;
    this.tables = openTables(deps.domain);
    this.logger = deps.logger ?? resolveLogger({}, "dsh-wewrite");
    this.nowFn = deps.now ?? (() => /* @__PURE__ */ new Date());
    this.state = parseGlobalState(deps.domain.global.get(), this.logger);
    this.runStore = createDomainRunStore(this.tables.runs, this.logger);
    this.articles = new ArticleStore({
      tables: this.tables,
      runStore: this.runStore,
      serialize: (operation) => this.serialize(operation),
      nowIso: () => this.nowIso(),
      getSettings: () => this.settings
    });
    this.schedules = new ScheduleStore({
      tables: this.tables,
      serialize: (operation) => this.serialize(operation),
      nowIso: () => this.nowIso(),
      startRun: (schedule) => this.startRun({ trigger: "schedule", params: schedule.params, scheduleId: schedule.id })
    });
    this.engine = createPipelineEngine({
      llm: deps.llm,
      store: this.runStore,
      gates: qualityGatesRunner,
      renderer: { convert: ({ markdown, theme }) => convertArticle({ markdown, theme }) },
      topicSource: { fetch: async (limit) => [...await this.fetchHotspots(limit)] },
      images: createImagesGenerator({
        getSettings: () => this.settings,
        resolveCredential: (ref) => Promise.resolve(deps.credentials.resolve(ref)),
        now: this.nowFn,
        ...deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {},
        persist: async (records) => {
          for (const record of records) await this.tables.images.put(record.id, record);
        }
      }),
      onProduced: ({ markdown, runId }) => this.articles.persistProduced(markdown, runId),
      onImagesBound: ({ articleId, coverImageId, bodyImageIds }) => this.articles.bindImages(articleId, { coverImageId, bodyImageIds }),
      now: this.nowFn
    });
    this.scheduler = createSchedulerService({
      loadSchedules: async () => [...this.tables.schedules.entries()].map(([, record]) => record),
      saveSchedule: async (record) => this.tables.schedules.put(record.id, record),
      claim: (key) => this.claimOccurrence(key),
      startRun: async (schedule) => this.startRun({ trigger: "schedule", params: schedule.params, scheduleId: schedule.id }).runId,
      now: this.nowFn
    });
  }
  deps;
  tables;
  runStore;
  engine;
  logger;
  nowFn;
  state;
  operationTail = Promise.resolve();
  wechatSecret = "";
  articles;
  schedules;
  scheduler;
  static async open(deps) {
    const service = new _WeWriteService(deps);
    await service.persistState();
    const recovered = await service.engine.resumeInterrupted();
    if (recovered > 0) service.logger.warn(`\u5BBF\u4E3B\u505C\u673A\u6253\u65AD ${recovered} \u4E2A run\uFF0C\u5DF2\u6807\u8BB0 interrupted\uFF08\u4E0D\u81EA\u52A8\u8865\u507F\u91CD\u8DD1\uFF09`);
    return service;
  }
  serialize(operation) {
    const next = this.operationTail.then(operation, operation);
    this.operationTail = next.catch(() => void 0);
    return next;
  }
  async persistState() {
    await this.deps.domain.global.set(this.state);
  }
  get settings() {
    return this.state.settings;
  }
  nowIso() {
    return this.nowFn().toISOString();
  }
  // ── snapshot / hotspots / runs ─────────────────────────────────────────────
  async snapshot() {
    return {
      articles: this.listArticles(),
      runs: this.listRuns(),
      schedules: [...this.tables.schedules.entries()].map(([, record]) => scheduleToView(record)),
      config: await this.getConfig(),
      serverNow: this.nowIso(),
      capabilities: { contractVersion: CONTRACT_VERSION, features: ["scheduler", "images", "hotspots", "gates"] }
    };
  }
  listRuns() {
    return this.runStore.all().sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)).map(runToSummary);
  }
  async fetchHotspots(limit = 20) {
    const sources = buildHotspotSources({ aggregatorUrl: this.settings.hotspotAggregatorUrl, fetchImpl: this.deps.fetchImpl });
    const { items, failures } = await aggregateHotspots(sources, limit);
    for (const failure of failures) {
      this.logger.warn(truncateMessage(`\u70ED\u699C\u6E90 ${failure.sourceId} \u62C9\u53D6\u5931\u8D25\uFF1A${failure.message}`));
    }
    return [...items];
  }
  startRun(input) {
    const params = { ...input.params, llm: { ...this.state.settings.llmDefault, ...input.params.llm ?? {} } };
    const { runId, done } = this.engine.begin({
      trigger: input.trigger,
      params,
      ...input.articleId ? { articleId: input.articleId } : {},
      ...input.scheduleId ? { scheduleId: input.scheduleId } : {}
    });
    void done.catch((error) => {
      const serviceError = toServiceError(error);
      this.logger.error(truncateMessage(`run ${runId} \u6267\u884C\u5F02\u5E38\uFF08${serviceError.code}\uFF09\uFF1A${serviceError.message}`));
    });
    return { runId };
  }
  cancelRun(runId) {
    return { ok: this.engine.cancel(runId) };
  }
  // ── articles / schedules（委托 store）─────────────────────────────────────
  listArticles() {
    return this.articles.list();
  }
  getArticle(id) {
    return this.articles.get(id);
  }
  saveArticle(input) {
    return this.articles.save(input);
  }
  deleteArticle(id) {
    return this.articles.delete(id);
  }
  previewArticle(input) {
    return this.articles.preview(input);
  }
  saveSchedule(input) {
    return this.schedules.save(input);
  }
  deleteSchedule(id) {
    return this.schedules.delete(id);
  }
  toggleSchedule(id, enabled) {
    return this.schedules.toggle(id, enabled);
  }
  runScheduleNow(id) {
    return this.schedules.runNow(id);
  }
  async claimOccurrence(key) {
    return this.serialize(async () => {
      if (this.state.claimedOccurrences.includes(key)) return false;
      this.state = { ...this.state, claimedOccurrences: [...this.state.claimedOccurrences, key].slice(-500) };
      await this.persistState();
      return true;
    });
  }
  async getConfig() {
    return buildConfigView(this.settings, await this.describeCredentials());
  }
  async setConfig(patch) {
    return this.serialize(async () => {
      const parsed = SettingsRecordSchema.safeParse({ ...this.state.settings, ...patch });
      if (!parsed.success) {
        throw new WewriteServiceError("config-invalid", `\u8BBE\u7F6E\u6821\u9A8C\u5931\u8D25\uFF1A${parsed.error.issues[0]?.message ?? "\u672A\u77E5\u95EE\u9898"}`);
      }
      this.state = { ...this.state, settings: parsed.data };
      await this.persistState();
      return this.getConfig();
    });
  }
  async setCredential(ref, value) {
    await this.deps.credentials.set(ref, value);
    if (ref === CREDENTIAL_REFS.wechatSecret) this.wechatSecret = value;
    return { ok: true };
  }
  async describeCredentials() {
    const refs = [CREDENTIAL_REFS.wechatSecret, ...DEFAULT_IMAGE_PROVIDER_CHAIN.map(CREDENTIAL_REFS.image)];
    const descriptors = {};
    for (const ref of refs) {
      const raw = await Promise.resolve(this.deps.credentials.describe(ref));
      descriptors[ref] = { configured: raw?.configured ?? false, writable: raw?.writable ?? true };
    }
    return descriptors;
  }
  async listLlmOptions() {
    const rawProviders = await Promise.resolve(this.deps.llm.listProviders?.() ?? []);
    const providers = Array.isArray(rawProviders) ? rawProviders : [];
    const result = [];
    for (const entry of providers) {
      const listing = entry;
      const id = String(listing?.id ?? listing?.name ?? entry ?? "");
      if (!id) continue;
      const rawModels = await Promise.resolve(this.deps.llm.listModels?.(id) ?? []);
      const models = (Array.isArray(rawModels) ? rawModels : []).map(
        (model) => String(model?.id ?? model)
      );
      result.push({ id, models });
    }
    return { providers: result };
  }
  // ── wechat / lifecycle ─────────────────────────────────────────────────────
  weChatFlowDeps() {
    return {
      articles: this.tables.articles,
      images: this.tables.images,
      clientDeps: {
        ...this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {},
        getCredentials: () => ({ appId: this.settings.wechatAppId, secret: this.wechatSecret }),
        getSettings: () => ({ apiBaseUrl: this.settings.wechatApiBaseUrl, author: this.settings.wechatAuthor })
      },
      refreshSecret: async () => {
        const resolved = await Promise.resolve(this.deps.credentials.resolve(CREDENTIAL_REFS.wechatSecret));
        this.wechatSecret = resolved ?? "";
      },
      serialize: (operation) => this.serialize(operation),
      now: this.nowFn
    };
  }
  async pushArticleDraft(articleId) {
    return pushArticleDraft(this.weChatFlowDeps(), articleId);
  }
  async diagnoseWeChat() {
    return diagnoseWeChat(this.weChatFlowDeps());
  }
  startScheduler() {
    this.scheduler.start();
  }
  async pruneRunHistory() {
    const kept = pruneTerminalRuns(this.runStore.all(), this.settings.runHistoryLimit);
    const keptIds = new Set(kept.map((run) => run.id));
    for (const run of this.runStore.all()) {
      if (!keptIds.has(run.id)) await this.tables.runs.delete(run.id);
    }
  }
  async dispose() {
    this.scheduler.stop();
    await this.deps.domain.close().catch(() => void 0);
  }
};

// src/host/tools.ts
function buildDefinitions(service) {
  return [
    {
      name: "wewrite_run",
      description: "\u8FD0\u884C\u4E00\u6B21 WeWrite \u5199\u4F5C\u7BA1\u7EBF\uFF08\u9009\u9898\u5230\u5927\u7A3F\uFF0C\u7ECF\u8D28\u91CF\u95E8\u7981\u4E0E\u6392\u7248\uFF09\u3002\u8FD4\u56DE runId\uFF0C\u8FDB\u5EA6\u4E0E\u4EA7\u7269\u7ECF Web \u5DE5\u4F5C\u53F0\u6216 snapshot \u67E5\u770B\u3002",
      parameters: {
        topic: { type: "string", required: true, description: "\u6587\u7AE0\u4E3B\u9898\uFF08\u56FA\u5B9A\u9009\u9898\u6A21\u5F0F\uFF09" },
        image_count: { type: "integer", description: "\u6B63\u6587\u914D\u56FE\u6570\u91CF\uFF0C0-10\uFF0C\u9ED8\u8BA4 0" }
      },
      async execute(args) {
        const topic = String(args.topic ?? "");
        if (!topic) return { ok: false, code: "topic-required", message: "\u7F3A\u5C11 topic \u53C2\u6570" };
        const rawCount = Number(args.image_count ?? 0);
        const imageCount = Number.isInteger(rawCount) ? Math.min(10, Math.max(0, rawCount)) : 0;
        const { runId } = service.startRun({ trigger: "manual", params: { topicMode: "fixed", topic, imageCount } });
        return { ok: true, runId };
      }
    },
    {
      name: "wewrite_push_draft",
      description: "\u628A\u4E00\u7BC7\u5DF2\u8FC7\u95E8\u7981\u7684\u6587\u7AE0\u63A8\u9001\u5230\u5FAE\u4FE1\u516C\u4F17\u53F7\u8349\u7A3F\u7BB1\uFF08\u53EA\u8FDB\u8349\u7A3F\u7BB1\uFF0C\u4E0D\u7FA4\u53D1\uFF09\u3002\u9700\u8981\u6587\u7AE0\u5DF2\u5B8C\u6210\u6E32\u67D3\u4E14\u7ED1\u5B9A\u5C01\u9762\u3002",
      parameters: {
        article_id: { type: "string", required: true, description: "\u6587\u7AE0 ID\uFF08article/list \u53EF\u67E5\uFF09" }
      },
      async execute(args) {
        const articleId = String(args.article_id ?? "");
        if (!articleId) return { ok: false, code: "article-required", message: "\u7F3A\u5C11 article_id \u53C2\u6570" };
        try {
          const result = await service.pushArticleDraft(articleId);
          return { ok: true, mediaId: result.mediaId, thumbMediaId: result.thumbMediaId };
        } catch (error) {
          return {
            ok: false,
            code: "push-failed",
            message: error instanceof Error ? error.message : String(error ?? "\u672A\u77E5\u9519\u8BEF")
          };
        }
      }
    }
  ];
}
function registerWewriteTools(ctx, service, options) {
  if (!options.enabled) return [];
  const disposers = [];
  const mount = (agent) => {
    try {
      for (const definition of buildDefinitions(service)) {
        const stop = agent.ctx.tools.register(definition);
        if (typeof stop === "function") disposers.push(stop);
      }
    } catch (error) {
      console.warn(`dsh-wewrite: Agent \u5DE5\u5177\u6CE8\u518C\u964D\u7EA7\uFF08agent ${String(agent.id)}\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
  };
  try {
    for (const agent of ctx.agents?.roots?.() ?? []) mount(agent);
    const stopCreated = ctx.on?.("agent/created", ((event) => {
      const agent = event.agent;
      mount(agent);
    }));
    if (typeof stopCreated === "function") disposers.push(stopCreated);
  } catch (error) {
    console.warn(`dsh-wewrite: Agent \u5DE5\u5177\u88C5\u914D\u964D\u7EA7\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  return disposers;
}

// src/host/index.ts
var name = "dsh-wewrite";
var inject = ["storageDomain", "agents", "sessions", "connection", "llm", "credentials", "tools"];
var Config = z5.object({
  agentToolsEnabled: z5.boolean().default(false),
  schedulerTickSeconds: z5.number().int().min(5).default(30)
});
function fallbackCredentials(logger) {
  const values = /* @__PURE__ */ new Map();
  logger.warn("dsh-wewrite: \u5BBF\u4E3B credentials \u670D\u52A1\u7F3A\u5931\uFF0C\u51ED\u636E\u9000\u5316\u4E3A\u8FDB\u7A0B\u5185\u5B58\uFF08\u91CD\u542F\u5373\u5931\uFF0C\u8BF7\u5347\u7EA7 DSH\uFF09");
  return {
    resolve: async (ref) => values.get(ref),
    describe: (ref) => ({ configured: values.has(ref), writable: true }),
    set: async (ref, value) => {
      values.set(ref, value);
    },
    unset: async (ref) => {
      values.delete(ref);
    }
  };
}
function fallbackLlm(logger) {
  logger.warn("dsh-wewrite: \u5BBF\u4E3B llm \u670D\u52A1\u7F3A\u5931\uFF0C\u7BA1\u7EBF\u6587\u672C\u6B65\u5C06\u7ACB\u5373\u5931\u8D25\uFF08\u8BF7\u5728 DSH \u8BBE\u7F6E\u9875\u914D\u7F6E\u6A21\u578B\uFF09");
  return {
    async *stream() {
      yield { type: "finish", error: { code: "llm-unavailable", message: "\u5BBF\u4E3B llm \u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u65E0\u6CD5\u6267\u884C\u5199\u4F5C\u7BA1\u7EBF\u6587\u672C\u6B65" } };
    }
  };
}
async function apply(ctx, rawConfig) {
  const config = Config.parse(rawConfig ?? {});
  const logger = resolveLogger(ctx, "dsh-wewrite");
  const storageDomain = ctx.storageDomain;
  if (!storageDomain) {
    logger.warn("dsh-wewrite: storageDomain \u670D\u52A1\u7F3A\u5931\uFF0C\u5BBF\u4E3B\u4FA7\u4E0D\u6FC0\u6D3B\uFF08\u5B89\u88C5\u9762\u68C0\u67E5 DSH \u7248\u672C\uFF09");
    return;
  }
  if (!ctx.effect) {
    logger.warn("dsh-wewrite: ctx.effect \u7F3A\u5931\uFF0C\u5BBF\u4E3B\u751F\u547D\u5468\u671F\u65E0\u6CD5\u6302\u8F7D\uFF08\u68C0\u67E5 DSH \u7248\u672C\u517C\u5BB9\u6027\uFF09");
    return;
  }
  await ctx.effect(async () => {
    const domain = await storageDomain.open(domainSpec);
    const service = await WeWriteService.open({
      domain,
      credentials: ctx.credentials ?? fallbackCredentials(logger),
      llm: ctx.llm ?? fallbackLlm(logger),
      logger
    });
    const disposers = [];
    try {
      const stopRpc = registerWewriteRpc(ctx.connection?.rpc, service, logger);
      disposers.push(() => {
        void Promise.resolve(stopRpc).then((dispose) => dispose?.());
      });
      for (const stop of registerWewriteTools(ctx, service, { enabled: config.agentToolsEnabled })) {
        disposers.push(stop);
      }
      service.startScheduler();
    } catch (error) {
      logger.warn(`dsh-wewrite: \u8D21\u732E\u88C5\u914D\u90E8\u5206\u964D\u7EA7\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
    return async () => {
      for (const dispose of [...disposers].reverse()) {
        await Promise.resolve(dispose()).catch(() => void 0);
      }
      await service.dispose();
    };
  }, "dsh-wewrite: host service");
}
export {
  Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
