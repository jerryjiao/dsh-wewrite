import { useEffect, useRef, useState } from 'react';
import { WewriteApp } from './App';
import type { ClientContext, SidebarFooterActionProps, WewriteViewProps } from './lib/context';
import { createRpc } from './lib/rpc';
import { Icon } from './components/Icon';
import { LOCALE_NAMESPACE, en, zh } from './lib/i18n';

/**
 * WeWrite client 入口（宿主 Cordis 调 apply(ctx)）。
 *
 * - ctx.slots.register 三路（v0.3 R2 起）：
 *   1) conversation.view：会话内工作台 tab（id 'wewrite'、label 写作台，双入口保留）。
 *   2) sidebar.footer.action：宿主侧栏 footer「写作台」入口（官方 wide prop 双形态）。
 *   3) shell.overlay：写作台全屏浮层（closed 渲染 null，open 内嵌完整 WewriteApp）。
 *   各注册独立 try/catch，失败降级 console.warn（平台防御：宿主 slot 面变化不炸插件）。
 * - ctx.locale.register：zh/en 词典（zh 为主，en 结构预留）。
 * - ctx.effect 登记清理：宿主停用时反注册全部 slot 与词典。
 */

function warnDegraded(action: string, error: unknown): void {
  console.warn(`[dsh-wewrite] ${action} 失败，已降级跳过`, error);
}

// ── 浮层开合桥（v0.3 R2） ──────────────────────────────────────────────────────
// 入口按钮（sidebar footer）与浮层（shell.overlay）由宿主挂在不同容器，不共享
// React 树——用最小模块级事件桥同步开合态（自选最朴素方案，无状态库）。
let overlayOpen = false;
const overlayListeners = new Set<() => void>();
/** 入口按钮 DOM 引用：浮层关闭时还原焦点（设计师 advisory）。 */
let entryButtonEl: HTMLButtonElement | null = null;

function setOverlayOpen(next: boolean): void {
  if (overlayOpen === next) return;
  overlayOpen = next;
  overlayListeners.forEach((listener) => listener());
}

function useOverlayOpen(): boolean {
  const [open, setOpen] = useState(overlayOpen);
  useEffect(() => {
    const listener = () => setOpen(overlayOpen);
    overlayListeners.add(listener);
    return () => {
      overlayListeners.delete(listener);
    };
  }, []);
  return open;
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

  function View(_props: WewriteViewProps) {
    // 宿主 props.t 绑定的是 common 命名空间（查不到我们的键会回显裸键）——
    // 面板一律用本插件命名空间的 fallbackT（2026-08-19 实测：tab.home 等裸键回显根因）。
    return <WewriteApp rpc={rpc} t={fallbackT} />;
  }

  // 侧边栏入口（§D3-2/D3-3）：wide = pen-line 16 + 「写作台」整行；rail = 36px 圆 icon-only。
  // 宿主 sidebar 域在 .dsh-wewrite-panel 之外，token 作用域由 tokens.css 的
  // .ww-sidebar-entry/.ww-overlay 选择器扩展承载（不带 dsh-wewrite-panel 类——
  // base.css 对该类附加 min-height:320px 布局，会撑爆 footer 行）。
  function WewriteSidebarEntry({ wide }: SidebarFooterActionProps) {
    const open = useOverlayOpen();
    return (
      <div className={wide ? 'ww-sidebar-entry' : 'ww-sidebar-entry ww-sidebar-entry--rail'}>
        <button
          type="button"
          className="ww-sidebar-entry__btn"
          data-testid="ww-sidebar-entry"
          aria-label="打开写作台"
          aria-expanded={open}
          ref={(node) => {
            entryButtonEl = node;
          }}
          onClick={() => setOverlayOpen(!overlayOpen)}
        >
          <Icon name="pen-line" size={wide ? 16 : 20} />
          {wide ? <span className="ww-sidebar-entry__label">{fallbackT('panel.label')}</span> : null}
        </button>
      </div>
    );
  }

  // 全屏浮层（§D3-2/D3-3）：closed 渲染 null；open = head（chrome 白条）+ 完整 WewriteApp。
  // Escape 关闭；打开时 focus 收起钮，关闭还原入口钮（设计师 advisory）。
  function WewriteOverlay() {
    const open = useOverlayOpen();
    const closeRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
      if (open) closeRef.current?.focus();
      else entryButtonEl?.focus();
    }, [open]);

    if (!open) return null;
    return (
      <div
        className="ww-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="写作台"
        data-testid="ww-overlay"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOverlayOpen(false);
        }}
      >
        <header className="ww-overlay__head">
          <Icon name="pen-line" size={16} />
          <h2 className="ww-overlay__title">{fallbackT('panel.label')}</h2>
          <span className="ww-overlay__spacer" />
          <span className="ww-overlay__esc">Esc 收起</span>
          <button
            type="button"
            className="ww-overlay__close"
            data-testid="ww-overlay__close"
            aria-label="收起写作台"
            ref={closeRef}
            onClick={() => setOverlayOpen(false)}
          >
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="ww-overlay__body">
          <WewriteApp rpc={rpc} t={fallbackT} />
        </div>
      </div>
    );
  }

  let disposeSlot: (() => void) | undefined;
  let disposeFooter: (() => void) | undefined;
  let disposeOverlay: (() => void) | undefined;
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
  try {
    disposeFooter = ctx.slots.register(
      { name: 'sidebar.footer.action', id: 'wewrite', order: 100, label: () => fallbackT('panel.label') },
      WewriteSidebarEntry,
    );
  } catch (error) {
    warnDegraded('slots.register（sidebar.footer.action）', error);
  }
  try {
    disposeOverlay = ctx.slots.register(
      { name: 'shell.overlay', id: 'wewrite', order: 100, label: () => fallbackT('panel.label') },
      WewriteOverlay,
    );
  } catch (error) {
    warnDegraded('slots.register（shell.overlay）', error);
  }

  ctx.effect(
    () => () => {
      disposeSlot?.();
      disposeFooter?.();
      disposeOverlay?.();
      disposeLocale?.();
      setOverlayOpen(false);
    },
    'wewrite-client',
  );
}
