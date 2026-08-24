/**
 * 契约基础形状（分层底座）：被 view-schemas 与 contract 两层单向消费，杜绝环。
 * 本层只依赖 zod 与 image-provider-ids，不依赖其他 shared 模块。
 */
import { z } from 'zod';
/** IANA 时区校验（Intl 真实解析，'UTC+8'/'Mars/Olympus' 等均拒）。 */
export declare function isValidTimeZone(timeZone: string): boolean;
export declare const TimeZoneSchema: z.ZodString;
export declare const SlugSchema: z.ZodString;
export declare const CredentialRefSchema: z.ZodString;
export declare const IMAGE_SIZES: z.ZodEnum<{
    "1024x1024": "1024x1024";
    "1024x1536": "1024x1536";
    "1536x1024": "1536x1024";
    "1344x768": "1344x768";
    "768x1344": "768x1344";
}>;
export declare const ImageProviderConfigSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type ImageProviderConfig = z.infer<typeof ImageProviderConfigSchema>;
export declare const LlmOverrideSchema: z.ZodObject<{
    provider: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type LlmOverride = z.infer<typeof LlmOverrideSchema>;
/**
 * 启动 brief（v0.5 变密度输入合同，docs/v0.5-launch-brief.md §2）：
 * 主题之外全部可选——一句话路径零损伤；给了即按分层绑定生效（标题/思路硬绑、大纲骨架绑、来源硬绑+门禁）。
 */
export declare const LaunchBriefSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    approach: z.ZodOptional<z.ZodString>;
    outline: z.ZodOptional<z.ZodArray<z.ZodString>>;
    sources: z.ZodOptional<z.ZodArray<z.ZodURL>>;
}, z.core.$strict>;
export type LaunchBrief = z.infer<typeof LaunchBriefSchema>;
/** 管线运行参数（Spec §5 run/start.params；调度 paramsSnapshot 同型）。 */
export declare const RunParamsSchema: z.ZodObject<{
    topicMode: z.ZodEnum<{
        hotspots: "hotspots";
        fixed: "fixed";
    }>;
    topic: z.ZodOptional<z.ZodString>;
    brief: z.ZodOptional<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        approach: z.ZodOptional<z.ZodString>;
        outline: z.ZodOptional<z.ZodArray<z.ZodString>>;
        sources: z.ZodOptional<z.ZodArray<z.ZodURL>>;
    }, z.core.$strict>>;
    theme: z.ZodOptional<z.ZodString>;
    imageCount: z.ZodOptional<z.ZodNumber>;
    llm: z.ZodOptional<z.ZodObject<{
        provider: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type RunParams = z.infer<typeof RunParamsSchema>;
export declare const ARTICLE_STATUSES: readonly ["editing", "rendered", "pushed", "failed"];
export declare const RUN_STATUSES: readonly ["queued", "running", "succeeded", "failed", "cancelled", "interrupted"];
