import { useState } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ArticleDetail } from '@/shared/contract';
import { Icon } from '../Icon';
import { ArticleManage } from './ArticleManage';

/**
 * 编辑器页头右侧动作组（uiux-workbench-delta §1-7）：
 * [三视图分段] [⋯管理菜单（重命名/删除）] [推草稿箱 ▾ 主 CTA]。
 * 公众号未配置时「推草稿箱」改为引导项（不报错）：选中即跳设置页配公众号，出稿不受影响。
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
  wechatReady,
  onConfigureWechat,
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
  /** 公众号凭据是否就绪（与 StartupCard 同判据）；false 时推送改走配置引导。 */
  wechatReady: boolean;
  onConfigureWechat: () => void;
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
          { id: 'push', label: wechatReady ? '推草稿箱' : '配好公众号就能一键发', icon: <Icon name="send" size={16} /> },
          { id: 'schedule', label: wechatReady ? '推草稿箱并定时…' : '配好公众号才能定时发', icon: <Icon name="calendar-clock" size={16} /> },
        ]}
        onSelect={(id) => {
          setPushMenuOpen(false);
          // 无凭据时两项都改走配置引导：定时任务到点也要推草稿箱，建了必然失败。
          if (!wechatReady) {
            onConfigureWechat();
            return;
          }
          if (id === 'push') onPush();
          else onSchedule();
        }}
        onClose={() => setPushMenuOpen(false)}
        align="end"
      />
    </div>
  );
}
