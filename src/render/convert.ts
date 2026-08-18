/**
 * convertArticle：Markdown → 微信编辑器可粘贴 HTML（预览 = 产物一致性，AC-8）。
 * 纯函数、确定性（同输入字节级同输出）。产物契约：无 style/link 块、无 h1、样式全内联。
 * 自 @cf-studio/shared-ops/md-html 平移（C2 vendored，禁 import workspace 包）。
 */

import { renderMarkdownBody } from './blocks';
import { resolveTheme } from './themes';

/** CJK 与 ASCII 字符之间插入空格（两遍：ASCII 在前 / CJK 在前）。 */
export function cjkSpacing(text: string): string {
  return text
    .replace(/([A-Za-z0-9])([^\x00-\x7f])/g, '$1 $2')
    .replace(/([^\x00-\x7f])([A-Za-z0-9])/g, '$1 $2');
}

/** 移除旧稿编辑锚点（HTML 注释块与整行两种形态；emoji 以转义书写，源码不落字面）。 */
export function stripInternalMarkers(text: string): string {
  return text
    .replace(/<!--\s*\u270F\uFE0F\s*编辑(?:建议|提醒)[\s\S]*?-->/g, '')
    .replace(/^.*\u270F\uFE0F\s*编辑(?:建议|提醒).*$/gm, '');
}

export interface ConvertInput {
  readonly markdown: string;
  readonly theme?: string;
}

/** 完整转换：清内部标记 → 渲染（内联样式 + 主题）→ CJK 间距 → 组装根容器。 */
export function convertArticle(input: ConvertInput): string {
  const theme = resolveTheme(input.theme);
  const processed = stripInternalMarkers(input.markdown ?? '');
  const bodyHtml = cjkSpacing(renderMarkdownBody(processed, theme).replace(/\n+$/, ''));
  return `<section style="${theme.section}">\n${bodyHtml}\n</section>`;
}
