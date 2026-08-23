/** WeWriteService（架构 §3）：host 级唯一服务；写操作串行化。重活已拆 images/wechat-flow/articles-store/schedules-store/views。 */
import { type ArticleDetail, type ArticleListItem, type ConfigView, type HotspotDigestItem, type HotspotItem, type HotspotItemDigest, type RunDetail, type RunParams, type RunSummary, type ScheduleViewModel, type SnapshotResponse } from '../shared/contract';
import { type RunRecord } from './domain';
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
    /** 热榜逐条速览 LLM 调用超时毫秒（默认 45s；测试注入缩短值验证 abort 分支）。 */
    readonly digestTimeoutMs?: number;
    /** AI 改写 LLM 调用超时毫秒（默认 45s；测试注入缩短值验证 abort 分支）。 */
    readonly rewriteTimeoutMs?: number;
    readonly agentToolsConfigDefault?: boolean;
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
    /** callId→runId 内存映射（M2 运行卡 callId 兜底链；有界 FIFO，dispose 清空）+ AC-M1-12 单一真源闸门。 */
    private readonly callBindings;
    private readonly agentToolsGate;
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
    /** 热榜逐条 AI 速览（uiux v0.3 §1）：抓原文→抽取→LLM；抓取失败静默降级 title 模式。 */
    digestHotspotItem(item: HotspotDigestItem): Promise<HotspotItemDigest>;
    /** AI 改写选中段（uiux v0.3 §3）：只输出改写文本，maxTokens 随原文长度缩放。 */
    rewriteText(input: {
        text: string;
        instruction: string;
        title?: string;
    }): Promise<{
        text: string;
    }>;
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
    /** chat-integration M1：等待 run 到终态（wewrite_run 工具 execute 等终态用；未知 runId → undefined）。 */
    runCompletion(runId: string): Promise<RunRecord | undefined>;
    /** chat-integration M2 消费面：run 详情（RunSummary + steps + topic，run/detail RPC 透传）。runId/callId 二选一。 */
    runDetail(selector: {
        runId?: string;
        callId?: string;
    }): RunDetail;
    /** M2 callId 兜底链锚点：工具 execute 绑宿主 callId → runId。 */
    bindRunCall(callId: string, runId: string): void;
    lookupArticleTitle(articleId: string): string;
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
    /** AC-M1-12 单一真源总开关（显式设置 > 插件 config 默认）；翻转通知供热回收。 */
    agentToolsEnabled(): boolean;
    onAgentToolsChanged(listener: (enabled: boolean) => void): () => void;
    getConfig(): Promise<ConfigView>;
    setConfig(patch: Record<string, unknown>): Promise<ConfigView>;
    setCredential(ref: string, value: string): Promise<{
        ok: boolean;
    }>;
    describeCredentials(): Promise<Record<string, {
        configured: boolean;
        writable: boolean;
    }>>;
    listLlmOptions(): Promise<{
        providers: {
            id: string;
            models: string[];
        }[];
    }>;
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
