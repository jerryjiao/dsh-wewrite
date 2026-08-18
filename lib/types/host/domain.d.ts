/**
 * storage domain schema（Spec §6 / 架构 §5）：单一 domain `dsh-wewrite` v1。
 * zod schema 即权威；全部记录带 v 字段做记录级演进（架构 §9.6）。
 * 介质版本不符时 storageDomain.open 拒绝——天然迁移闸门。
 */
import { z } from 'zod';
export declare const SettingsRecordSchema: z.ZodObject<{
    wechatAppId: z.ZodDefault<z.ZodString>;
    wechatApiBaseUrl: z.ZodDefault<z.ZodString>;
    wechatAuthor: z.ZodDefault<z.ZodString>;
    defaultTheme: z.ZodDefault<z.ZodString>;
    defaultImageSize: z.ZodDefault<z.ZodEnum<{
        "1024x1024": "1024x1024";
        "1024x1536": "1024x1536";
        "1536x1024": "1536x1024";
        "1344x768": "1344x768";
        "768x1344": "768x1344";
    }>>;
    llmDefault: z.ZodDefault<z.ZodObject<{
        provider: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    imageProviders: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strict>>>;
    agentToolsEnabled: z.ZodDefault<z.ZodBoolean>;
    runHistoryLimit: z.ZodDefault<z.ZodNumber>;
    hotspotAggregatorUrl: z.ZodDefault<z.ZodString>;
}, z.core.$strict>;
export type SettingsRecord = z.infer<typeof SettingsRecordSchema>;
export declare const ArticleRecordSchema: z.ZodObject<{
    v: z.ZodNumber;
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
    markdown: z.ZodString;
    theme: z.ZodString;
    bodyImageIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    coverImageId: z.ZodOptional<z.ZodString>;
    wechatMediaId: z.ZodOptional<z.ZodString>;
    thumbMediaId: z.ZodOptional<z.ZodString>;
    lastRunId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strict>;
export type ArticleRecord = z.infer<typeof ArticleRecordSchema>;
export declare const StepRecordSchema: z.ZodObject<{
    name: z.ZodString;
    status: z.ZodEnum<{
        failed: "failed";
        running: "running";
        succeeded: "succeeded";
        cancelled: "cancelled";
        pending: "pending";
    }>;
    startedAt: z.ZodOptional<z.ZodString>;
    finishedAt: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>>;
    metrics: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strict>;
export type StepRecord = z.infer<typeof StepRecordSchema>;
export declare const RunRecordSchema: z.ZodObject<{
    v: z.ZodNumber;
    id: z.ZodString;
    trigger: z.ZodEnum<{
        manual: "manual";
        schedule: "schedule";
    }>;
    scheduleId: z.ZodOptional<z.ZodString>;
    articleId: z.ZodOptional<z.ZodString>;
    paramsSnapshot: z.ZodObject<{
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
    status: z.ZodEnum<{
        failed: "failed";
        queued: "queued";
        running: "running";
        succeeded: "succeeded";
        cancelled: "cancelled";
        interrupted: "interrupted";
    }>;
    steps: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        status: z.ZodEnum<{
            failed: "failed";
            running: "running";
            succeeded: "succeeded";
            cancelled: "cancelled";
            pending: "pending";
        }>;
        startedAt: z.ZodOptional<z.ZodString>;
        finishedAt: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodObject<{
            code: z.ZodString;
            message: z.ZodString;
        }, z.core.$strict>>;
        metrics: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strict>>;
    error: z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
    }, z.core.$strict>>;
    summary: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodString;
    finishedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export declare const ScheduleRecordSchema: z.ZodObject<{
    v: z.ZodNumber;
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
    publishTarget: z.ZodLiteral<"draft">;
    enabled: z.ZodBoolean;
    nextRunAt: z.ZodString;
    lastRunAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type ScheduleRecord = z.infer<typeof ScheduleRecordSchema>;
export declare const ImageRecordSchema: z.ZodObject<{
    v: z.ZodNumber;
    id: z.ZodString;
    articleId: z.ZodString;
    kind: z.ZodEnum<{
        cover: "cover";
        body: "body";
    }>;
    mime: z.ZodString;
    base64: z.ZodString;
    provider: z.ZodString;
    model: z.ZodString;
    prompt: z.ZodString;
    wechatUrl: z.ZodOptional<z.ZodString>;
    wechatMediaId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strict>;
export type ImageRecord = z.infer<typeof ImageRecordSchema>;
export declare const GlobalStateSchema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    settings: z.ZodObject<{
        wechatAppId: z.ZodDefault<z.ZodString>;
        wechatApiBaseUrl: z.ZodDefault<z.ZodString>;
        wechatAuthor: z.ZodDefault<z.ZodString>;
        defaultTheme: z.ZodDefault<z.ZodString>;
        defaultImageSize: z.ZodDefault<z.ZodEnum<{
            "1024x1024": "1024x1024";
            "1024x1536": "1024x1536";
            "1536x1024": "1536x1024";
            "1344x768": "1344x768";
            "768x1344": "768x1344";
        }>>;
        llmDefault: z.ZodDefault<z.ZodObject<{
            provider: z.ZodOptional<z.ZodString>;
            model: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        imageProviders: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
        }, z.core.$strict>>>;
        agentToolsEnabled: z.ZodDefault<z.ZodBoolean>;
        runHistoryLimit: z.ZodDefault<z.ZodNumber>;
        hotspotAggregatorUrl: z.ZodDefault<z.ZodString>;
    }, z.core.$strict>;
    claimedOccurrences: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type GlobalState = z.infer<typeof GlobalStateSchema>;
export declare const domainSpec: {
    readonly name: "dsh-wewrite";
    readonly version: 1;
    readonly global: {
        readonly valueSchema: z.ZodObject<{
            v: z.ZodLiteral<1>;
            settings: z.ZodObject<{
                wechatAppId: z.ZodDefault<z.ZodString>;
                wechatApiBaseUrl: z.ZodDefault<z.ZodString>;
                wechatAuthor: z.ZodDefault<z.ZodString>;
                defaultTheme: z.ZodDefault<z.ZodString>;
                defaultImageSize: z.ZodDefault<z.ZodEnum<{
                    "1024x1024": "1024x1024";
                    "1024x1536": "1024x1536";
                    "1536x1024": "1536x1024";
                    "1344x768": "1344x768";
                    "768x1344": "768x1344";
                }>>;
                llmDefault: z.ZodDefault<z.ZodObject<{
                    provider: z.ZodOptional<z.ZodString>;
                    model: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                imageProviders: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
                }, z.core.$strict>>>;
                agentToolsEnabled: z.ZodDefault<z.ZodBoolean>;
                runHistoryLimit: z.ZodDefault<z.ZodNumber>;
                hotspotAggregatorUrl: z.ZodDefault<z.ZodString>;
            }, z.core.$strict>;
            claimedOccurrences: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>;
    };
    readonly tables: {
        readonly articles: {
            readonly valueSchema: z.ZodObject<{
                v: z.ZodNumber;
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
                markdown: z.ZodString;
                theme: z.ZodString;
                bodyImageIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                coverImageId: z.ZodOptional<z.ZodString>;
                wechatMediaId: z.ZodOptional<z.ZodString>;
                thumbMediaId: z.ZodOptional<z.ZodString>;
                lastRunId: z.ZodOptional<z.ZodString>;
                createdAt: z.ZodString;
                updatedAt: z.ZodString;
            }, z.core.$strict>;
        };
        readonly runs: {
            readonly valueSchema: z.ZodObject<{
                v: z.ZodNumber;
                id: z.ZodString;
                trigger: z.ZodEnum<{
                    manual: "manual";
                    schedule: "schedule";
                }>;
                scheduleId: z.ZodOptional<z.ZodString>;
                articleId: z.ZodOptional<z.ZodString>;
                paramsSnapshot: z.ZodObject<{
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
                status: z.ZodEnum<{
                    failed: "failed";
                    queued: "queued";
                    running: "running";
                    succeeded: "succeeded";
                    cancelled: "cancelled";
                    interrupted: "interrupted";
                }>;
                steps: z.ZodArray<z.ZodObject<{
                    name: z.ZodString;
                    status: z.ZodEnum<{
                        failed: "failed";
                        running: "running";
                        succeeded: "succeeded";
                        cancelled: "cancelled";
                        pending: "pending";
                    }>;
                    startedAt: z.ZodOptional<z.ZodString>;
                    finishedAt: z.ZodOptional<z.ZodString>;
                    error: z.ZodOptional<z.ZodObject<{
                        code: z.ZodString;
                        message: z.ZodString;
                    }, z.core.$strict>>;
                    metrics: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                }, z.core.$strict>>;
                error: z.ZodOptional<z.ZodObject<{
                    code: z.ZodString;
                    message: z.ZodString;
                }, z.core.$strict>>;
                summary: z.ZodOptional<z.ZodString>;
                startedAt: z.ZodString;
                finishedAt: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
        };
        readonly schedules: {
            readonly valueSchema: z.ZodObject<{
                v: z.ZodNumber;
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
                publishTarget: z.ZodLiteral<"draft">;
                enabled: z.ZodBoolean;
                nextRunAt: z.ZodString;
                lastRunAt: z.ZodOptional<z.ZodString>;
                createdAt: z.ZodOptional<z.ZodString>;
                updatedAt: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
        };
        readonly images: {
            readonly valueSchema: z.ZodObject<{
                v: z.ZodNumber;
                id: z.ZodString;
                articleId: z.ZodString;
                kind: z.ZodEnum<{
                    cover: "cover";
                    body: "body";
                }>;
                mime: z.ZodString;
                base64: z.ZodString;
                provider: z.ZodString;
                model: z.ZodString;
                prompt: z.ZodString;
                wechatUrl: z.ZodOptional<z.ZodString>;
                wechatMediaId: z.ZodOptional<z.ZodString>;
                createdAt: z.ZodString;
            }, z.core.$strict>;
        };
    };
};
export type WewriteDomainSpec = typeof domainSpec;
