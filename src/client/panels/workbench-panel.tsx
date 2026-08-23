import { useEffect, useRef, useState } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { useStore } from '../store';
import { ArticleRail } from '../components/ArticleRail';
import { StartupCard } from '../components/StartupCard';
import { Icon } from '../components/Icon';
import { EditorPanel } from './editor-panel';

/**
 * 写作工作区（WorkbenchPanel，uiux-workbench-delta §1-2，L1）：
 * 左 ArticleRail（240px 可折叠）+ 右主区（EditorPanel 或零文章 StartupCard）。
 * home = 主区载入最近编辑一篇；article = 聚焦态载入指定文章（rail 高亮该行）。
 * 非路由态（不进 Route）：rail 折叠（持久化 ww.rail.collapsed）、门禁面板开合。
 * 窄态 <900px：rail 整体替换为文章下拉（ww-rail-select）——有文章挂编辑器页头最左，
 * 零文章挂主区顶部窄条（下拉内「新文章」引导聚焦 StartupCard 输入框，A04 修复）。
 */

const RAIL_COLLAPSED_KEY = 'ww.rail.collapsed';
/** 窄态空库下拉的唯一菜单项 id：选中即触发「新文章」引导（聚焦 StartupCard 输入框） */
const NEW_ARTICLE_ENTRY_ID = '__ww_new_article__';

function readRailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function WorkbenchPanel({ articleId }: { articleId?: string }) {
  const store = useStore();
  const { snapshot, navigate, narrow } = store;
  const [railCollapsed, setRailCollapsed] = useState(readRailCollapsed);
  // 门禁面板归属文章：gateArticle === 当前文章时开；切文章/离开工作区自然关闭（delta §1-6）。
  const [gateArticle, setGateArticle] = useState<string | null>(null);
  // 窄态空库「新文章」引导的落点：StartupCard 主题输入框（A04）。
  const startupInputRef = useRef<HTMLInputElement>(null);

  const articles = snapshot.status === 'ready' ? snapshot.data.articles : [];
  const runs = snapshot.status === 'ready' ? snapshot.data.runs : [];
  const latestId = articles.length > 0 ? [...articles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id : undefined;
  const currentId = articleId ?? latestId;
  const gateOpen = gateArticle !== null && gateArticle === currentId;
  // 零文章（或无当前篇）：主区退位 StartupCard，无编辑器页头可挂窄态下拉（A04 前置）。
  const workbenchEmpty = articles.length === 0 || currentId === undefined;

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_COLLAPSED_KEY, railCollapsed ? '1' : '0');
    } catch {
      /* localStorage 不可用时折叠态仅存内存 */
    }
  }, [railCollapsed]);

  function openArticle(id: string, options?: { gate?: boolean }) {
    if (options?.gate) setGateArticle(id);
    else setGateArticle(null);
    if (id !== currentId) navigate({ kind: 'article', id });
  }

  const railSelect = (
    <RailSelect
      articles={articles}
      currentId={currentId}
      onSelect={openArticle}
      onNewArticle={() => startupInputRef.current?.focus()}
    />
  );

  const leading = narrow ? (
    railSelect
  ) : (
    <button
      type="button"
      className="ww-rail__toggle"
      data-testid="ww-rail-toggle"
      aria-expanded={!railCollapsed}
      aria-controls="ww-rail"
      aria-label={railCollapsed ? '展开文章栏' : '折叠文章栏'}
      onClick={() => setRailCollapsed((collapsed) => !collapsed)}
    >
      <Icon name="panel-left" size={16} />
    </button>
  );

  return (
    <section className="ww-workbench" data-testid="ww-workbench">
      {!narrow ? (
        <ArticleRail articles={articles} runs={runs} currentId={currentId} collapsed={railCollapsed} onOpenArticle={openArticle} />
      ) : null}
      <div className="ww-workbench__main">
        {narrow && workbenchEmpty ? (
          /* A04：窄态零文章无编辑器页头——下拉位挂主区顶部窄条，保证 ww-rail-select 常在 */
          <div className="ww-workbench__narrow-bar">{railSelect}</div>
        ) : null}
        {workbenchEmpty ? (
          <StartupCard inputRef={startupInputRef} />
        ) : (
          <EditorPanel
            articleId={currentId}
            leading={leading}
            gateOpen={gateOpen}
            onGateOpenChange={(open) => setGateArticle(open ? currentId : null)}
          />
        )}
      </div>
    </section>
  );
}

function RailSelect({
  articles,
  currentId,
  onSelect,
  onNewArticle,
}: {
  articles: ReadonlyArray<{ id: string; title: string }>;
  currentId: string | undefined;
  onSelect: (id: string) => void;
  onNewArticle: () => void;
}) {
  const [open, setOpen] = useState(false);
  // 空库相位：菜单退化为唯一入口「新文章」——选中即引导聚焦 StartupCard 输入框（A04）。
  const entries: MenuEntry[] =
    articles.length > 0
      ? articles.map((article) => ({ id: article.id, label: article.title }))
      : [{ id: NEW_ARTICLE_ENTRY_ID, label: '新文章' }];
  const current = articles.find((article) => article.id === currentId);
  return (
    <Menu
      open={open}
      anchor={
        <button
          type="button"
          className="ww-rail-select"
          data-testid="ww-rail-select"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="选择文章"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="ww-rail-select__title">{current?.title ?? '选择文章'}</span>
          <Icon name="chevron-down" size={16} />
        </button>
      }
      items={entries}
      selectedId={currentId}
      onSelect={(id) => {
        setOpen(false);
        if (id === NEW_ARTICLE_ENTRY_ID) {
          onNewArticle();
          return;
        }
        onSelect(id);
      }}
      onClose={() => setOpen(false)}
    />
  );
}
