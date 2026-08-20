import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives';
import type { HotspotItem } from '@/shared/contract';
import { describeRpcFailure, WewriteRpcError } from '../lib/rpc';
import { domainOf, formatTime, hotspotSourceLabel } from '../lib/format';
import { EmptyState, ErrorNote, SkeletonRow } from '../components/bits';
import { HotspotItemDigest } from '../components/HotspotItemDigest';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

/**
 * 选题中心（DESIGN §9.2）：左热榜列表（行 44px 按热度排序）+ 右「我的选题关键词」窄栏。
 * 命中关键词的行底 --ww-accent-subtle；「写这个」带 topic 直进生成流程。
 * v0.3 R1：行展开区 = 原文链接行 + 逐条 AI 速览块（HotspotItemDigest，懒加载+逐条缓存）。
 */

const KEYWORDS_STORAGE_KEY = 'dsh-wewrite.hotspot-keywords';

function loadKeywords(): string[] {
  try {
    const raw = window.localStorage.getItem(KEYWORDS_STORAGE_KEY);
    if (!raw) return ['DSH 插件'];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

type HotspotsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: HotspotItem[]; fetchedAtIso: string };

export function HotspotsPanel() {
  const store = useStore();
  const { rpc, navigate, startGeneration, t } = store;
  const [state, setState] = useState<HotspotsState>({ status: 'idle' });
  const [keywords, setKeywords] = useState<string[]>(loadKeywords);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [onlyHits, setOnlyHits] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(keywords));
    } catch {
      /* localStorage 不可用时关键词仅存内存 */
    }
  }, [keywords]);

  const fetchHotspots = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const items = await rpc.call<HotspotItem[]>('hotspots/fetch', { limit: 30 });
      setState({ status: 'ready', items, fetchedAtIso: new Date().toISOString() });
    } catch (error) {
      setState({ status: 'error', message: error instanceof WewriteRpcError ? error.message : String(error) });
    }
  }, [rpc]);

  const initialFetch = useRef(false);
  useEffect(() => {
    if (initialFetch.current) return;
    initialFetch.current = true;
    void fetchHotspots();
  }, [fetchHotspots]);

  const hit = useCallback((item: HotspotItem): boolean => keywords.some((word) => word && item.title.includes(word)), [keywords]);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    const sorted = [...state.items].sort((a, b) => a.rank - b.rank);
    return onlyHits ? sorted.filter(hit) : sorted;
  }, [state, onlyHits, hit]);

  const failure = state.status === 'error' ? describeRpcFailure(new Error(state.message)) : undefined;

  function addKeyword() {
    const word = keywordDraft.trim();
    if (!word || keywords.includes(word)) return;
    setKeywords((current) => [...current, word]);
    setKeywordDraft('');
  }

  return (
    <div className={store.narrow ? 'ww-hotspots ww-hotspots--narrow' : 'ww-hotspots'}>
      <div className="ww-hotspots__main">
        <div className="ww-pagebar">
          <h2 className="ww-pagebar__title">热门榜</h2>
          {state.status === 'ready' ? (
            <>
              <span className="ww-pagebar__count">· {visible.length}</span>
              <span className="ww-pagebar__meta">更新于 {formatTime(state.fetchedAtIso)}</span>
            </>
          ) : null}
          <div className="ww-pagebar__spacer" />
          <Button variant="ghost" size="sm" icon={<Icon name={state.status === 'loading' ? 'loader-circle' : 'refresh-cw'} size={16} className={state.status === 'loading' ? 'ww-spin' : undefined} />} onClick={() => void fetchHotspots()}>
            {t('action.refresh')}
          </Button>
        </div>
        {state.status === 'idle' || state.status === 'loading' ? (
          <div>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : state.status === 'error' ? (
          <ErrorNote
            title={failure?.title ?? '热榜拉取失败。'}
            hint={failure?.hint}
            action={<Button variant="outline" size="sm" onClick={() => void fetchHotspots()}>{t('action.retry')}</Button>}
          />
        ) : visible.length === 0 ? (
          onlyHits ? (
            <EmptyState
              icon={<Icon name="filter" size={20} />}
              title={`没有命中「${keywords.join('、')}」的条目。换个关键词，或关掉筛选看全部。`}
              action={<Button variant="outline" size="sm" onClick={() => setOnlyHits(false)}>关掉筛选</Button>}
            />
          ) : (
            <EmptyState
              icon={<Icon name="inbox" size={20} />}
              subIcon="sparkles"
              title="热榜还没拉取。点击刷新，或检查设置里的数据源配置。"
              action={<Button variant="outline" size="sm" onClick={() => navigate({ kind: 'settings' })}>{t('action.goSettings')}</Button>}
            />
          )
        ) : (
          <ul className="ww-hotspot-list">
            {visible.map((item) => (
              <li key={`${item.source}-${item.rank}-${item.title}`} className={hit(item) ? 'ww-hotspot ww-hotspot--hit' : 'ww-hotspot'}>
                <div className="ww-hotspot__liner">
                  <button
                    type="button"
                    className="ww-hotspot__row"
                    aria-expanded={expanded === item.title}
                    onClick={() => setExpanded(expanded === item.title ? null : item.title)}
                  >
                    <span className="ww-hotspot__rank">#{item.rank}</span>
                    <span className="ww-hotspot__title">{item.title}</span>
                    <span className="ww-hotspot__meta">
                      {hotspotSourceLabel(item.source)} · {domainOf(item.url)}
                    </span>
                    <Icon name={expanded === item.title ? 'chevron-down' : 'chevron-right'} size={16} />
                  </button>
                  {/* L5 动作前置：hover/键盘聚焦行时可见「写这个」，单击即以该条目为题启动管线 */}
                  <button
                    type="button"
                    className="ww-hotspot__write"
                    aria-label={`写这个：${item.title}`}
                    onClick={() => void startGeneration({ topicMode: 'fixed', topic: item.title }, item.title)}
                  >
                    <Icon name="pen-line" size={16} />
                    <span>{t('action.writeThis')}</span>
                  </button>
                </div>
                {expanded === item.title ? (
                  <div className="ww-hotspot__expand">
                    {/* 展开区垂直秩序：原文链接（确定性信息）在上，AI 速览（机器生成）在下 */}
                    <a className="ww-link" href={item.url} target="_blank" rel="noreferrer">
                      <Icon name="external-link" size={16} /> 原文链接（{domainOf(item.url)}）
                    </a>
                    <HotspotItemDigest item={item} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="ww-hotspots__keywords">
        <h3 className="ww-aside-title">我的选题关键词</h3>
        <div className="ww-keywords">
          {keywords.map((word) => (
            /* P5：Pill 本体不再整删（静态 chip），删除收敛到独立 × 按钮（真 button + aria-label） */
            <span className="ww-keyword" key={word}>
              <Pill>
                {word}
                <button
                  type="button"
                  className="ww-keyword__x"
                  aria-label={`移除关键词「${word}」`}
                  data-testid="ww-keyword-remove"
                  onClick={() => setKeywords((current) => current.filter((item) => item !== word))}
                >
                  <Icon name="x" size={16} />
                </button>
              </Pill>
            </span>
          ))}
          {keywords.length === 0 ? <p className="ww-aside-empty">还没有订阅关键词。添加后命中的条目会高亮。</p> : null}
        </div>
        <div className="ww-keywords__add">
          <Input
            placeholder="添加关键词"
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addKeyword();
            }}
            aria-label="添加选题关键词"
          />
          <Button variant="outline" size="sm" icon={<Icon name="plus" size={16} />} onClick={addKeyword} aria-label="添加关键词">
            添加
          </Button>
        </div>
        <button type="button" className={onlyHits ? 'ww-filter-toggle ww-filter-toggle--on' : 'ww-filter-toggle'} onClick={() => setOnlyHits((on) => !on)} aria-pressed={onlyHits}>
          <Icon name="filter" size={16} /> 命中筛选：{onlyHits ? '仅显示命中' : '看全部'}
        </button>
      </aside>
    </div>
  );
}
