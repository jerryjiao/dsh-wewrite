import { WewriteApp } from './App';
import type { ClientContext, WewriteViewProps } from './lib/context';
import { createRpc } from './lib/rpc';
import { LOCALE_NAMESPACE, en, zh } from './lib/i18n';

/**
 * WeWrite client 入口（宿主 Cordis 调 apply(ctx)）。
 *
 * - ctx.slots.register：conversation.view 挂 WeWrite 工作台 tab（id 'wewrite'、label 写作台）。
 *   注册失败降级 console.warn（平台防御：宿主 slot 面变化不炸插件）。
 * - ctx.locale.register：zh/en 词典（zh 为主，en 结构预留）。
 * - ctx.effect 登记清理：宿主停用时反注册 tab 与词典。
 */

function warnDegraded(action: string, error: unknown): void {
  console.warn(`[dsh-wewrite] ${action} 失败，已降级跳过`, error);
}

// 宿主 loader 契约（dsh-automation 真身同款）：ctx 服务访问权由 inject 数组授予，
// 缺声明即 "cannot get property X without inject"（2026-08-19 实拍踩中）。
export const name = 'dsh-wewrite-client';
export const inject = ['slots', 'locale', 'connection'];

export function apply(ctx: ClientContext): void {
  let disposeLocale: (() => void) | undefined;
  let fallbackT: (key: string) => string;
  try {
    disposeLocale = ctx.locale.register(LOCALE_NAMESPACE, { zh, en });
    fallbackT = ctx.locale.bind(LOCALE_NAMESPACE);
  } catch (error) {
    warnDegraded('locale.register', error);
    fallbackT = (key) => key;
  }

  const rpc = createRpc(ctx);

  function View(props: WewriteViewProps) {
    return <WewriteApp rpc={rpc} t={props.t ?? fallbackT} />;
  }

  let disposeSlot: (() => void) | undefined;
  try {
    disposeSlot = ctx.slots.register(
      {
        name: 'conversation.view',
        id: 'wewrite',
        order: 50,
        locale: 'zh',
        label: () => fallbackT('panel.label'),
        inject: (sessionId: string) => ({ sessionId }),
      },
      View,
    );
  } catch (error) {
    warnDegraded('slots.register（conversation.view）', error);
  }

  ctx.effect(
    () => () => {
      disposeSlot?.();
      disposeLocale?.();
    },
    'wewrite-client',
  );
}
