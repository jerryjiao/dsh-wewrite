/**
 * wewrite_list_articles（Spec §5 / architecture §4.2）：文章轻量清单，供模型选择 article_id。
 * AC-M1-04：轻投影——不含 markdown 全文、不含任何凭据命名字段（ArticleListItem 本身即轻面）。
 * canonical value 包成 {articles:[...]}（object-root，契约修正：宿主 createSuccessResult 按
 * output.schema 校验 canonical value，裸数组会被拒成 D2 降级）。不提供 presentCall/presentResult
 * （默认 generic 呈现，raw 结果即列表文本）。
 */
import type { WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
export declare function buildListTool(service: WeWriteService): WewriteToolDefinition;
