/**
 * 文章存取（service 拆分，单文件 <=300 行纪律）：
 * CRUD + 预览 + 管线产物落库（persistProduced）。写操作经注入的 serialize 串行化。
 */
import type { ArticleDetail, ArticleListItem, RunParams } from '../shared/contract';
import { type SettingsRecord } from './domain';
import type { DomainTables } from './store';
import type { RunStore } from './pipeline/engine';
export interface ArticleStoreDeps {
    readonly tables: DomainTables;
    readonly runStore: RunStore;
    readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
    readonly nowIso: () => string;
    readonly getSettings: () => SettingsRecord;
}
export declare class ArticleStore {
    private readonly deps;
    constructor(deps: ArticleStoreDeps);
    list(): ArticleListItem[];
    get(id: string): ArticleDetail;
    save(input: {
        id?: string;
        slug: string;
        title: string;
        digest: string;
        markdown: string;
        theme: string;
    }): Promise<ArticleDetail>;
    delete(id: string): Promise<{
        deleted: boolean;
    }>;
    preview(input: {
        id: string;
    } | {
        markdown: string;
        theme: string;
    }): {
        html: string;
    };
    /** 管线渲染完成后落库：绑定 articleId 则更新，否则按成稿新建（slug/标题/摘要推导）。返回文章 id。 */
    persistProduced(markdown: string, runId: string): Promise<string>;
    /** images 步产物回绑（P0-1）：封面/正文图 id 写回文章记录——推送核心流的绑定链。 */
    bindImages(articleId: string, bound: {
        readonly coverImageId?: string;
        readonly bodyImageIds: readonly string[];
    }): Promise<void>;
}
export type { RunParams };
