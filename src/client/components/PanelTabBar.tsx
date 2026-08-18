import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '../lib/context';
import type { Route } from '../lib/router';
import { Icon } from './Icon';

/**
 * 面板顶栏（PanelTabBar，DESIGN §4.2 自建件）：
 * 5 顶级 Tab + 右侧公众号连接状态。高 --ww-header-h 48px；
 * Tab 激活 = 500 字重 + 下沿 2px --ww-accent 指示条（全栏唯一 accent 位之一）。
 * 编辑器是文章库下钻态，不占 Tab（articles Tab 高亮）。
 */

const TAB_ROUTES = [
  { key: 'home', labelKey: 'tab.home' },
  { key: 'hotspots', labelKey: 'tab.hotspots' },
  { key: 'articles', labelKey: 'tab.articles' },
  { key: 'schedule', labelKey: 'tab.schedule' },
  { key: 'settings', labelKey: 'tab.settings' },
] as const;

type TabKey = (typeof TAB_ROUTES)[number]['key'];

function tabForRoute(route: Route): TabKey {
  return route.kind === 'article' ? 'articles' : route.kind;
}

export interface WechatConnection {
  configured: boolean;
  loading: boolean;
}

export function PanelTabBar({
  route,
  t,
  connection,
  onNavigate,
  onOpenSettings,
}: {
  route: Route;
  t: Translate;
  connection: WechatConnection;
  onNavigate: (route: Route) => void;
  onOpenSettings: () => void;
}) {
  const active = tabForRoute(route);
  return (
    <header className="ww-tabbar">
      <nav className="ww-tabbar__nav" aria-label="WeWrite 工作台导航">
        {TAB_ROUTES.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              className={isActive ? 'ww-tab ww-tab--active' : 'ww-tab'}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate({ kind: tab.key } as Route)}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        className="ww-tabbar__conn"
        onClick={onOpenSettings}
        aria-label={connection.configured ? '公众号已连接，打开设置' : '公众号未配置，打开设置'}
      >
        <StateDot state={connection.configured ? 'done' : 'warning'} />
        <span>{connection.configured ? t('state.connected') : t('state.disconnected')}</span>
        <Icon name="message-circle" size={16} />
      </button>
    </header>
  );
}
