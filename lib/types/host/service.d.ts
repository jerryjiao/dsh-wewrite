/** WeWriteService（架构 §3）：host 级唯一服务；写操作串行化。重活已拆 images/wechat-flow/articles-store/schedules-store/views。 */
import { type ArticleDetail, type ArticleListItem, type ConfigView, type HotspotItem, type RunParams, type RunSummary, type ScheduleViewModel, type SnapshotResponse } from '../shared/contract';
import { type CredentialsService, type HostLogger, type LlmService, type StorageDomainHandle } from './platform';
import { WewriteServiceError } from './service-errors';
import type { DiagnoseResult } from './wechat/client';
export { WewriteServiceError };
export interface ServiceDeps {
    readonly domain: StorageDomainHandle;
    readonly credentials: CredentialsService;
    readonly llm: LlmService;
    readonly fetchImpl?: typeof fetch;
    readonly now?: () => Date;
    readonly logger?: HostLogger;
}
export declare class WeWriteService {
    private readonly deps;
    private readonly tables;
    private readonly runStore;
    private readonly engine;
    private readonly logger;
    private readonly nowFn;
    private state;
    private operationTail;
    private wechatSecret;
    private readonly articles;
    private readonly schedules;
    private readonly scheduler;
    private constructor();
    static open(deps: ServiceDeps): Promise<WeWriteService>;
    private serialize;
    private persistState;
    get settings(): {
        wechatAppId: string;
        wechatApiBaseUrl: string;
        wechatAuthor: string;
        defaultTheme: string;
        defaultImageSize: "1024x1024" | "1024x1536" | "1536x1024" | "1344x768" | "768x1344";
        llmDefault: {
            provider?: string | undefined;
            model?: string | undefined;
        };
        imageProviders: {
            providerId: "openai" | "doubao" | "dashscope" | "jimeng" | "minimax" | "azure_openai" | "gemini" | "openrouter" | "replicate";
            credentialRef: string;
            model?: string | undefined;
            baseUrl?: string | undefined;
        }[];
        agentToolsEnabled: boolean;
        runHistoryLimit: number;
        hotspotAggregatorUrl: string;
    };
    private nowIso;
    snapshot(): Promise<SnapshotResponse>;
    listRuns(): RunSummary[];
    fetchHotspots(limit?: number): Promise<HotspotItem[]>;
    startRun(input: {
        trigger: 'manual' | 'schedule';
        params: RunParams;
        articleId?: string;
        scheduleId?: string;
    }): {
        runId: string;
    };
    cancelRun(runId: string): {
        ok: boolean;
    };
    listArticles(): ArticleListItem[];
    getArticle(id: string): ArticleDetail;
    saveArticle(input: {
        id?: string;
        slug: string;
        title: string;
        digest: string;
        markdown: string;
        theme: string;
    }): Promise<ArticleDetail>;
    deleteArticle(id: string): Promise<{
        deleted: boolean;
    }>;
    previewArticle(input: {
        id: string;
    } | {
        markdown: string;
        theme: string;
    }): {
        html: string;
    };
    saveSchedule(input: {
        id?: string;
        name: string;
        rrule: string;
        timeZone: string;
        params: RunParams;
        enabled: boolean;
    }): Promise<ScheduleViewModel>;
    deleteSchedule(id: string): Promise<{
        deleted: boolean;
    }>;
    toggleSchedule(id: string, enabled: boolean): Promise<ScheduleViewModel>;
    runScheduleNow(id: string): {
        runId: string;
    };
    private claimOccurrence;
    getConfig(): Promise<ConfigView>;
    setConfig(patch: Record<string, unknown>): Promise<ConfigView>;
    setCredential(ref: string, value: string): Promise<{
        ok: boolean;
    }>;
    describeCredentials(): Promise<Record<string, {
        configured: boolean;
        writable: boolean;
    }>>;
    listLlmOptions(): {
        providers: {
            id: string;
            models: string[];
        }[];
    };
    private weChatFlowDeps;
    pushArticleDraft(articleId: string): Promise<{
        mediaId: string;
        thumbMediaId: string;
    }>;
    diagnoseWeChat(): Promise<DiagnoseResult>;
    startScheduler(): void;
    pruneRunHistory(): Promise<void>;
    dispose(): Promise<void>;
}
