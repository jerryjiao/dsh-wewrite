/**
 * 视图模型 schema（分层中层）：client 面板与 host service 的投影形状。
 * 单向依赖 schema-base；被 contract.ts 汇总再导出（tests 钉定 '@/shared/contract' 面）。
 */
import { z } from 'zod';
export declare const HotspotItemSchema: z.ZodObject<{
    title: z.ZodString;
    source: z.ZodString;
    rank: z.ZodNumber;
    url: z.ZodString;
}, z.core.$strict>;
export type HotspotItem = z.infer<typeof HotspotItemSchema>;
/** 热榜逐条 AI 速览请求条目（uiux v0.3 §1）：只要 rank/title/url，不带 source 投影。 */
export declare const HotspotDigestItemSchema: z.ZodObject<{
    rank: z.ZodNumber;
    title: z.ZodString;
    url: z.ZodString;
}, z.core.$strict>;
export type HotspotDigestItem = z.infer<typeof HotspotDigestItemSchema>;
/** 热榜逐条 AI 速览响应（uiux v0.3 §1）：source 由 host 依抓取抽取结果判定，不由模型自报。 */
export declare const HotspotItemDigestSchema: z.ZodObject<{
    digest: z.ZodString;
    source: z.ZodEnum<{
        title: "title";
        article: "article";
    }>;
    model: z.ZodString;
    generatedAtIso: z.ZodISODateTime;
}, z.core.$strict>;
export type HotspotItemDigest = z.infer<typeof HotspotItemDigestSchema>;
export declare const ArticleListItemSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    title: z.ZodString;
    digest: z.ZodString;
    status: z.ZodEnum<{
        editing: "editing";
        rendered: "rendered";
        pushed: "pushed";
        failed: "failed";
    }>;
    updatedAt: z.ZodString;
}, z.core.$strict>;
export type ArticleListItem = z.infer<typeof ArticleListItemSchema>;
export declare const ArticleDetailSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    title: z.ZodString;
    digest: z.ZodString;
    status: z.ZodEnum<{
        editing: "editing";
        rendered: "rendered";
        pushed: "pushed";
        failed: "failed";
    }>;
    updatedAt: z.ZodString;
    v: z.ZodNumber;
    markdown: z.ZodString;
    theme: z.ZodString;
    bodyImageIds: z.ZodArray<z.ZodString>;
    coverImageId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
    wechatMediaId: z.ZodOptional<z.ZodString>;
    thumbMediaId: z.ZodOptional<z.ZodString>;
    lastRunId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type ArticleDetail = z.infer<typeof ArticleDetailSchema>;
export declare const RunSummarySchema: z.ZodObject<{
    id: z.ZodString;
    trigger: z.ZodEnum<{
        manual: "manual";
        schedule: "schedule";
    }>;
    scheduleId: z.ZodOptional<z.ZodString>;
    articleId: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        failed: "failed";
        queued: "queued";
        running: "running";
        succeeded: "succeeded";
        cancelled: "cancelled";
        interrupted: "interrupted";
    }>;
    startedAt: z.ZodString;
    finishedAt: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type RunSummary = z.infer<typeof RunSummarySchema>;
export declare const ScheduleViewModelSchema: z.ZodObject<{
    id: z.ZodString;
    revision: z.ZodNumber;
    name: z.ZodString;
    rrule: z.ZodString;
    timeZone: z.ZodString;
    params: z.ZodObject<{
        topicMode: z.ZodEnum<{
            hotspots: "hotspots";
            fixed: "fixed";
        }>;
        topic: z.ZodOptional<z.ZodString>;
        theme: z.ZodOptional<z.ZodString>;
        imageCount: z.ZodOptional<z.ZodNumber>;
        llm: z.ZodOptional<z.ZodObject<{
            provider: z.ZodOptional<z.ZodString>;
            model: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    enabled: z.ZodBoolean;
    publishTarget: z.ZodLiteral<"draft">;
    nextRunAt: z.ZodString;
    lastRunAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type ScheduleViewModel = z.infer<typeof ScheduleViewModelSchema>;
export declare const CredentialsDescriptorSchema: z.ZodObject<{
    configured: z.ZodBoolean;
    writable: z.ZodBoolean;
}, z.core.$strict>;
export type CredentialsDescriptor = z.infer<typeof CredentialsDescriptorSchema>;
export declare const ConfigSettingsViewSchema: z.ZodObject<{
    wechatAppId: z.ZodString;
    wechatApiBaseUrl: z.ZodString;
    wechatAuthor: z.ZodString;
    defaultTheme: z.ZodString;
    defaultImageSize: z.ZodEnum<{
        "1024x1024": "1024x1024";
        "1024x1536": "1024x1536";
        "1536x1024": "1536x1024";
        "1344x768": "1344x768";
        "768x1344": "768x1344";
    }>;
    llmDefault: z.ZodObject<{
        provider: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    agentToolsEnabled: z.ZodBoolean;
    runHistoryLimit: z.ZodNumber;
    hotspotAggregatorUrl: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type ConfigSettingsView = z.infer<typeof ConfigSettingsViewSchema>;
export declare const ConfigViewSchema: z.ZodObject<{
    settings: z.ZodObject<{
        wechatAppId: z.ZodString;
        wechatApiBaseUrl: z.ZodString;
        wechatAuthor: z.ZodString;
        defaultTheme: z.ZodString;
        defaultImageSize: z.ZodEnum<{
            "1024x1024": "1024x1024";
            "1024x1536": "1024x1536";
            "1536x1024": "1536x1024";
            "1344x768": "1344x768";
            "768x1344": "768x1344";
        }>;
        llmDefault: z.ZodObject<{
            provider: z.ZodOptional<z.ZodString>;
            model: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        agentToolsEnabled: z.ZodBoolean;
        runHistoryLimit: z.ZodNumber;
        hotspotAggregatorUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    credentials: z.ZodRecord<z.ZodString, z.ZodObject<{
        configured: z.ZodBoolean;
        writable: z.ZodBoolean;
    }, z.core.$strict>>;
    imageProviders: z.ZodArray<z.ZodObject<{
        providerId: z.ZodEnum<{
            openai: "openai";
            doubao: "doubao";
            dashscope: "dashscope";
            jimeng: "jimeng";
            minimax: "minimax";
            azure_openai: "azure_openai";
            gemini: "gemini";
            openrouter: "openrouter";
            replicate: "replicate";
        }>;
        model: z.ZodOptional<z.ZodString>;
        baseUrl: z.ZodOptional<z.ZodString>;
        credentialRef: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ConfigView = z.infer<typeof ConfigViewSchema>;
export declare const CapabilitiesSchema: z.ZodObject<{
    contractVersion: z.ZodLiteral<1>;
    features: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;
export declare const SnapshotResponseSchema: z.ZodObject<{
    articles: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        slug: z.ZodString;
        title: z.ZodString;
        digest: z.ZodString;
        status: z.ZodEnum<{
            editing: "editing";
            rendered: "rendered";
            pushed: "pushed";
            failed: "failed";
        }>;
        updatedAt: z.ZodString;
    }, z.core.$strict>>;
    runs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        trigger: z.ZodEnum<{
            manual: "manual";
            schedule: "schedule";
        }>;
        scheduleId: z.ZodOptional<z.ZodString>;
        articleId: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            failed: "failed";
            queued: "queued";
            running: "running";
            succeeded: "succeeded";
            cancelled: "cancelled";
            interrupted: "interrupted";
        }>;
        startedAt: z.ZodString;
        finishedAt: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodObject<{
            code: z.ZodString;
            message: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    schedules: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        revision: z.ZodNumber;
        name: z.ZodString;
        rrule: z.ZodString;
        timeZone: z.ZodString;
        params: z.ZodObject<{
            topicMode: z.ZodEnum<{
                hotspots: "hotspots";
                fixed: "fixed";
            }>;
            topic: z.ZodOptional<z.ZodString>;
            theme: z.ZodOptional<z.ZodString>;
            imageCount: z.ZodOptional<z.ZodNumber>;
            llm: z.ZodOptional<z.ZodObject<{
                provider: z.ZodOptional<z.ZodString>;
                model: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        enabled: z.ZodBoolean;
        publishTarget: z.ZodLiteral<"draft">;
        nextRunAt: z.ZodString;
        lastRunAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    config: z.ZodObject<{
        settings: z.ZodObject<{
            wechatAppId: z.ZodString;
            wechatApiBaseUrl: z.ZodString;
            wechatAuthor: z.ZodString;
            defaultTheme: z.ZodString;
            defaultImageSize: z.ZodEnum<{
                "1024x1024": "1024x1024";
                "1024x1536": "1024x1536";
                "1536x1024": "1536x1024";
                "1344x768": "1344x768";
                "768x1344": "768x1344";
            }>;
            llmDefault: z.ZodObject<{
                provider: z.ZodOptional<z.ZodString>;
                model: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
            agentToolsEnabled: z.ZodBoolean;
            runHistoryLimit: z.ZodNumber;
            hotspotAggregatorUrl: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        credentials: z.ZodRecord<z.ZodString, z.ZodObject<{
            configured: z.ZodBoolean;
            writable: z.ZodBoolean;
        }, z.core.$strict>>;
        imageProviders: z.ZodArray<z.ZodObject<{
            providerId: z.ZodEnum<{
                openai: "openai";
                doubao: "doubao";
                dashscope: "dashscope";
                jimeng: "jimeng";
                minimax: "minimax";
                azure_openai: "azure_openai";
                gemini: "gemini";
                openrouter: "openrouter";
                replicate: "replicate";
            }>;
            model: z.ZodOptional<z.ZodString>;
            baseUrl: z.ZodOptional<z.ZodString>;
            credentialRef: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    serverNow: z.ZodISODateTime;
    capabilities: z.ZodObject<{
        contractVersion: z.ZodLiteral<1>;
        features: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type SnapshotResponse = z.infer<typeof SnapshotResponseSchema>;
