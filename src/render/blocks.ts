/**
 * 块级渲染（自 @cf-studio/shared-ops/md-html 平移，C2 vendored）。
 * 与源差异（微信产物形状契约，AC-8）：h1 降级 h2（标题由发布字段承载）、样式全内联、
 * 原始 HTML 走受限标签集消毒。分词器仍用 marked（gfm + breaks）。
 */

import { marked } from 'marked';
import { pythonInlineToHtml, stripParagraphLines } from './inline';
import { escapeCode, escapeText, sanitizeHtmlFragment } from './sanitize';
import { mergeAdjacentBlockquotes, repairListInterrupts, splitDetachedTails, type LooseToken } from './repairs';
import type { RenderTheme } from './themes';

const PIPE_SENTINEL = '\uE000';
const ALIGN_STYLE: Readonly<Record<string, string>> = {
  left: 'text-align: left;',
  center: 'text-align: center;',
  right: 'text-align: right;',
};

function renderCodeBlock(token: LooseToken, theme: RenderTheme): string {
  const raw = token.text ?? '';
  const code = raw.endsWith('\n') ? raw : `${raw}\n`;
  const cleaned = code.replace(/[ \t]+\n/g, '\n');
  return `<pre style="${theme.pre}"><code style="${theme.preCode}">${escapeCode(cleaned)}</code></pre>\n`;
}

/** h1 降级：微信正文禁 h1，一级标题渲染为 h2；更深层级沿用 h3 形态。 */
function renderHeading(token: LooseToken, theme: RenderTheme): string {
  const depth = token.depth ?? 1;
  const level = depth <= 2 ? 2 : 3;
  const style = level === 2 ? theme.h2 : theme.h3;
  return `<h${level} style="${style}">${pythonInlineToHtml(token.text ?? '', theme)}</h${level}>`;
}

function renderBlock(token: LooseToken, theme: RenderTheme): string {
  switch (token.type) {
    case 'paragraph':
      return `<p style="${theme.p}">${pythonInlineToHtml(stripParagraphLines(token.text ?? ''), theme)}</p>`;
    case 'heading':
      return renderHeading(token, theme);
    case 'text':
      return pythonInlineToHtml(token.text ?? '', theme);
    case 'code':
      return renderCodeBlock(token, theme);
    case 'blockquote': {
      if ((token.tokens ?? []).some((child) => child.type === 'code')) {
        const groups: LooseToken[][] = [];
        let current: LooseToken[] = [];
        for (const child of token.tokens ?? []) {
          if (child.type === 'space') {
            if (current.length) groups.push(current);
            current = [];
            continue;
          }
          current.push(child);
        }
        if (current.length) groups.push(current);
        const paragraphs = groups
          .map((group) =>
            group
              .map((child) => {
                if (child.type === 'code') return (child.raw ?? '').replace(/\n```/, '```');
                return (child.raw ?? child.text ?? '').replace(/\n+$/, '');
              })
              .join('\n'),
          )
          .map((text) => `<p style="${theme.p}">${pythonInlineToHtml(text, theme)}</p>`);
        return `<blockquote style="${theme.blockquote}">\n${paragraphs.join('\n')}\n</blockquote>`;
      }
      const inner = renderBlocks(token.tokens ?? [], theme).join('\n');
      return `<blockquote style="${theme.blockquote}">\n${inner}\n</blockquote>`;
    }
    case 'hr':
      return `<hr style="${theme.hr}" />`;
    case 'list':
      return renderList(token, theme);
    case 'table':
      return renderTable(token, theme);
    case 'html':
      return sanitizeHtmlFragment(token.text ?? '');
    case 'space':
      return '';
    default:
      return escapeText(token.raw ?? '');
  }
}

function renderBlocks(tokens: LooseToken[], theme: RenderTheme): string[] {
  return tokens.map((token) => renderBlock(token, theme)).filter((block) => block !== '');
}

function renderList(token: LooseToken, theme: RenderTheme): string {
  const tag = token.ordered ? 'ol' : 'ul';
  const startAttr =
    token.ordered && token.start != null && token.start !== 1 ? ` start="${token.start}"` : '';
  const items = (token.items ?? []).map((item, itemIndex, items) => {
    const prevRaw = itemIndex > 0 ? items[itemIndex - 1].raw ?? '' : '';
    const hasBlankAfterPrev = /\n[ \t]*\n[ \t]*$/.test(prevRaw);
    const hasBlankAfterSelf = /\n[ \t]*\n[ \t]*$/.test(item.raw ?? '');
    const loose = hasBlankAfterPrev || hasBlankAfterSelf;
    const inlineFence = (child: LooseToken): string =>
      (child.raw ?? '').replace(/^[ \t]+(?=```)/, '').replace(/\n```/, '```');
    const itemFirstNewline = (item.raw ?? '').indexOf('\n');
    const itemRest = itemFirstNewline === -1 ? '' : (item.raw ?? '').slice(itemFirstNewline + 1);
    const hasShallowSublist = /^[ \t]{1,3}(?:[-*+]|\d+[.)]) /m.test(itemRest);
    if (loose) {
      const hasNested = (item.tokens ?? []).some(
        (child) => (child.type === 'list' && !hasShallowSublist) || child.type === 'blockquote',
      );
      if (!hasNested) {
        const rawLines = (item.raw ?? '').replace(/\n+$/, '').split('\n');
        const firstLine = rawLines[0].replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/, '');
        const restLines = rawLines.slice(1);
        const paragraphGroups: string[][] = [];
        let group = [firstLine];
        for (const line of restLines) {
          if (!line.trim()) {
            paragraphGroups.push(group);
            group = [];
            continue;
          }
          group.push(line);
        }
        paragraphGroups.push(group);
        const paragraphs = paragraphGroups
          .filter((lines) => lines.length)
          .map((lines) => lines.map((line) => line.replace(/[ \t]+$/, '').replace(/^[ \t]+(?=```)/, '')).join('\n'))
          .map((text) => `<p style="${theme.p}">${pythonInlineToHtml(text, theme)}</p>`);
        return `<li style="${theme.li}">\n${paragraphs.join('\n')}\n</li>`;
      }
      const blocks = (item.tokens ?? [])
        .filter((child) => !child.hidden && child.type !== 'space')
        .map((child) => {
          if (child.type === 'code') return `<p style="${theme.p}">${pythonInlineToHtml(inlineFence(child), theme)}</p>`;
          if (child.type === 'text' || child.type === 'paragraph') {
            return `<p style="${theme.p}">${pythonInlineToHtml((child.text ?? '').replace(/\n+$/, ''), theme)}</p>`;
          }
          return renderBlock(child, theme);
        })
        .filter((part) => part !== '');
      return `<li style="${theme.li}">\n${blocks.join('\n')}\n</li>`;
    }
    const innerTokens = item.tokens ?? [];
    const taskPrefix = item.task ? `[${item.checked ? 'x' : ' '}] ` : '';
    const textParts: string[] = [];
    const nestedBlocks: LooseToken[] = [];
    for (const child of innerTokens) {
      if ((child.type === 'text' || child.type === 'paragraph') && !child.hidden) {
        textParts.push(child.text ?? '');
      } else if (child.type === 'code') {
        textParts.push(inlineFence(child));
      } else if (child.type === 'list' && !hasShallowSublist) nestedBlocks.push(child);
      else if (child.type === 'blockquote') nestedBlocks.push(child);
    }
    let leadText = textParts.join('\n');
    if (!nestedBlocks.length && textParts.length) {
      const raw = (item.raw ?? '').replace(/\n+$/, '');
      let firstLine = raw.split('\n', 1)[0].replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/, '');
      if (item.task) firstLine = firstLine.replace(/^\[[ xX]\][ \t]+/, '');
      const newlineIndex = raw.indexOf('\n');
      const restLines = newlineIndex === -1 ? [] : raw.slice(newlineIndex + 1).split('\n');
      const allLines = [firstLine, ...restLines].map((line) =>
        line.replace(/[ \t]+$/, '').replace(/^[ \t]+(?=```)/, ''),
      );
      leadText = allLines.join('\n').replace(/\n+$/, '');
    }
    const lead = pythonInlineToHtml(taskPrefix + leadText, theme);
    const nested = nestedBlocks.map((child) => renderBlock(child, theme));
    const body = nested.length ? [lead, ...nested].filter((part) => part !== '').join('\n') : lead;
    return `<li style="${theme.li}">${body}</li>`;
  });
  return `<${tag} style="${token.ordered ? theme.ol : theme.ul}"${startAttr}>\n${items.join('\n')}\n</${tag}>`;
}

function renderTable(token: LooseToken, theme: RenderTheme): string {
  const cellText = (cell: LooseToken): string =>
    pythonInlineToHtml((cell.text ?? '').replace(/\uE000/g, '|'), theme);
  const headCells = (token.header ?? [])
    .map((cell, index) => `<th${mergeStyle(theme.th, (token.align ?? [])[index])}>${cellText(cell)}</th>`)
    .join('\n');
  const rows = (token.rows ?? []).map(
    (row) =>
      `<tr>\n${row
        .map((cell, index) => `<td${mergeStyle(theme.td, (token.align ?? [])[index])}>${cellText(cell)}</td>`)
        .join('\n')}\n</tr>`,
  );
  return [
    `<table style="${theme.table}">`,
    '<thead>',
    `<tr>\n${headCells}\n</tr>`,
    '</thead>',
    '<tbody>',
    ...rows,
    '</tbody>',
    '</table>',
  ].join('\n');
}

function mergeStyle(baseStyle: string, align: string | null | undefined): string {
  const alignStyle = align ? ALIGN_STYLE[align] : '';
  return ` style="${alignStyle ? `${baseStyle} ${alignStyle}` : baseStyle}"`;
}

/** Markdown → 微信正文 HTML 片段（管道哨兵处理 + 分词 + 修复链 + 渲染）。 */
export function renderMarkdownBody(markdownText: string, theme: RenderTheme): string {
  const prepared = markdownText
    .split('\n')
    .map((line) => {
      if (!line.startsWith('|')) return line;
      return line
        .replace(/\\\|/g, PIPE_SENTINEL)
        .replace(/`[^`|]*\|[^`]*`/g, (span) => span.replace(/\|/g, PIPE_SENTINEL));
    })
    .join('\n');
  const tokens = marked.lexer(prepared, { gfm: true, breaks: true }) as unknown as LooseToken[];
  const repaired = splitDetachedTails(mergeAdjacentBlockquotes(repairListInterrupts(tokens)));
  return renderBlocks(repaired, theme).join('\n');
}
