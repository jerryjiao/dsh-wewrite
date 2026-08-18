/**
 * 渲染层安全基线：转义 + URL 消毒 + 受限标签集（架构 §3：无 style/link、样式全内联）。
 * markdown 内的原始 HTML 只放行白名单标签与白名单属性；script/iframe 一律转义为文本。
 */
export declare function escapeText(text: string): string;
export declare function escapeAttr(text: string): string;
export declare function escapeCode(text: string): string;
/**
 * URL 消毒：合法返回原串（调用方再做属性转义），非法返回 null（资源被丢弃，保留 alt 文本）。
 * javascript: 伪协议、带引号/尖括号/空白的 URL 一律拒绝。
 */
export declare function sanitizeUrl(rawUrl: string): string | null;
/**
 * 单个标签消毒：白名单内重建（属性白名单 + href/src 过 sanitizeUrl），否则返回 null。
 */
export declare function sanitizeHtmlTag(rawTag: string): string | null;
/** 混合片段消毒：标签逐个过白名单，其余文本全转义。 */
export declare function sanitizeHtmlFragment(text: string): string;
