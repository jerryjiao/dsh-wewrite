/**
 * 微信推送编排（F3 / AC-1 / AC-7）：从 service 拆出（单文件 <=300 行纪律）。
 * 门禁闸门：article.status 未到 rendered/pushed 即拒绝；成功才回填 mediaId（原子化）。
 */
import type { ArticleRecord, ImageRecord } from './domain';
import type { KvTable } from './platform';
import { type DiagnoseResult, type WeChatClientDeps } from './wechat/client';
export interface WeChatFlowDeps {
    readonly articles: KvTable<ArticleRecord>;
    readonly images: KvTable<ImageRecord>;
    readonly clientDeps: WeChatClientDeps;
    readonly refreshSecret: () => Promise<void>;
    readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
    readonly now: () => Date;
}
export declare function pushArticleDraft(deps: WeChatFlowDeps, articleId: string): Promise<{
    mediaId: string;
    thumbMediaId: string;
}>;
export declare function diagnoseWeChat(deps: WeChatFlowDeps): Promise<DiagnoseResult>;
