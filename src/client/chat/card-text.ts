import { zh } from '../lib/i18n';
import type { WewriteLocaleKey } from '../lib/i18n';
import type { Translate } from '../lib/context';

/**
 * 聊天卡文案出口（坑#dsh-slot-props-t）：
 * 宿主塞给 slot 组件的 props.t 绑定的是 common 命名空间（查不到我们的键会回显
 * 裸键），卡片一律走本插件 ns 的 bind 结果——registerChat 装配时
 * setCardTranslator(ctx.locale.bind('wewrite'))，组件渲染时读该绑定；
 * 未装配（单测/降级）时回退 zh 词典原文。
 */

let bound: Translate | undefined;

export function setCardTranslator(t: Translate): void {
  bound = t;
}

export type CardT = (key: WewriteLocaleKey, params?: Record<string, unknown>) => string;

/** {name} 占位符替换（宿主 locale bind 已插值的串再过一遍是无害 no-op）。 */
function interpolate(text: string, params?: Record<string, unknown>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** 组件内取文案：显式 t（QA 契约的可选 props.t，已由我方注入本插件 ns）优先。 */
export function cardT(t?: Translate): CardT {
  if (t) return t;
  return (key, params) => interpolate(bound ? bound(key, params) : (zh[key] ?? key), params);
}
