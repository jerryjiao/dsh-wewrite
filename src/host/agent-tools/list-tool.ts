/**
 * wewrite_list_articles（Spec §5 / architecture §4.2）：文章轻量清单，供模型选择 article_id。
 * AC-M1-04：轻投影——不含 markdown 全文、不含任何凭据命名字段（ArticleListItem 本身即轻面）。
 * canonical value 包成 {articles:[...]}（object-root，契约修正：宿主 createSuccessResult 按
 * output.schema 校验 canonical value，裸数组会被拒成 D2 降级）。不提供 presentCall/presentResult
 * （默认 generic 呈现，raw 结果即列表文本）。
 */

import type { ToolRunContext, WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
import { asArgsRecord, jsonSchema, textBlocks, toolError } from './output-helpers';

const LIMIT_DEFAULT = 10;
const LIMIT_MAX = 100;

export function buildListTool(service: WeWriteService): WewriteToolDefinition {
  return {
    name: 'wewrite_list_articles',
    description: '查询 WeWrite 文章库的轻量清单（id、标题、状态、摘要、更新时间），用于选择 article_id 做后续推送或引用。不返回全文。',
    timeoutMs: 15000,
    parameters: {
      limit: { type: 'integer', description: `返回条数（1-${LIMIT_MAX}，默认 ${LIMIT_DEFAULT}，按更新时间新→旧）` },
    },
    output: {
      schema: jsonSchema({ articles: { type: 'array' } }, ['articles']),
      render: (_args, value) => {
        const articles = asArgsRecord(value).articles;
        return textBlocks(listToText(Array.isArray(articles) ? articles : []));
      },
    },
    async execute(args: unknown, _exec: ToolRunContext) {
      const rawLimit = asArgsRecord(args).limit ?? LIMIT_DEFAULT;
      if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > LIMIT_MAX) {
        return toolError('limit-invalid', `limit 必须是 1-${LIMIT_MAX} 的整数（缺省 ${LIMIT_DEFAULT}）`);
      }
      const articles = service.listArticles().slice(0, rawLimit).map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        digest: item.digest,
        status: item.status,
        updatedAt: item.updatedAt,
      }));
      return { articles };
    },
  };
}

function listToText(articles: readonly unknown[]): string {
  const lines = articles.map((item) => {
    const record = asArgsRecord(item);
    return `- [${String(record.status ?? '')}] ${String(record.title ?? '')}（id: ${String(record.id ?? '')}，更新于 ${String(record.updatedAt ?? '')}）`;
  });
  return lines.length > 0 ? lines.join('\n') : '（暂无文章）';
}
