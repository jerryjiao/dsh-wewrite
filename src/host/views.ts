/**
 * 记录 → 视图映射（contract.ts 视图 schema 的唯一组装点）。
 * 响应面严格对齐 strict schema：不携带 schema 外字段（credentials 描述符剥 source）。
 */

import type { ArticleDetail, ArticleListItem, ConfigView, CredentialsDescriptor, RunDetail, RunSummary, ScheduleViewModel } from '../shared/contract';
import type { ArticleRecord, RunRecord, ScheduleRecord, SettingsRecord } from './domain';

export function articleToListItem(record: ArticleRecord): ArticleListItem {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    digest: record.digest,
    status: record.status,
    updatedAt: record.updatedAt,
  };
}

export function articleToDetail(record: ArticleRecord): ArticleDetail {
  return {
    ...articleToListItem(record),
    v: record.v,
    markdown: record.markdown,
    theme: record.theme,
    bodyImageIds: record.bodyImageIds,
    ...(record.coverImageId ? { coverImageId: record.coverImageId } : {}),
    ...(record.createdAt ? { createdAt: record.createdAt } : {}),
    ...(record.wechatMediaId ? { wechatMediaId: record.wechatMediaId } : {}),
    ...(record.thumbMediaId ? { thumbMediaId: record.thumbMediaId } : {}),
    ...(record.lastRunId ? { lastRunId: record.lastRunId } : {}),
  };
}

export function runToSummary(record: RunRecord): RunSummary {
  return {
    id: record.id,
    trigger: record.trigger,
    ...(record.scheduleId ? { scheduleId: record.scheduleId } : {}),
    ...(record.articleId ? { articleId: record.articleId } : {}),
    status: record.status,
    startedAt: record.startedAt,
    ...(record.finishedAt ? { finishedAt: record.finishedAt } : {}),
    ...(record.error ? { error: { code: record.error.code, message: record.error.message } } : {}),
  };
}

/** chat-integration M2：run 详情投影（RunSummary + steps + topic；run/detail RPC 响应形状）。 */
export function runToDetail(record: RunRecord): RunDetail {
  return {
    ...runToSummary(record),
    topic: record.paramsSnapshot.topic ?? '',
    steps: record.steps.map((step) => ({
      name: step.name,
      status: step.status,
      ...(step.startedAt ? { startedAt: step.startedAt } : {}),
      ...(step.finishedAt ? { finishedAt: step.finishedAt } : {}),
      ...(step.error ? { error: { code: step.error.code, message: step.error.message } } : {}),
      ...(step.metrics ? { metrics: step.metrics } : {}),
    })),
  };
}

export function scheduleToView(record: ScheduleRecord): ScheduleViewModel {
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
    ...(record.lastRunAt ? { lastRunAt: record.lastRunAt } : {}),
  };
}

export function buildConfigView(
  settings: SettingsRecord,
  credentials: Readonly<Record<string, CredentialDescriptorInput>>,
): ConfigView {
  const descriptors: Record<string, CredentialsDescriptor> = {};
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
      hotspotAggregatorUrl: settings.hotspotAggregatorUrl,
    },
    credentials: descriptors,
    imageProviders: settings.imageProviders.map((entry) => ({
      providerId: entry.providerId,
      ...(entry.model ? { model: entry.model } : {}),
      ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
      credentialRef: entry.credentialRef,
    })),
  };
}

export interface CredentialDescriptorInput {
  readonly configured: boolean;
  readonly writable: boolean;
}
