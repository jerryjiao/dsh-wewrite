/**
 * 微信推送编排（F3 / AC-1 / AC-7）：从 service 拆出（单文件 <=300 行纪律）。
 * 门禁闸门：article.status 未到 rendered/pushed 即拒绝；成功才回填 mediaId（原子化）。
 */

import { convertArticle } from '../render/convert';
import type { ArticleRecord, ImageRecord } from './domain';
import { WewriteServiceError } from './service-errors';
import type { KvTable } from './platform';
import { createWeChatClient, type DiagnoseResult, type WeChatClientDeps } from './wechat/client';

export interface WeChatFlowDeps {
  readonly articles: KvTable<ArticleRecord>;
  readonly images: KvTable<ImageRecord>;
  readonly clientDeps: WeChatClientDeps;
  readonly refreshSecret: () => Promise<void>;
  readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly now: () => Date;
}

export async function pushArticleDraft(deps: WeChatFlowDeps, articleId: string): Promise<{ mediaId: string; thumbMediaId: string }> {
  const article = deps.articles.get(articleId);
  if (!article) throw new WewriteServiceError('article-not-found', `文章不存在：${articleId}`);
  if (article.status === 'editing' || article.status === 'failed') {
    throw new WewriteServiceError('gates-not-passed', '质量门禁未过：该文章尚未通过管线门禁，完成管线或修改后再推送');
  }
  if (!article.coverImageId) throw new WewriteServiceError('cover-missing', '缺少封面图：先运行配图步或绑定封面');
  const cover = deps.images.get(article.coverImageId);
  if (!cover) throw new WewriteServiceError('cover-missing', '封面图记录缺失');
  const bodyImages = article.bodyImageIds
    .map((id) => deps.images.get(id))
    .filter((image): image is ImageRecord => Boolean(image));

  await deps.refreshSecret();
  const client = createWeChatClient(deps.clientDeps);
  const html = convertArticle({ markdown: article.markdown, theme: article.theme });
  const result = await client.pushDraft({
    title: article.title,
    digest: article.digest,
    contentHtml: html,
    thumbImage: { buffer: Buffer.from(cover.base64, 'base64'), mime: cover.mime },
    contentImages: bodyImages.map((image) => ({ buffer: Buffer.from(image.base64, 'base64'), mime: image.mime })),
  });
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
  return result;
}

export async function diagnoseWeChat(deps: WeChatFlowDeps): Promise<DiagnoseResult> {
  await deps.refreshSecret();
  return createWeChatClient(deps.clientDeps).diagnose();
}
