/**
 * 排版主题（架构 §3 render：内联样式 + 主题）。
 * 微信正文禁 style 块——主题以「标签 → 内联 style 串」形态注入渲染层。
 * P0 视觉门禁：纯色平涂，无渐变；无紫粉禁色。
 */
export interface RenderTheme {
    readonly id: string;
    readonly section: string;
    readonly p: string;
    readonly h2: string;
    readonly h3: string;
    readonly strong: string;
    readonly em: string;
    readonly a: string;
    readonly code: string;
    readonly pre: string;
    readonly preCode: string;
    readonly blockquote: string;
    readonly table: string;
    readonly th: string;
    readonly td: string;
    readonly ul: string;
    readonly ol: string;
    readonly li: string;
    readonly hr: string;
    readonly img: string;
}
export declare const DEFAULT_THEME_ID = "professional-clean";
/** 未知主题回落默认（接受任意 theme 字符串，产物恒合法）。 */
export declare function resolveTheme(themeId: string | undefined): RenderTheme;
