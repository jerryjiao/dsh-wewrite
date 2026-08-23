/** WeWriteService（架构 §3）：host 级唯一服务；写操作串行化。重活已拆 images/wechat-flow/articles-store/schedules-store/views。 */

import { CONTRACT_VERSION, type ArticleDetail, type ArticleListItem, type ConfigView, type HotspotDigestItem, type HotspotItem, type HotspotItemDigest, type RunParams, type RunSummary, type ScheduleViewModel, type SnapshotResponse } from '../shared/contract';
import { CREDENTIAL_REFS, DEFAULT_IMAGE_PROVIDER_CHAIN } from '../shared/image-provider-ids';
import { convertArticle } from '../render/convert';
import { SettingsRecordSchema } from './domain';
import { rewriteSystemPrompt, rewriteUserPrompt, streamLlmText, type PipelineLlm } from './pipeline/llm';
import { digestHotspotItem as runHotspotDigest } from './hotspot-digest';
import { createPipelineEngine, pruneTerminalRuns, type PipelineEngine, type RunStore } from './pipeline/engine';
import { aggregateHotspots, buildHotspotSources } from './pipeline/steps/topic';
import { qualityGatesRunner } from './pipeline/steps/gates';
import { resolveLogger, type CredentialsService, type HostLogger, type LlmService, type StorageDomainHandle } from './platform';
import { createSchedulerService } from './scheduler/service';
import { createDomainRunStore, openTables, parseGlobalState, type DomainTables, type GlobalState } from './store';
import { createImagesGenerator } from './images';
import { ArticleStore } from './articles-store';
import { ScheduleStore } from './schedules-store';
import { diagnoseWeChat, pushArticleDraft, type WeChatFlowDeps } from './wechat-flow';
import { truncateMessage } from './redaction';
import { buildConfigView, runToSummary, scheduleToView } from './views';
import { toServiceError, WewriteServiceError } from './service-errors';
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
}

/** 热榜逐条速览与 AI 改写的单次 LLM 调用上限（uiux v0.3 拍板各 45s）。 */
const HOTSPOT_DIGEST_TIMEOUT_MS = 45_000;
const REWRITE_TIMEOUT_MS = 45_000;

export class WeWriteService {
  private readonly tables: DomainTables;
  private readonly runStore: RunStore;
  private readonly engine: PipelineEngine;
  private readonly logger: HostLogger;
  private readonly nowFn: () => Date;
  private state: GlobalState;
  private operationTail: Promise<unknown> = Promise.resolve();
  private wechatSecret = '';
  private readonly articles: ArticleStore;
  private readonly schedules: ScheduleStore;
  private readonly scheduler: ReturnType<typeof createSchedulerService>;

  private constructor(private readonly deps: ServiceDeps) {
    this.tables = openTables(deps.domain);
    this.logger = deps.logger ?? resolveLogger({}, 'dsh-wewrite');
    this.nowFn = deps.now ?? (() => new Date());
    this.state = parseGlobalState(deps.domain.global.get(), this.logger);
    this.runStore = createDomainRunStore(this.tables.runs, this.logger);
    this.articles = new ArticleStore({
      tables: this.tables,
      runStore: this.runStore,
      serialize: <T,>(operation: () => Promise<T>) => this.serialize(operation),
      nowIso: () => this.nowIso(),
      getSettings: () => this.settings,
    });
    this.schedules = new ScheduleStore({
      tables: this.tables,
      serialize: <T,>(operation: () => Promise<T>) => this.serialize(operation),
      nowIso: () => this.nowIso(),
      startRun: (schedule) => this.startRun({ trigger: 'schedule', params: schedule.params, scheduleId: schedule.id }),
    });
    this.engine = createPipelineEngine({
      llm: deps.llm as unknown as import('./pipeline/llm').PipelineLlm,
      store: this.runStore,
      gates: qualityGatesRunner,
      renderer: { convert: ({ markdown, theme }) => convertArticle({ markdown, theme }) },
      topicSource: { fetch: async (limit: number) => [...(await this.fetchHotspots(limit))] },
      images: createImagesGenerator({
        getSettings: () => this.settings,
        resolveCredential: (ref) => Promise.resolve(deps.credentials.resolve(ref)),
        now: this.nowFn,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        persist: async (records) => {
          for (const record of records) await this.tables.images.put(record.id, record);
        },
      }),
      onProduced: ({ markdown, runId }) => this.articles.persistProduced(markdown, runId),
      onImagesBound: ({ articleId, coverImageId, bodyImageIds }) =>
        this.articles.bindImages(articleId, { coverImageId, bodyImageIds }),
      now: this.nowFn,
    });
    this.scheduler = createSchedulerService({
      loadSchedules: async () => [...this.tables.schedules.entries()].map(([, record]) => record),
      saveSchedule: async (record) => this.tables.schedules.put(record.id, record),
      claim: (key) => this.claimOccurrence(key),
      startRun: async (schedule) => this.startRun({ trigger: 'schedule', params: schedule.params, scheduleId: schedule.id }).runId,
      now: this.nowFn,
    });
  }

  static async open(deps: ServiceDeps): Promise<WeWriteService> {
    const service = new WeWriteService(deps);
    await service.persistState();
    const recovered = await service.engine.resumeInterrupted();
    if (recovered > 0) service.logger.warn(`宿主停机打断 ${recovered} 个 run，已标记 interrupted（不自动补偿重跑）`);
    return service;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationTail.then(operation, operation);
    this.operationTail = next.catch(() => undefined);
    return next;
  }

  private async persistState(): Promise<void> {
    await this.deps.domain.global.set(this.state);
  }

  get settings() {
    return this.state.settings;
  }

  private nowIso(): string {
    return this.nowFn().toISOString();
  }

  // ── snapshot / hotspots / runs ─────────────────────────────────────────────

  async snapshot(): Promise<SnapshotResponse> {
    return {
      articles: this.listArticles(),
      runs: this.listRuns(),
      schedules: [...this.tables.schedules.entries()].map(([, record]) => scheduleToView(record)),
      config: await this.getConfig(),
      serverNow: this.nowIso(),
      capabilities: { contractVersion: CONTRACT_VERSION, features: ['scheduler', 'images', 'hotspots', 'gates'] },
    };
  }

  listRuns(): RunSummary[] {
    return this.runStore
      .all()
      .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
      .map(runToSummary);
  }

  async fetchHotspots(limit = 20): Promise<HotspotItem[]> {
    const sources = buildHotspotSources({ aggregatorUrl: this.settings.hotspotAggregatorUrl, fetchImpl: this.deps.fetchImpl });
    const { items, failures } = await aggregateHotspots(sources, limit);
    for (const failure of failures) {
      this.logger.warn(truncateMessage(`热榜源 ${failure.sourceId} 拉取失败：${failure.message}`));
    }
    return [...items];
  }

  /** 热榜逐条 AI 速览（uiux v0.3 §1）：抓原文→抽取→LLM；抓取失败静默降级 title 模式。 */
  async digestHotspotItem(item: HotspotDigestItem): Promise<HotspotItemDigest> {
    return runHotspotDigest(
      {
        llm: this.deps.llm as unknown as PipelineLlm,
        provider: this.state.settings.llmDefault.provider,
        model: this.state.settings.llmDefault.model,
        ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
        logger: this.logger,
        timeoutMs: this.deps.digestTimeoutMs ?? HOTSPOT_DIGEST_TIMEOUT_MS,
        nowIso: () => this.nowIso(),
      },
      item,
    );
  }

  /** AI 改写选中段（uiux v0.3 §3）：只输出改写文本，maxTokens 随原文长度缩放。 */
  async rewriteText(input: { text: string; instruction: string; title?: string }): Promise<{ text: string }> {
    const startedAt = Date.now();
    const { provider, model } = this.state.settings.llmDefault;
    if (!provider || !model) {
      throw new WewriteServiceError('llm-not-configured', '尚未配置默认模型：请先到「设置」里选择 AI 供应商与模型，再改写选中段落');
    }
    const timeoutMs = this.deps.rewriteTimeoutMs ?? REWRITE_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const outcome = await streamLlmText(
        this.deps.llm as unknown as PipelineLlm,
        {
          purpose: 'wewrite-article-rewrite',
          system: rewriteSystemPrompt(),
          user: rewriteUserPrompt(input),
          provider,
          model,
          maxTokens: Math.min(4000, input.text.length * 3 + 500),
        },
        controller.signal,
      );
      if (outcome.status === 'aborted') {
        throw new WewriteServiceError('rewrite-timeout', `AI 改写超时（${Math.round(timeoutMs / 1000)} 秒），已取消，请重试`);
      }
      // rewrite-error 分流：LLM 供应商错误的 code/message 原样透传
      if (outcome.status === 'error') throw new WewriteServiceError(outcome.code, outcome.message);
      if (!outcome.text) throw new WewriteServiceError('rewrite-empty', '模型未返回任何改写内容，请重试');
      this.logger.info(
        `article rewrite ok：model=${model} ${Date.now() - startedAt}ms in=${input.text.length} out=${outcome.text.length}`,
      );
      return { text: outcome.text };
    } catch (error) {
      const code = error instanceof WewriteServiceError ? error.code : 'unknown';
      this.logger.warn(`article rewrite failed（${code}）：${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  startRun(input: { trigger: 'manual' | 'schedule'; params: RunParams; articleId?: string; scheduleId?: string }): { runId: string } {
    // settings.llmDefault 解析进 params.llm（本次显式覆盖优先）——paramsSnapshot 记录实际用的供应商/模型。
    const params: RunParams = { ...input.params, llm: { ...this.state.settings.llmDefault, ...(input.params.llm ?? {}) } };
    const { runId, done } = this.engine.begin({
      trigger: input.trigger,
      params,
      ...(input.articleId ? { articleId: input.articleId } : {}),
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
    });
    void done.catch((error) => {
      const serviceError = toServiceError(error);
      this.logger.error(truncateMessage(`run ${runId} 执行异常（${serviceError.code}）：${serviceError.message}`));
    });
    return { runId };
  }

  cancelRun(runId: string): { ok: boolean } {
    return { ok: this.engine.cancel(runId) };
  }

  // ── articles / schedules（委托 store）─────────────────────────────────────

  listArticles(): ArticleListItem[] {
    return this.articles.list();
  }

  getArticle(id: string): ArticleDetail {
    return this.articles.get(id);
  }

  saveArticle(input: { id?: string; slug: string; title: string; digest: string; markdown: string; theme: string }): Promise<ArticleDetail> {
    return this.articles.save(input);
  }

  deleteArticle(id: string): Promise<{ deleted: boolean }> { return this.articles.delete(id); }

  previewArticle(input: { id: string } | { markdown: string; theme: string }): { html: string } {
    return this.articles.preview(input);
  }

  saveSchedule(input: { id?: string; name: string; rrule: string; timeZone: string; params: RunParams; enabled: boolean }): Promise<ScheduleViewModel> {
    return this.schedules.save(input);
  }

  deleteSchedule(id: string): Promise<{ deleted: boolean }> { return this.schedules.delete(id); }

  toggleSchedule(id: string, enabled: boolean): Promise<ScheduleViewModel> {
    return this.schedules.toggle(id, enabled);
  }

  runScheduleNow(id: string): { runId: string } { return this.schedules.runNow(id); }

  private async claimOccurrence(key: string): Promise<boolean> {
    return this.serialize(async () => {
      if (this.state.claimedOccurrences.includes(key)) return false;
      this.state = { ...this.state, claimedOccurrences: [...this.state.claimedOccurrences, key].slice(-500) };
      await this.persistState();
      return true;
    });
  }

  async getConfig(): Promise<ConfigView> {
    return buildConfigView(this.settings, await this.describeCredentials());
  }

  async setConfig(patch: Record<string, unknown>): Promise<ConfigView> {
    return this.serialize(async () => {
      const parsed = SettingsRecordSchema.safeParse({ ...this.state.settings, ...patch });
      if (!parsed.success) {
        throw new WewriteServiceError('config-invalid', `设置校验失败：${parsed.error.issues[0]?.message ?? '未知问题'}`);
      }
      this.state = { ...this.state, settings: parsed.data };
      await this.persistState();
      return this.getConfig();
    });
  }

  async setCredential(ref: string, value: string): Promise<{ ok: boolean }> {
    await this.deps.credentials.set(ref, value);
    if (ref === CREDENTIAL_REFS.wechatSecret) this.wechatSecret = value;
    return { ok: true };
  }

  async describeCredentials(): Promise<Record<string, { configured: boolean; writable: boolean }>> {
    const refs = [CREDENTIAL_REFS.wechatSecret, ...DEFAULT_IMAGE_PROVIDER_CHAIN.map(CREDENTIAL_REFS.image)];
    const descriptors: Record<string, { configured: boolean; writable: boolean }> = {};
    for (const ref of refs) {
      const raw = await Promise.resolve(this.deps.credentials.describe(ref));
      descriptors[ref] = { configured: raw?.configured ?? false, writable: raw?.writable ?? true };
    }
    return descriptors;
  }

  async listLlmOptions(): Promise<{ providers: { id: string; models: string[] }[] }> {
    // 宿主 listModels 返回 Promise（dsh-llm seam 实测），同步 .map 会炸——归一后再用。
    const rawProviders = await Promise.resolve(this.deps.llm.listProviders?.() ?? []);
    const providers = Array.isArray(rawProviders) ? rawProviders : [];
    const result: { id: string; models: string[] }[] = [];
    for (const entry of providers) {
      const listing = entry as { id?: string; name?: string };
      const id = String(listing?.id ?? listing?.name ?? entry ?? '');
      if (!id) continue;
      const rawModels = await Promise.resolve(this.deps.llm.listModels?.(id) ?? []);
      const models = (Array.isArray(rawModels) ? rawModels : []).map((model) =>
        String((model as { id?: string })?.id ?? model),
      );
      result.push({ id, models });
    }
    return { providers: result };
  }

  // ── wechat / lifecycle ─────────────────────────────────────────────────────

  private weChatFlowDeps(): WeChatFlowDeps {
    return {
      articles: this.tables.articles,
      images: this.tables.images,
      clientDeps: {
        ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
        getCredentials: () => ({ appId: this.settings.wechatAppId, secret: this.wechatSecret }),
        getSettings: () => ({ apiBaseUrl: this.settings.wechatApiBaseUrl, author: this.settings.wechatAuthor }),
      },
      refreshSecret: async () => {
        const resolved = await Promise.resolve(this.deps.credentials.resolve(CREDENTIAL_REFS.wechatSecret));
        this.wechatSecret = resolved ?? '';
      },
      serialize: <T,>(operation: () => Promise<T>) => this.serialize(operation),
      now: this.nowFn,
    };
  }

  async pushArticleDraft(articleId: string): Promise<{ mediaId: string; thumbMediaId: string }> {
    return pushArticleDraft(this.weChatFlowDeps(), articleId);
  }

  async diagnoseWeChat(): Promise<DiagnoseResult> {
    return diagnoseWeChat(this.weChatFlowDeps());
  }

  startScheduler(): void { this.scheduler.start(); }

  async pruneRunHistory(): Promise<void> {
    const kept = pruneTerminalRuns(this.runStore.all(), this.settings.runHistoryLimit);
    const keptIds = new Set(kept.map((run) => run.id));
    for (const run of this.runStore.all()) {
      if (!keptIds.has(run.id)) await this.tables.runs.delete(run.id);
    }
  }

  async dispose(): Promise<void> {
    this.scheduler.stop();
    await this.deps.domain.close().catch(() => undefined);
  }
}
