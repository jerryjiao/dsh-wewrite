import { useMemo, useRef, useState } from 'react';
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ArticleListItem, RunSummary } from '@/shared/contract';
import { gateStatusForArticle } from '../lib/gate';
import { useStore } from '../store';
import { Icon } from './Icon';

/**
 * 左栏文章列（ArticleRail，uiux-workbench-delta §1-3）：
 * 搜索 + 状态筛选 → 36px 紧凑行（StateDot + 标题 + 门禁标记）→ 底部「新文章」主按钮。
 * 门禁标记行点击载入该文并自动展开 GateOverlayPanel（AC-4 直达）。
 */

type RailFilterId = 'all' | 'draft' | 'gate-failed' | 'pushed';

const FILTERS: ReadonlyArray<{ id: RailFilterId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'draft', label: '草稿' },
  { id: 'gate-failed', label: '门禁未过' },
  { id: 'pushed', label: '已进草稿箱' },
];

const MAX_VISIBLE = 200;

function statusDotState(status: ArticleListItem['status']): StateDotState {
  switch (status) {
    case 'editing':
      return 'ongoing';
    case 'rendered':
    case 'pushed':
      return 'done';
    case 'failed':
      return 'error';
  }
}

export function ArticleRail({
  articles,
  runs,
  currentId,
  collapsed = false,
  onOpenArticle,
}: {
  articles: readonly ArticleListItem[];
  runs: readonly RunSummary[];
  currentId: string | undefined;
  collapsed?: boolean;
  onOpenArticle: (id: string, options?: { gate?: boolean }) => void;
}) {
  const store = useStore();
  const { startGeneration, snapshot } = store;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RailFilterId>('all');
  const [newOpen, setNewOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [starting, setStarting] = useState(false);
  const newInputRef = useRef<HTMLInputElement | null>(null);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return articles
      .filter((article) => {
        if (filter === 'draft') return article.status === 'editing';
        if (filter === 'pushed') return article.status === 'pushed';
        if (filter === 'gate-failed') return gateStatusForArticle(runs, article).verdict === 'gate-failed';
        return true;
      })
      .filter((article) =>
        normalized.length === 0
          ? true
          : article.title.toLowerCase().includes(normalized) || article.slug.toLowerCase().includes(normalized),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [articles, runs, filter, query]);

  async function handleStart() {
    const trimmed = topic.trim();
    if (!trimmed) {
      // v2 §3-01：空输入 CTA 不 disabled——点击/Enter 聚焦输入框。
      newInputRef.current?.focus();
      return;
    }
    if (starting) return;
    setStarting(true);
    const theme = snapshot.status === 'ready' ? snapshot.data.config.settings.defaultTheme : undefined;
    const llm = snapshot.status === 'ready' ? snapshot.data.config.settings.llmDefault : undefined;
    await startGeneration({ topicMode: 'fixed', topic: trimmed, theme, imageCount: 1, llm }, trimmed);
    setStarting(false);
    setTopic('');
    setNewOpen(false);
  }

  const empty = articles.length === 0;

  return (
    <nav className={collapsed ? 'ww-rail ww-rail--collapsed' : 'ww-rail'} aria-label="我的文章" data-testid="ww-rail" id="ww-rail">
      <div className="ww-rail__head">
        <div className="ww-rail__search-wrap">
          <Icon name="search" size={16} className="ww-rail__search-icon" />
          <input
            type="text"
            className="ww-rail__search"
            data-testid="ww-rail-search"
            placeholder="搜索标题 / slug"
            value={query}
            disabled={empty}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索文章"
          />
        </div>
        <div className="ww-rail__filter" role="group" aria-label="状态筛选" data-testid="ww-rail-filter">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'ww-rail__filter-chip ww-rail__filter-chip--on' : 'ww-rail__filter-chip'}
              aria-pressed={filter === item.id}
              data-testid={`ww-rail-filter-${item.id}`}
              disabled={empty}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <ul className="ww-rail__list" role="list">
        {empty ? (
          <li className="ww-rail__empty">
            <RailEmptyGlyph />
            <p className="ww-rail__empty-text">还没有文章</p>
            <p className="ww-rail__empty-hint">用底部的「新文章」开始第一篇 ↓</p>
          </li>
        ) : (
          rows.slice(0, MAX_VISIBLE).map((article) => {
            const gate = gateStatusForArticle(runs, article);
            const gateMarked = gate.blocking;
            return (
              <li className="ww-rail__row" role="listitem" key={article.id}>
                <button
                  type="button"
                  className={article.id === currentId ? 'ww-rail-btn ww-rail-btn--active' : 'ww-rail-btn'}
                  aria-current={article.id === currentId ? 'page' : undefined}
                  data-testid={`ww-rail-row-${article.id}`}
                  title={article.title}
                  onClick={() => onOpenArticle(article.id)}
                >
                  <StateDot state={statusDotState(article.status)} />
                  <span className="ww-rail-btn__title">{article.title}</span>
                  {gateMarked ? (
                    <span
                      className="ww-rail-btn__gate"
                      role="button"
                      tabIndex={0}
                      aria-label={`门禁未过：${article.title}，查看门禁报告`}
                      title={gate.label}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenArticle(article.id, { gate: true });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.stopPropagation();
                          event.preventDefault();
                          onOpenArticle(article.id, { gate: true });
                        }
                      }}
                    >
                      <Icon name="shield-alert" size={12} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="ww-rail__foot">
        {newOpen ? (
          <div className="ww-rail-new" id="ww-rail-new">
            <input
              ref={newInputRef}
              type="text"
              className="ww-rail-new__input"
              data-testid="ww-rail-new-input"
              placeholder="输入主题"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleStart();
              }}
              aria-label="新文章主题"
            />
            <Button
              variant="primary"
              size="sm"
              className="ww-btn-accent"
              data-testid="ww-rail-new-submit"
              icon={<Icon name="arrow-right" size={16} />}
              onClick={() => void handleStart()}
              disabled={starting}
            >
              {starting ? '启动中…' : '开始写作'}
            </Button>
            <button
              type="button"
              className="ww-rail-new__hotspots"
              data-testid="ww-rail-new-hotspots"
              onClick={() => store.navigate({ kind: 'hotspots' })}
            >
              <Icon name="flame" size={16} /> 从热榜挑
            </button>
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="ww-rail__new"
          data-testid="ww-rail-new"
          aria-expanded={newOpen}
          aria-controls="ww-rail-new"
          icon={<Icon name="plus" size={16} />}
          onClick={() => setNewOpen((open) => !open)}
        >
          新文章
        </Button>
      </div>
    </nav>
  );
}

function RailEmptyGlyph() {
  return (
    <span className="ww-rail__empty-glyph">
      <Icon name="file-text" size={16} />
    </span>
  );
}
