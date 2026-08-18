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

export function mergeAdjacentBlockquotes(tokens: LooseToken[]): LooseToken[] {
  const merged: LooseToken[] = [];
  for (const token of tokens) {
    if (token.type === 'space') {
      merged.push(token);
      continue;
    }
    let previous = merged[merged.length - 1];
    while (previous?.type === 'space') {
      merged.pop();
      previous = merged[merged.length - 1];
    }
    if (token.type === 'blockquote' && previous?.type === 'blockquote') {
      const index = merged.indexOf(previous);
      merged[index] = { ...previous, tokens: [...(previous.tokens ?? []), ...(token.tokens ?? [])] };
      continue;
    }
    merged.push(token);
  }
  return merged;
}

export function splitDetachedTails(tokens: LooseToken[]): LooseToken[] {
  const out: LooseToken[] = [];
  for (const token of tokens) {
    if (token.type !== 'list') {
      out.push(token);
      continue;
    }
    let currentItems: LooseToken[] = [];
    const flush = (): void => {
      if (!currentItems.length) return;
      const firstMarker = /^\s*(\d+)[.)][ \t]/.exec(currentItems[0].raw ?? '');
      const start = token.ordered && firstMarker ? Number(firstMarker[1]) : undefined;
      out.push({
        ...token,
        items: currentItems,
        raw: currentItems.map((item) => item.raw).join(''),
        ...(start !== undefined ? { start } : {}),
      });
      currentItems = [];
    };
    for (const item of token.items ?? []) {
      const raw = item.raw ?? '';
      const firstBlank = raw.match(/[ \t]*\n/) ? raw.search(/\n[ \t]*\n/) : -1;
      const tail = firstBlank === -1 ? null : raw.slice(firstBlank);
      const tailLines = tail ? tail.split('\n').filter((line) => line.trim()) : [];
      const tailIsDetached =
        tail !== null &&
        tailLines.length > 0 &&
        tailLines.every((line) => /^[ \t]{1,3}\S/.test(line)) &&
        !tailLines.some((line) => /^[ \t]*([-*+]|\d+[.)])[ \t]/.test(line)) &&
        !tail.includes('```');
      if (!tailIsDetached) {
        currentItems.push(item);
        continue;
      }
      currentItems.push({ ...item, raw: `${raw.slice(0, firstBlank)}\n` });
      flush();
      for (const paragraphText of (tail as string).split(/\n[ \t]*\n/)) {
        const text = paragraphText.replace(/\n+$/, '');
        if (text.trim()) out.push({ type: 'paragraph', raw: text, text });
      }
    }
    flush();
  }
  return out;
}

export function repairListInterrupts(tokens: LooseToken[]): LooseToken[] {
  const repaired: LooseToken[] = [];
  for (const token of tokens) {
    if (token.type === 'blockquote' && Array.isArray(token.tokens)) {
      repaired.push({ ...token, tokens: repairListInterrupts(token.tokens) });
      continue;
    }
    if (token.type === 'list' && Array.isArray(token.items)) {
      repaired.push({
        ...token,
        items: token.items.map((item) =>
          Array.isArray(item.tokens) ? { ...item, tokens: repairBlockTokensInItem(item.tokens) } : item,
        ),
      });
      continue;
    }
    repaired.push(token);
  }
  return mergeInterruptedPairs(repaired);
}

function repairBlockTokensInItem(tokens: LooseToken[]): LooseToken[] {
  const repaired = tokens.map((token) =>
    token.type === 'blockquote' && Array.isArray(token.tokens)
      ? { ...token, tokens: repairListInterrupts(token.tokens) }
      : token,
  );
  return mergeInterruptedPairs(repaired);
}

function mergeInterruptedPairs(tokens: LooseToken[]): LooseToken[] {
  const merged = [...tokens];
  for (let index = 1; index < merged.length; index += 1) {
    const previous = merged[index - 1];
    const current = merged[index];
    const interrupting = current?.type === 'list' || current?.type === 'table';
    if (interrupting && previous?.type === 'paragraph' && !/\n\s*\n$/.test(previous.raw ?? '')) {
      const mergedText = `${previous.raw ?? ''}${current.raw ?? ''}`;
      merged.splice(index - 1, 2, { type: 'paragraph', raw: mergedText, text: mergedText.trim() });
      index -= 1;
    }
  }
  return merged;
}
