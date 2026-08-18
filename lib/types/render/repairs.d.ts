/**
 * 块级结构修复（自 @cf-studio/shared-ops/md-html 平移）：python-markdown 兼容层。
 * - mergeAdjacentBlockquotes：空行隔断的相邻引用合并
 * - splitDetachedTails：列表项尾行脱离升级为顶层段落
 * - repairListInterrupts：sane_lists 语义（列表不打断段落）
 */
export interface LooseToken {
    readonly type?: string;
    readonly text?: string;
    readonly raw?: string;
    readonly depth?: number;
    readonly ordered?: boolean;
    readonly start?: number | null;
    readonly task?: boolean;
    readonly checked?: boolean;
    readonly hidden?: boolean;
    readonly items?: LooseToken[];
    readonly tokens?: LooseToken[];
    readonly header?: LooseToken[];
    readonly rows?: LooseToken[][];
    readonly align?: (string | null)[];
}
export declare function mergeAdjacentBlockquotes(tokens: LooseToken[]): LooseToken[];
export declare function splitDetachedTails(tokens: LooseToken[]): LooseToken[];
export declare function repairListInterrupts(tokens: LooseToken[]): LooseToken[];
