/**
 * 封面补位（v0.5.6）：封面是推草稿箱的硬门槛，管线没产出来时必须能在应用内补上。
 * 两条补法：① 让图片供应商再生成一张（只生成封面，不额外产正文图）；② 用户自己上传一张。
 * 从 service 拆出（单文件 <=300 行纪律）；不碰微信接口，纯本地图片与文章绑定。
 */

import { randomUUID } from 'node:crypto';
import type { ArticleDetail } from '../shared/contract';
import type { ArticleRecord, ImageRecord } from './domain';
import type { KvTable } from './platform';
import { WewriteServiceError } from './service-errors';

/** 单张封面 base64 上限（与 ImageRecord 一致：10MiB 字符）。 */
const COVER_BASE64_MAX_CHARS = 10 * 1024 * 1024;

export interface CoverDeps {
  readonly articles: KvTable<ArticleRecord>;
  readonly images: KvTable<ImageRecord>;
  /** 图片生成入口：count=0 表示只产封面（正文图数量为 0）。 */
  readonly generateImages: (input: { count: number; articleId: string }) => Promise<{
    readonly coverImageId?: string;
    readonly bodyImageIds: readonly string[];
  }>;
  readonly bindImages: (articleId: string, bound: { readonly coverImageId?: string; readonly bodyImageIds: readonly string[] }) => Promise<void>;
  readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly now: () => Date;
}

function requireArticle(deps: CoverDeps, articleId: string): ArticleRecord {
  const article = deps.articles.get(articleId);
  if (!article) throw new WewriteServiceError('article-not-found', `文章不存在：${articleId}`);
  return article;
}

/** 生成一张封面并绑定到文章（失败时抛出可读原因，界面据此提示去配图片供应商）。 */
export async function generateCover(deps: CoverDeps, articleId: string): Promise<ArticleRecord> {
  requireArticle(deps, articleId);
  let produced: { readonly coverImageId?: string; readonly bodyImageIds: readonly string[] };
  try {
    produced = await deps.generateImages({ count: 0, articleId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WewriteServiceError('cover-generate-failed', `封面生成失败：${message}。可在「设置 → 图片供应商」检查 Key，或改用上传封面。`);
  }
  if (!produced.coverImageId) {
    throw new WewriteServiceError('cover-generate-failed', '图片供应商没有返回封面，可改用上传封面。');
  }
  await deps.bindImages(articleId, { coverImageId: produced.coverImageId, bodyImageIds: produced.bodyImageIds });
  return requireArticle(deps, articleId);
}

/** 绑定用户上传的封面（base64 落图库，标注 provider=manual 便于分辨来源）。 */
export async function bindUploadedCover(
  deps: CoverDeps,
  input: { articleId: string; base64: string; mime: string },
): Promise<ArticleRecord> {
  requireArticle(deps, input.articleId);
  const base64 = input.base64.replace(/^data:image\/[a-z+]+;base64,/i, '');
  if (!base64) throw new WewriteServiceError('cover-invalid', '上传的封面是空文件。');
  if (base64.length > COVER_BASE64_MAX_CHARS) {
    throw new WewriteServiceError('cover-invalid', '封面超过 10MB，请压缩后再传。');
  }
  const record: ImageRecord = {
    v: 1,
    id: `img_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    articleId: input.articleId,
    kind: 'cover',
    mime: input.mime,
    base64,
    provider: 'manual',
    model: 'upload',
    prompt: '用户上传封面',
    createdAt: deps.now().toISOString(),
  };
  await deps.serialize(async () => {
    await deps.images.put(record.id, record);
  });
  await deps.bindImages(input.articleId, { coverImageId: record.id, bodyImageIds: [] });
  return requireArticle(deps, input.articleId);
}

/** 读当前封面用于缩略图展示（base64 原样回，界面自行拼 data URL）。 */
export function readCoverPreview(
  deps: Pick<CoverDeps, 'articles' | 'images'>,
  articleId: string,
): { base64: string; mime: string; bytes: number } {
  const article = deps.articles.get(articleId);
  if (!article) throw new WewriteServiceError('article-not-found', `文章不存在：${articleId}`);
  if (!article.coverImageId) throw new WewriteServiceError('cover-missing', '这篇文章还没有封面。');
  const image = deps.images.get(article.coverImageId);
  if (!image) throw new WewriteServiceError('cover-missing', '封面图记录已经不在本地存储里。');
  const bytes = Math.floor((image.base64.length * 3) / 4);
  return { base64: image.base64, mime: image.mime, bytes };
}

/** 文章详情（service 层的返回形状；封面动作统一回整篇）。 */
export type CoverArticle = ArticleDetail;
