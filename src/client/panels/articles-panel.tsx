import { useMemo, useState } from 'react';
import { Button, Input, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ArticleListItem, RunSummary } from '@/shared/contract';
import { gateStatusForArticle } from '../lib/gate';
import { formatShortDateTime } from '../lib/format';
import type { ArticleStatus } from '../lib/format';
import { articleStatusBadge, EmptyState, ErrorNote, SkeletonRow, StatusBadge, CodeChip } from '../components/bits';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

/**
 * 文章库（DESIGN §9.3）：数据表格（非卡片网格）。
 * 列 = 标题(含 slug 等宽副行)/状态/门禁/定时/更新/操作；行 44px hover 交互底。
 */

type StatusFilter = 'all' | ArticleStatus;

const FILTERS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'editing', label: '草稿' },
  { id: 'rendered', label: '已排版' },
  { id: 'pushed', label: '已进草稿箱' },
  { id: 'failed', label: '失败' },
];

const MAX_VISIBLE = 200;

export function ArticlesPanel() {
  const store = useStore();
  const { snapshot, refreshSnapshot, navigate, rpc, toast, t } = store;
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleting, setDeleting] = useState<ArticleListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const articles = snapshot.status === 'ready' ? snapshot.data.articles : undefined;
  const schedules = snapshot.status === 'ready' ? snapshot.data.schedules : undefined;
  const runs: readonly RunSummary[] = snapshot.status === 'ready' ? snapshot.data.runs : [];

  const rows = useMemo(() => {
    if (!articles) return undefined;
    const normalizedQuery = query.trim().toLowerCase();
    return articles
      .filter((article) => (filter === 'all' ? true : article.status === filter))
      .filter((article) =>
        normalizedQuery.length === 0
          ? true
          : article.title.toLowerCase().includes(normalizedQuery) || article.slug.toLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [articles, filter, query]);

  function scheduleFor(article: ArticleListItem): string | undefined {
    if (!schedules) return undefined;
    const matched = schedules
      .filter((schedule) => schedule.enabled && schedule.params.topic === article.title && schedule.nextRunAt)
      .sort((a, b) => (a.nextRunAt ?? '').localeCompare(b.nextRunAt ?? ''));
    const next = matched[0];
    return next?.nextRunAt ? formatShortDateTime(next.nextRunAt) : undefined;
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await rpc.call<{ deleted: boolean }>('article/delete', { id: deleting.id });
      toast.push({ kind: 'success', title: '已删除《' + deleting.title + '》' });
      setDeleting(null);
      await refreshSnapshot();
    } catch (error) {
      toast.push({ kind: 'error', title: '删除失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setDeleteBusy(false);
    }
  }

  const filterLabel = FILTERS.find((item) => item.id === filter)?.label ?? '全部';
  const menuEntries: MenuEntry[] = FILTERS.map((item) => ({ id: item.id, label: item.label }));

  return (
    <div className="ww-articles">
      <div className="ww-page-head">
        <h2 className="ww-page-title">文章库{articles ? `（${articles.length}）` : ''}</h2>
        <div className="ww-page-head__aside">
          <Menu
            open={filterOpen}
            anchor={
              <button type="button" className="ww-menu-trigger" aria-expanded={filterOpen} aria-haspopup="menu" onClick={() => setFilterOpen((open) => !open)}>
                {filterLabel}
                <Icon name="chevron-down" size={16} />
              </button>
            }
            items={menuEntries}
            selectedId={filter}
            onSelect={(id) => {
              setFilter(id as StatusFilter);
              setFilterOpen(false);
            }}
            onClose={() => setFilterOpen(false)}
          />
          <Input
            icon={<Icon name="search" size={16} />}
            placeholder="搜索 slug / 标题"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索文章"
          />
        </div>
      </div>

      {snapshot.status === 'loading' ? (
        <div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : snapshot.status === 'error' ? (
        <ErrorNote
          title="文章列表拉取失败（存储不可用）。"
          action={<Button variant="outline" size="sm" onClick={() => void refreshSnapshot()}>{t('action.retry')}</Button>}
        />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="inbox" size={20} />}
          title={query || filter !== 'all' ? '没有符合当前筛选的文章。换个条件，或清空筛选看全部。' : '还没有文章。去选题中心挑一条热榜，或在写作台输入主题开始第一篇。'}
          action={
            query || filter !== 'all' ? (
              <Button variant="outline" size="sm" onClick={() => { setQuery(''); setFilter('all'); }}>清空筛选</Button>
            ) : (
              <Button variant="outline" size="sm" icon={<Icon name="flame" size={16} />} onClick={() => navigate({ kind: 'hotspots' })}>
                {t('empty.action.hotspots')}
              </Button>
            )
          }
        />
      ) : (
        <>
          <table className="ww-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>状态</th>
                <th>门禁</th>
                <th>定时</th>
                <th>更新</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, MAX_VISIBLE).map((article) => {
                const badge = articleStatusBadge(article.status);
                const gate = runs.length > 0 ? gateStatusForArticle(runs, article) : undefined;
                const scheduled = scheduleFor(article);
                return (
                  <tr key={article.id} className="ww-table__row">
                    <td className="ww-table__title-cell">
                      <button type="button" className="ww-table__title" title={article.title} onClick={() => navigate({ kind: 'article', id: article.id })}>
                        {article.title}
                      </button>
                      <CodeChip className="ww-table__slug">{article.slug}</CodeChip>
                    </td>
                    <td>
                      <StatusBadge tone={badge.tone} label={badge.label} />
                    </td>
                    <td className="ww-table__mono">
                      {!gate || gate.verdict === 'unknown' ? (
                        <span className="ww-table__muted">—</span>
                      ) : gate.verdict === 'passed' ? (
                        <span className="ww-table__gate-pass">
                          <Icon name="shield-check" size={16} /> 已过
                        </span>
                      ) : (
                        <span className="ww-table__danger">
                          <Icon name="shield-alert" size={16} /> {gate.label}
                        </span>
                      )}
                    </td>
                    <td className="ww-table__mono">{scheduled ?? <span className="ww-table__muted">—</span>}</td>
                    <td className="ww-table__mono">{formatShortDateTime(article.updatedAt)}</td>
                    <td className="ww-table__actions">
                      <Button variant="ghost" size="sm" icon={<Icon name="file-pen" size={16} />} onClick={() => navigate({ kind: 'article', id: article.id })}>
                        编辑
                      </Button>
                      {gate?.blocking ? (
                        <Button variant="ghost" size="sm" icon={<Icon name="wand-sparkles" size={16} />} onClick={() => navigate({ kind: 'article', id: article.id })}>
                          去修复
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" className="ww-danger-ghost" icon={<Icon name="trash-2" size={16} />} aria-label={`删除《${article.title}》`} onClick={() => setDeleting(article)}>
                        删除
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > MAX_VISIBLE ? (
            <p className="ww-table__more">仅显示最近 {MAX_VISIBLE} 篇（可在设置调整保留上限）。</p>
          ) : null}
        </>
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`删除《${deleting?.title ?? ''}》`}
        closeLabel="取消删除"
        description="删除后不可恢复；已推送到草稿箱的稿子不受影响。"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>{t('action.cancel')}</Button>
            <Button variant="ghost" size="sm" className="ww-danger-ghost" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? '删除中…' : '确认删除'}
            </Button>
          </>
        }
      >
        <p className="ww-modal-note">
          <CodeChip>{deleting?.slug}</CodeChip> 将从本地存储移除。
        </p>
      </Modal>
    </div>
  );
}
