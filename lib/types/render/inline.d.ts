/**
 * python-markdown 语义的行内解析器（自 @cf-studio/shared-ops/md-html 平移，C2 vendored）。
 * 覆盖：strong/em（无侧翼配对）、行内 code、链接、图片、反斜杠转义、实体透传、nl2br。
 * 与源差异（微信产物安全基线）：内联 HTML 改走受限标签集消毒（script/iframe 转义）；
 * 图片/链接 URL 过 sanitizeUrl，非法 URL 丢弃资源保留文本。
 */
import type { RenderTheme } from './themes';
export declare function pythonInlineToHtml(text: string, theme: RenderTheme, breaks?: boolean): string;
/** python-markdown 剥段落每行的前导与行尾空白。 */
export declare function stripParagraphLines(text: string): string;
