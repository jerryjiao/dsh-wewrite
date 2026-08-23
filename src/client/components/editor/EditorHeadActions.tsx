import { useState } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ArticleDetail } from '@/shared/contract';
import { Icon } from '../Icon';
import { ArticleManage } from './ArticleManage';

/**
 * 编辑器页头右侧动作组（uiux-workbench-delta §1-7）：
 * [三视图分段] [⋯管理菜单（重命名/删除）] [推草稿箱 ▾ 主 CTA]。
 */

export type EditorView = 'edit' | 'split' | 'preview';

const VIEW_TABS: ReadonlyArray<{ key: EditorView; icon: 'file-pen' | 'columns-2' | 'eye'; label: string }> = [
  { key: 'edit', icon: 'file-pen', label: '仅编辑' },
  { key: 'split', icon: 'columns-2', label: '双栏' },
  { key: 'preview', icon: 'eye', label: '仅预览' },
];

export function EditorHeadActions({
  view,
  onViewChange,
  article,
  onArticleChanged,
  onDeleted,
  pushing,
  pushLabel,
  pushingLabel,
  onPush,
  onSchedule,
}: {
  view: EditorView;
  onViewChange: (view: EditorView) => void;
  article: ArticleDetail;
  onArticleChanged: (next: ArticleDetail) => void;
  onDeleted: () => void;
  pushing: boolean;
  pushLabel: string;
  pushingLabel: string;
  onPush: () => void;
  onSchedule: () => void;
}) {
  const [pushMenuOpen, setPushMenuOpen] = useState(false);
  return (
    <div className="ww-editor-head__actions">
      <div className="ww-view-tabs" role="tablist" aria-label="编辑器视图">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            aria-label={tab.label}
            data-testid={`ww-view-tab-${tab.key}`}
            className={view === tab.key ? 'ww-view-tab ww-view-tab--active' : 'ww-view-tab'}
            onClick={() => onViewChange(tab.key)}
          >
            <Icon name={tab.icon} size={16} />
            <span className="ww-view-tab__label">{tab.label}</span>
          </button>
        ))}
      </div>
      <ArticleManage article={article} onChanged={onArticleChanged} onDeleted={onDeleted} />
      <Menu
        open={pushMenuOpen}
        anchor={
          <button
            type="button"
            className="ww-menu-trigger ww-menu-trigger--accent"
            aria-expanded={pushMenuOpen}
            aria-haspopup="menu"
            onClick={() => setPushMenuOpen((open) => !open)}
            disabled={pushing}
          >
            {pushing ? pushingLabel : pushLabel}
            <Icon name="chevron-down" size={16} />
          </button>
        }
        items={[
          { id: 'push', label: '推草稿箱', icon: <Icon name="send" size={16} /> },
          { id: 'schedule', label: '推草稿箱并定时…', icon: <Icon name="calendar-clock" size={16} /> },
        ]}
        onSelect={(id) => {
          setPushMenuOpen(false);
          if (id === 'push') onPush();
          else onSchedule();
        }}
        onClose={() => setPushMenuOpen(false)}
        align="end"
      />
    </div>
  );
}
