/**
 * python-markdown 语义的行内解析器（自 @cf-studio/shared-ops/md-html 平移，C2 vendored）。
 * 覆盖：strong/em（无侧翼配对）、行内 code、链接、图片、反斜杠转义、实体透传、nl2br。
 * 与源差异（微信产物安全基线）：内联 HTML 改走受限标签集消毒（script/iframe 转义）；
 * 图片/链接 URL 过 sanitizeUrl，非法 URL 丢弃资源保留文本。
 */

import { escapeAttr, escapeCode, escapeText, sanitizeHtmlTag, sanitizeUrl } from './sanitize';
import type { RenderTheme } from './themes';

export function pythonInlineToHtml(text: string, theme: RenderTheme, breaks = true): string {
  let html = '';
  let rest = text;
  for (let guard = 0; guard < 100_000 && rest; guard += 1) {
    const position = text.length - rest.length;
    const prevChar = position > 0 ? text[position - 1] : '';
    // python-markdown：内容以空白开头时，开符号必须前邻非空白字符
    const allowLeadingSpace = position > 0 && !/[\s*]/.test(prevChar);
    let match: RegExpMatchArray | null;
    if ((match = rest.match(/^\\([\\`*_{}[\]()#+\-.!>~|])/))) {
      html += escapeText(match[1]);
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = rest.match(/^`+/))) {
      const run = match[0];
      const closerMatch = rest.slice(run.length).match(new RegExp(`(?<!\`)${run}(?!\`)`));
      if (closerMatch) {
        const closerIndex = closerMatch.index ?? 0;
        const content = rest.slice(run.length, run.length + closerIndex).trim();
        html += `<code style="${theme.code}">${escapeCode(content)}</code>`;
        rest = rest.slice(run.length + closerIndex + run.length);
        continue;
      }
      html += escapeText(rest[0]);
      rest = rest.slice(1);
      continue;
    }
    if ((match = rest.match(/^(\*\*)([\s\S]+?)\*\*/)) && (allowLeadingSpace || !/^\s/.test(match[2]))) {
      html += `<strong style="${theme.strong}">${pythonInlineToHtml(match[2], theme, breaks)}</strong>`;
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = rest.match(/^\*([^*\n]+?)\*/)) && (allowLeadingSpace || !/^\s/.test(match[1]))) {
      html += `<em style="${theme.em}">${pythonInlineToHtml(match[1], theme, breaks)}</em>`;
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = rest.match(/^!\[([^\]]*)\]\(\s*([^)\s]+)\s*(?:['"]([^)]*)['"]\s*)?\)/))) {
      const url = sanitizeUrl(match[2]);
      if (url === null) {
        // 非法图片 URL：丢弃资源，保留 alt 文本（防属性注入）
        html += escapeText(match[1]);
      } else {
        html += `<img alt="${escapeAttr(match[1])}" src="${escapeAttr(url)}" style="${theme.img}"${
          match[3] ? ` title="${escapeAttr(match[3])}"` : ''
        } />`;
      }
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = rest.match(/^\[([^\]]*)\]\(\s*([^)\s]+)\s*(?:['"]([^)]*)['"]\s*)?\)/))) {
      const url = sanitizeUrl(match[2]);
      const inner = pythonInlineToHtml(match[1], theme, breaks);
      if (url === null) {
        html += inner;
      } else {
        html += `<a href="${escapeAttr(url)}" style="${theme.a}"${
          match[3] ? ` title="${escapeAttr(match[3])}"` : ''
        }>${inner}</a>`;
      }
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = rest.match(/^<\/?[a-zA-Z][^>]*>/))) {
      const sanitized = sanitizeHtmlTag(match[0]);
      html += sanitized ?? escapeText(match[0]);
      rest = rest.slice(match[0].length);
      continue;
    }
    if ((match = rest.match(/^&[a-zA-Z][a-zA-Z0-9]*;|^&#\d+;|^&#x[0-9a-fA-F]+;/))) {
      html += match[0];
      rest = rest.slice(match[0].length);
      continue;
    }
    const textRun = rest.match(/^[^\\`*[!<&]+/);
    const chunkSource = textRun ? textRun[0] : rest[0];
    const chunk = breaks ? escapeText(chunkSource).replace(/\n/g, '<br />\n') : escapeText(chunkSource);
    html += chunk;
    rest = rest.slice(chunkSource.length);
  }
  return html;
}

/** python-markdown 剥段落每行的前导与行尾空白。 */
export function stripParagraphLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''))
    .join('\n');
}
