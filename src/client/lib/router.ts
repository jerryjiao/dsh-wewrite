/**
 * 面板内路由（状态路由，不引 router 库）。
 * 6 视图 = 5 顶级 Tab + 编辑器（文章库下钻态，显式返回）。
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
