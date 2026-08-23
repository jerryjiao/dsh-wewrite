import type { ArticleDetail, ArticleListItem } from '@/shared/contract';
import type { InputTriggerCandidateLike, InputTriggerSourceLike } from '../lib/context';
import type { WewriteRpc } from '../lib/rpc';

/**
 * `@` 文章引用源（ctx.inputTriggers，name 'wewrite-articles'，M3 / S11）。
 *
 * - warm：会话 scope 诞生时预拉 article/list（轻投影），候选/lexicon 走内存缓存。
 * - onPick：insert ReferenceInsert {ref=articleId, label=标题, clipboardText='@'+slug}。
 * - codec.serialize（模型可见引用）：标题 + 摘要 + 正文前 N 字（article/get 实时取）。
 *   **失败阻塞发送不静默**（S11：serialize 抛错 → 宿主管线阻止提交，绝不降级成
 *   clipboard 文本）。
 * - D10：register-composer 侧 ctx.inputTriggers 缺失时不注册（手输文字仍可用）。
 */

const REFERENCE_BODY_LIMIT = 800;
const CANDIDATE_LIMIT = 20;

function formatReference(article: ArticleDetail): string {
  const lead = article.digest ? `摘要：${article.digest}` : '';
  const body = article.markdown.slice(0, REFERENCE_BODY_LIMIT);
  const clipped = article.markdown.length > REFERENCE_BODY_LIMIT ? `${body}…` : body;
  return [`《${article.title}》`, lead, `正文节选（${article.markdown.length} 字中前 ${Math.min(article.markdown.length, REFERENCE_BODY_LIMIT)} 字）：`, clipped]
    .filter((line) => line.length > 0)
    .join('\n');
}

export function createWewriteAtSource(rpc: WewriteRpc): InputTriggerSourceLike {
  /** articleId → list item（warm 后可用）。 */
  const articlesById = new Map<string, ArticleListItem>();
  const byTitle = new Map<string, string>();

  const loadArticles = async (): Promise<void> => {
    try {
      const list = await rpc.call<ArticleListItem[]>('article/list', {});
      articlesById.clear();
      byTitle.clear();
      for (const item of list) {
        articlesById.set(item.id, item);
        byTitle.set(item.title, item.id);
      }
    } catch {
      /* 候选面失败静默（列表空=无候选）；模型面 serialize 失败才阻塞（S11 分界）。 */
    }
  };

  const slugOf = (ref: string): string | undefined => articlesById.get(ref)?.slug;

  return {
    trigger: '@',
    name: 'wewrite-articles',
    order: 50,

    warm() {
      void loadArticles();
    },

    async candidates(_session, request) {
      if (articlesById.size === 0) await loadArticles();
      const query = request.query.trim().toLowerCase();
      const items = [...articlesById.values()]
        .filter((item) => !query || item.title.toLowerCase().includes(query) || item.slug.toLowerCase().includes(query))
        .slice(0, CANDIDATE_LIMIT)
        .map((item): InputTriggerCandidateLike => ({ name: item.title, description: item.slug, icon: 'file-text', hint: item.status }));
      return items;
    },

    onPick(pick) {
      const articleId = byTitle.get(pick.candidate.name) ?? (articlesById.has(pick.candidate.name) ? pick.candidate.name : undefined);
      if (!articleId) return undefined; // miss → 默认 sink（@ 其他来源继续裁决）
      const item = articlesById.get(articleId) as ArticleListItem;
      return {
        insert: {
          source: 'wewrite-articles',
          ref: articleId,
          label: item.title,
          clipboardText: `@${item.slug}`,
        },
      };
    },

    codec: {
      clipboardText(ref: string) {
        return `@${slugOf(ref) ?? 'article'}`;
      },
      async serialize(ref: string, signal: AbortSignal) {
        // S11：article/get 失败 → 抛错阻塞发送（不静默降级为 clipboard 文本）。
        const article = await rpc.call<ArticleDetail>('article/get', { id: ref }, signal);
        return formatReference(article);
      },
    },
  };
}
