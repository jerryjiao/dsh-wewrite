import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '../lib/context';
import type { Route } from '../lib/router';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/**
 * 顶栏（TopBar，uiux-workbench-delta §1-1，由 v0.1 PanelTabBar 改造）：
 * 4 导航对象 = 3 Tab（写作/选题/定时）+ 设置齿轮；右端区 = 进度点(运行中) + 公众号连接状态。
 * 高 40px（--ww-toolrow-h）；Tab 激活 = 500 字重 + 下沿 2px accent 指示条；
 * 页面导航用 nav + aria-current="page"（无 tabpanel 配对，不用 tablist）。
 * Bluewash（uiux-color-theme-design §4-1）：button.ww-tab 带 data-view 域属性，
 * 激活段按域分色（写作=accent 蓝 / 选题=橙 / 定时=青，topbar.css）。
 */

const TABS: ReadonlyArray<{ key: 'home' | 'hotspots' | 'schedule'; labelKey: 'topbar.write' | 'topbar.hotspots' | 'topbar.schedule'; icon: IconName; view: 'writing' | 'topics' | 'schedule' }> = [
  { key: 'home', labelKey: 'topbar.write', icon: 'pen-line', view: 'writing' },
  { key: 'hotspots', labelKey: 'topbar.hotspots', icon: 'flame', view: 'topics' },
  { key: 'schedule', labelKey: 'topbar.schedule', icon: 'calendar-clock', view: 'schedule' },
];

export interface WechatConnection {
  configured: boolean;
  loading: boolean;
}

export function TopBar({
  route,
  t,
  connection,
  generating,
  progressCardOpen,
  onToggleProgressCard,
  onNavigate,
}: {
  route: Route;
  t: Translate;
  connection: WechatConnection;
  generating: boolean;
  progressCardOpen: boolean;
  onToggleProgressCard: () => void;
  onNavigate: (route: Route) => void;
}) {
  // article 是工作区聚焦态（写作 Tab 激活）；articles 已在 navigate 处重写，此处兜底归 home。
  const activeKind = route.kind === 'home' || route.kind === 'article' || route.kind === 'articles' ? 'home' : route.kind;

  return (
    <header className="ww-topbar" data-testid="ww-topbar">
      <nav className="ww-topbar__nav" aria-label="WeWrite 导航">
        {TABS.map((tab) => {
          const isActive = tab.key === activeKind;
          return (
            <button
              key={tab.key}
              type="button"
              className={isActive ? 'ww-tab ww-tab--active' : 'ww-tab'}
              aria-current={isActive ? 'page' : undefined}
              data-view={tab.view}
              data-testid={`ww-topbar-tab-${tab.key}`}
              onClick={() => onNavigate({ kind: tab.key })}
            >
              <Icon name={tab.icon} size={16} />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </nav>
      <div className="ww-topbar__spacer" />
      {generating ? (
        <button
          type="button"
          className="ww-topbar__progress"
          data-testid="ww-progress-dot"
          aria-label="生成任务运行中，查看进度"
          aria-expanded={progressCardOpen}
          aria-controls="ww-progress-card"
          onClick={onToggleProgressCard}
        >
          <Icon name="loader-circle" size={16} className="ww-topbar__progress-icon" />
          <span>{t('topbar.generating')}</span>
        </button>
      ) : null}
      <button
        type="button"
        className="ww-topbar__conn"
        data-testid="ww-topbar-conn"
        onClick={() => onNavigate({ kind: 'settings' })}
        aria-label={connection.configured ? '公众号已连接，打开设置' : '公众号未配置，打开设置'}
      >
        <StateDot state={connection.configured ? 'done' : 'warning'} />
        <span>{connection.configured ? t('state.connected') : t('state.disconnected')}</span>
        <Icon name="message-circle" size={16} />
      </button>
      <button
        type="button"
        className="ww-topbar__settings"
        data-testid="ww-topbar-settings"
        aria-label="设置"
        aria-current={route.kind === 'settings' ? 'page' : undefined}
        onClick={() => onNavigate({ kind: 'settings' })}
      >
        <Icon name="settings" size={16} />
      </button>
    </header>
  );
}
