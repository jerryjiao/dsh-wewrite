/**
 * 微信推送编排（F3 / AC-1 / AC-7 / v0.5.6 错误可视化）：从 service 拆出（单文件 <=300 行纪律）。
 *
 * v0.5.6 两处行为变化：
 * 1) 失败不再是异常，而是结构化 `{ok:false, failure}`——分类/errcode/出路提示才有机会到界面；
 * 2) 每次尝试（成功或失败）都落一条推送留痕，关掉 toast 也能复盘。
 * 门禁闸门仍在最前面：article.status 未到 rendered/pushed 即拒绝；成功才回填 mediaId（原子化）。
 */

import { convertArticle } from '../render/convert';
import type { PushDraftResult, PushFailure } from '../shared/contract';
import type { ArticleRecord, ImageRecord } from './domain';
import { recordPushEvent, type PushEventDeps } from './push-events';
import type { KvTable } from './platform';
import { classifyErrcode, extractExitIp, hintForClassification } from './wechat/diagnostics';
import { createWeChatClient, WeChatApiError, type DiagnoseResult, type WeChatClientDeps } from './wechat/client';

export interface WeChatFlowDeps {
  readonly articles: KvTable<ArticleRecord>;
  readonly images: KvTable<ImageRecord>;
  readonly clientDeps: WeChatClientDeps;
  readonly refreshSecret: () => Promise<void>;
  readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly now: () => Date;
  /** 推送留痕表（成功与失败都写）。 */
  readonly events: PushEventDeps;
}

/** 微信侧异常 → 结构化失败（分类、errcode、出路、出口 IP 全部带上）。 */
function failureFromWeChatError(error: unknown): PushFailure {
  if (error instanceof WeChatApiError) {
    const exitIp = error.classification === 'IP_WHITELIST' ? extractExitIp(error.message) : undefined;
    const hint = error.hint ?? hintForClassification(error.classification, exitIp);
    return {
      reason: 'wechat-api',
      message: error.message,
      hint,
      errcode: error.errcode,
      classification: error.classification,
      ...(exitIp ? { egressIp: exitIp } : {}),
      ...(error.classification === 'IP_WHITELIST' ? { settingsTarget: 'proxy' as const } : {}),
      ...(error.classification === 'AUTH' ? { settingsTarget: 'wechat' as const } : {}),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { reason: 'wechat-api', message, hint: '重试一次；持续失败请把这句话发给插件作者排查。' };
}

export async function pushArticleDraft(deps: WeChatFlowDeps, articleId: string): Promise<PushDraftResult> {
  const startedAt = deps.now().getTime();
  const article = deps.articles.get(articleId);
  if (!article) {
    return { ok: false, failure: { reason: 'article-not-found', message: `文章不存在：${articleId}` } };
  }

  const settle = async (failure: PushFailure): Promise<PushDraftResult> => {
    await recordPushEvent(deps.events, {
      articleId,
      articleTitle: article.title,
      ok: false,
      durationMs: deps.now().getTime() - startedAt,
      message: failure.message,
      reason: failure.reason,
      ...(typeof failure.errcode === 'number' ? { errcode: failure.errcode } : {}),
      ...(failure.classification ? { classification: failure.classification } : {}),
    });
    return { ok: false, failure };
  };

  if (article.status === 'editing' || article.status === 'failed') {
    return settle({
      reason: 'gates-not-passed',
      message: '质量门禁未过：这篇稿还没通过管线门禁。',
      hint: '回到写作台重新生成一版（管线跑完门禁才会放行），或在预览里确认后重跑。',
    });
  }
  if (!article.coverImageId) {
    return settle({
      reason: 'cover-missing',
      message: '缺少封面图：微信草稿必须带封面。',
      hint: '在编辑器顶部「封面」处点「生成封面」或「上传封面」，补上再推。',
      settingsTarget: 'image',
    });
  }
  const cover = deps.images.get(article.coverImageId);
  if (!cover) {
    return settle({
      reason: 'cover-missing',
      message: '封面图记录丢失：这篇文章绑定的封面已经不在本地存储里。',
      hint: '在编辑器顶部「封面」处重新生成或上传一张。',
      settingsTarget: 'image',
    });
  }
  const appId = deps.clientDeps.getCredentials().appId;
  await deps.refreshSecret();
  const { secret } = deps.clientDeps.getCredentials();
  if (!appId || !secret) {
    return settle({
      reason: 'no-credentials',
      message: appId ? '公众号 AppSecret 还没配。' : '公众号 AppID / AppSecret 还没配。',
      hint: '到「设置 → 公众号接入」填好并点「连接测试」，通过后回来再推。',
      settingsTarget: 'wechat',
    });
  }

  const bodyImages = article.bodyImageIds
    .map((id) => deps.images.get(id))
    .filter((image): image is ImageRecord => Boolean(image));

  const client = createWeChatClient(deps.clientDeps);
  const html = convertArticle({ markdown: article.markdown, theme: article.theme });
  let result: { mediaId: string; thumbMediaId: string };
  try {
    result = await client.pushDraft({
      title: article.title,
      digest: article.digest,
      contentHtml: html,
      thumbImage: { buffer: Buffer.from(cover.base64, 'base64'), mime: cover.mime },
      contentImages: bodyImages.map((image) => ({ buffer: Buffer.from(image.base64, 'base64'), mime: image.mime })),
    });
  } catch (error) {
    return settle(failureFromWeChatError(error));
  }

  await deps.serialize(async () => {
    const current = deps.articles.get(articleId);
    if (!current) return;
    await deps.articles.put(articleId, {
      ...current,
      status: 'pushed',
      wechatMediaId: result.mediaId,
      thumbMediaId: result.thumbMediaId,
      updatedAt: deps.now().toISOString(),
    });
  });
  await recordPushEvent(deps.events, {
    articleId,
    articleTitle: article.title,
    ok: true,
    durationMs: deps.now().getTime() - startedAt,
    message: `已进草稿箱（media_id ${result.mediaId}）`,
    mediaId: result.mediaId,
  });
  return { ok: true, mediaId: result.mediaId, thumbMediaId: result.thumbMediaId };
}

export async function diagnoseWeChat(deps: Omit<WeChatFlowDeps, 'events'>): Promise<DiagnoseResult> {
  await deps.refreshSecret();
  return createWeChatClient(deps.clientDeps).diagnose();
}

/** 供 classify 复查：把 errcode 归类（诊断与推送共用同一张表）。 */
export { classifyErrcode };
