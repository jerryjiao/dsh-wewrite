import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HotspotItem, HotspotItemDigest as HotspotItemDigestDto } from '@/shared/contract';
import { describeRpcFailure, WewriteRpcError } from '../lib/rpc';
import { formatTime } from '../lib/format';
import { ErrorNote, SkeletonBlock } from './bits';
import { Icon } from './Icon';
import { useStore } from '../store';

/**
 * 热榜逐条 AI 速览块（uiux v0.3 §1，视觉规格 uiux-v0.3-design §D1）：
 * 行内嵌入件（无卡框），挂在 .ww-hotspot__expand 内原文链接行之后。
 * 首次展开自动生成（懒加载），loading 骨架 / 错误 ErrorNote+重试 / ready 全量渲染。
 * 逐条缓存 localStorage dsh-wewrite.hotspot-item-digests，键 = URL，当日有效（次日重生成）。
 */

const DIGEST_ITEM_STORAGE_KEY = 'dsh-wewrite.hotspot-item-digests';

type DigestSource = 'article' | 'title';

interface DigestCacheEntry {
  digest: string;
  source: DigestSource;
  model: string;
  generatedAtIso: string;
}

type DigestCache = Record<string, DigestCacheEntry>;

function loadCache(): DigestCache {
  try {
    const raw = window.localStorage.getItem(DIGEST_ITEM_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as DigestCache;
  } catch {
    return {};
  }
}

/** 当日有效：缓存条目生成日期与今天不同（本地时区口径）即视为无缓存，次日重生成。 */
function isSameLocalDay(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function readCachedDigest(url: string): DigestCacheEntry | null {
  const entry = loadCache()[url];
  if (!entry) return null;
  if (
    typeof entry.digest !== 'string' ||
    (entry.source !== 'article' && entry.source !== 'title') ||
    typeof entry.model !== 'string' ||
    typeof entry.generatedAtIso !== 'string' ||
    !isSameLocalDay(entry.generatedAtIso)
  ) {
    return null;
  }
  return entry;
}

function writeCachedDigest(url: string, entry: DigestCacheEntry): void {
  try {
    const next: DigestCache = { ...loadCache(), [url]: entry };
    window.localStorage.setItem(DIGEST_ITEM_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 不可用时速览仅存内存 */
  }
}

export type ItemDigestPhase = 'idle' | 'loading' | 'error';

// ── 行渲染（§D1-5：纯文本行 → DOM，宽松匹配，失败原样落正文行不丢内容） ─────────

const LEAD_PREFIXES = ['这条在讲什么：', '标题解读：'] as const;

function DigestLine({ line }: { line: string }) {
  const leadPrefix = LEAD_PREFIXES.find((prefix) => line.startsWith(prefix));
  if (leadPrefix) {
    return (
      <p className="ww-hotspot__digest-lead">
        <span className="ww-hotspot__digest-prefix">{leadPrefix}</span>
        {line.slice(leadPrefix.length)}
      </p>
    );
  }
  if (line.startsWith('·')) {
    return (
      <p className="ww-hotspot__digest-point">
        <span className="ww-hotspot__digest-mark" aria-hidden="true">·</span>
        <span>{line.replace(/^·\s*/, '')}</span>
      </p>
    );
  }
  return <p>{line}</p>;
}

// ── 组件（presentational + 自持状态机） ────────────────────────────────────────

export function HotspotItemDigest({ item }: { item: HotspotItem }) {
  const { rpc, t } = useStore();
  // 挂载时读一次缓存：命中直接 ready（不调 RPC），未命中进 loading 并自动触发生成
  const cachedRef = useRef<DigestCacheEntry | null>(readCachedDigest(item.url));
  const [entry, setEntry] = useState<DigestCacheEntry | null>(cachedRef.current);
  const [phase, setPhase] = useState<ItemDigestPhase>(cachedRef.current ? 'idle' : 'loading');
  const [message, setMessage] = useState('');

  const generate = useCallback(async () => {
    const cached = readCachedDigest(item.url);
    if (cached) {
      setEntry(cached);
      setPhase('idle');
      return;
    }
    setPhase('loading');
    try {
      const result = await rpc.call<HotspotItemDigestDto>('hotspots/digestItem', {
        rank: item.rank,
        title: item.title,
        url: item.url,
      });
      const next: DigestCacheEntry = {
        digest: result.digest,
        source: result.source,
        model: result.model,
        generatedAtIso: result.generatedAtIso,
      };
      writeCachedDigest(item.url, next);
      setEntry(next);
      setPhase('idle');
    } catch (error) {
      setMessage(error instanceof WewriteRpcError ? error.message : String(error));
      setPhase('error');
    }
  }, [rpc, item.rank, item.title, item.url]);

  // 首次展开自动生成（懒加载）；缓存命中不调 RPC
  useEffect(() => {
    if (cachedRef.current) return;
    void generate();
  }, [generate]);

  const busy = phase === 'loading';
  const failure = phase === 'error' ? describeRpcFailure(new Error(message)) : undefined;
  const sourceLabel = entry?.source === 'article' ? '读了原文' : '仅标题';

  return (
    <div className="ww-hotspot__digest" data-testid="ww-hotspot-digest">
      <div className="ww-hotspot__digest-head">
        <span className="ww-hotspot__digest-icon"><Icon name="wand-sparkles" size={16} /></span>
        <span className="ww-hotspot__digest-label">AI 速览</span>
        {entry && !busy && phase !== 'error' ? (
          <>
            <span
              className={`ww-hotspot__digest-source ww-hotspot__digest-source--${entry.source}`}
              data-testid="ww-hotspot-digest-source"
            >
              <Icon name={entry.source === 'article' ? 'check' : 'eye-off'} size={12} />
              {sourceLabel}
            </span>
            <span className="ww-hotspot__digest-time">{formatTime(entry.generatedAtIso)}</span>
          </>
        ) : null}
      </div>
      <div className="ww-hotspot__digest-body" data-testid="ww-hotspot-digest-body">
        {busy ? (
          <SkeletonBlock lines={3} />
        ) : phase === 'error' ? (
          <ErrorNote
            title={failure?.title ?? '速览生成失败。'}
            hint={failure?.hint}
            action={
              <Button
                variant="outline"
                size="sm"
                data-testid="ww-hotspot-digest-retry"
                onClick={() => void generate()}
              >
                {t('action.retry')}
              </Button>
            }
          />
        ) : entry ? (
          entry.digest
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line, index) => <DigestLine key={`d${index}`} line={line} />)
        ) : null}
      </div>
    </div>
  );
}
