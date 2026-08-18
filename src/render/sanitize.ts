/**
 * 渲染层安全基线：转义 + URL 消毒 + 受限标签集（架构 §3：无 style/link、样式全内联）。
 * markdown 内的原始 HTML 只放行白名单标签与白名单属性；script/iframe 一律转义为文本。
 */

const TEXT_ESCAPE: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const ATTR_ESCAPE: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '"': '&quot;' };

export function escapeText(text: string): string {
  return text.replace(/[&<>]/g, (ch) => TEXT_ESCAPE[ch]);
}

export function escapeAttr(text: string): string {
  return text.replace(/[&<"]/g, (ch) => ATTR_ESCAPE[ch]);
}

export function escapeCode(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ ...TEXT_ESCAPE, '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** URL 协议白名单 + 危险字符黑名单（含引号，杜绝属性逃逸注入）。 */
const URL_SAFE_CHARS = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;
const URL_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * URL 消毒：合法返回原串（调用方再做属性转义），非法返回 null（资源被丢弃，保留 alt 文本）。
 * javascript: 伪协议、带引号/尖括号/空白的 URL 一律拒绝。
 */
export function sanitizeUrl(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (!url) return null;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  if (scheme && !URL_SCHEMES.has(scheme[1].toLowerCase())) return null;
  if (!URL_SAFE_CHARS.test(url)) return null;
  return url;
}

/** 受限标签集（微信正文友好子集；h1 不在列——标题由发布字段承载）。 */
const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure', 'font', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'section', 'span', 'strong', 'sub',
  'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

const ALLOWED_ATTRS = new Set([
  'align', 'alt', 'class', 'colspan', 'height', 'href', 'rowspan', 'size', 'src', 'start', 'style',
  'title', 'width',
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);

/**
 * 单个标签消毒：白名单内重建（属性白名单 + href/src 过 sanitizeUrl），否则返回 null。
 */
export function sanitizeHtmlTag(rawTag: string): string | null {
  const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)>$/s.exec(rawTag);
  if (!match) return null;
  const [, closing, rawName, attrText] = match;
  const name = rawName.toLowerCase();
  if (!ALLOWED_TAGS.has(name)) return null;
  if (closing) return `</${name}>`;
  const attrs: string[] = [];
  const attrRe = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRe.exec(attrText))) {
    const attrName = attrMatch[1].toLowerCase();
    if (!ALLOWED_ATTRS.has(attrName) || attrName.startsWith('on')) continue;
    const rawValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
    if (attrName === 'href' || attrName === 'src') {
      const url = sanitizeUrl(rawValue);
      if (url === null) continue;
      attrs.push(`${attrName}="${escapeAttr(url)}"`);
      continue;
    }
    const value = rawValue.replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, '');
    attrs.push(`${attrName}="${escapeAttr(value)}"`);
  }
  const attrSuffix = attrs.length ? ` ${attrs.join(' ')}` : '';
  return VOID_TAGS.has(name) ? `<${name}${attrSuffix} />` : `<${name}${attrSuffix}>`;
}

/** 混合片段消毒：标签逐个过白名单，其余文本全转义。 */
export function sanitizeHtmlFragment(text: string): string {
  return text.replace(/<\/?[a-zA-Z][^>]*>|[^<]+/gs, (part) => {
    if (!part.startsWith('<')) return escapeText(part);
    const sanitized = sanitizeHtmlTag(part);
    return sanitized ?? escapeText(part);
  });
}
