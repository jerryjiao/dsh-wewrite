/**
 * 面板内路由（状态路由，不引 router 库）。
 * v0.2 工作区范式（uiux-workbench-delta §1-8）：
 *   home    = 写作工作区（rail + 主区，主区默认载入最近编辑一篇；零文章 → StartupCard）
 *   article = 工作区聚焦态（主区载入指定文章，rail 高亮该行）
 *   articles 已废弃——navigate 收到一律重写为 home（老书签兼容壳）
 */

export type Route =
  | { kind: 'home' }
  | { kind: 'hotspots' }
  | { kind: 'articles' }
  | { kind: 'article'; id: string }
  | { kind: 'schedule' }
  | { kind: 'settings' };

/** 「/」 '/hotspots' '/articles' '/articles/:id' '/schedule' '/settings' 语义的纯数据形态。 */
export function navigateHome(): Route {
  return { kind: 'home' };
}

/** 旧路由兼容重写（delta §1-8）：articles → home；代码内不应再产生 articles 调用点。 */
export function normalizeRoute(route: Route): Route {
  return route.kind === 'articles' ? { kind: 'home' } : route;
}
