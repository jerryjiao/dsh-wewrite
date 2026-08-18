/**
 * 块级渲染（自 @cf-studio/shared-ops/md-html 平移，C2 vendored）。
 * 与源差异（微信产物形状契约，AC-8）：h1 降级 h2（标题由发布字段承载）、样式全内联、
 * 原始 HTML 走受限标签集消毒。分词器仍用 marked（gfm + breaks）。
 */
import type { RenderTheme } from './themes';
/** Markdown → 微信正文 HTML 片段（管道哨兵处理 + 分词 + 修复链 + 渲染）。 */
export declare function renderMarkdownBody(markdownText: string, theme: RenderTheme): string;
