import { useEffect, useState } from 'react';

/**
 * 浮层开合桥（v0.3 R2 起，chat-integration M2 自 index.tsx 抽取并扩展 intent 面）。
 *
 * 入口按钮（sidebar footer）、composer 按钮、聊天卡片与浮层（shell.overlay）由宿主
 * 挂在不同容器、不共享 React 树——用最小模块级事件桥同步开合态与定位意图
 * （自选最朴素方案，无状态库）。
 *
 * 行为保证（architecture §5.3 / §7 三条保证之二）：
 * - 无 intent 路径与 v0.3 抽取前逐字节等价（开合/订阅/焦点还原原样搬迁）；
 * - intent 一次性消费（consumeOverlayIntent 取走即清空，防重复跳转）；
 * - overlay 槽注册失败的环境（D3 三路 try/catch 之一失败）卡片按钮隐藏。
 */

export interface OverlayIntent {
  /** 定位目标文章（写作台 navigate({kind:'article',id}) 的 id）。 */
  readonly articleId?: string;
}

let overlayOpen = false;
const overlayListeners = new Set<() => void>();
/** 入口按钮 DOM 引用：浮层关闭时还原焦点（设计师 advisory）。 */
let entryButtonEl: HTMLButtonElement | null = null;

let overlayIntent: OverlayIntent | undefined;
const overlayIntentListeners = new Set<() => void>();
/** overlay 槽是否注册成功（默认乐观 true；index.tsx 注册失败时翻 false，D3）。 */
let overlayAvailable = true;

export function setOverlayOpen(next: boolean): void {
  if (overlayOpen === next) return;
  overlayOpen = next;
  overlayListeners.forEach((listener) => listener());
}

/** 读当前开合态（入口按钮 toggle 语义：点击时读现值取反）。 */
export function isOverlayOpen(): boolean {
  return overlayOpen;
}

export function setOverlayEntryButtonEl(node: HTMLButtonElement | null): void {
  entryButtonEl = node;
}

export function focusOverlayEntry(): void {
  entryButtonEl?.focus();
}

export function markOverlayAvailable(available: boolean): void {
  overlayAvailable = available;
}

export function isOverlayAvailable(): boolean {
  return overlayAvailable;
}

/** 聊天卡片动作入口：开浮层 + 记录定位意图（AC-M2-04）。 */
export function openOverlayWithArticle(articleId: string): void {
  overlayIntent = { articleId };
  setOverlayOpen(true);
  // 先存意图再广播：已挂载的 WewriteApp 订阅者收到通知即消费；
  // 浮层刚打开、App 尚未挂载时意图留存，由挂载时的一次性消费取走。
  overlayIntentListeners.forEach((listener) => listener());
}

/** 一次性消费当前 intent（取走即清空；QA 契约：第二次调用必须返回 undefined）。 */
export function consumeOverlayIntent(): OverlayIntent | undefined {
  const intent = overlayIntent;
  overlayIntent = undefined;
  return intent;
}

export function useOverlayOpen(): boolean {
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

/**
 * 写作台侧 intent 消费（architecture §5.3 第 2 步）：
 * 挂载即消费一次性 intent；overlay 已开、App 已挂载时的后续卡片点击经订阅消费。
 * 消费到 articleId → navigate({kind:'article',id})（既有纯状态路由）。
 */
export function useOverlayIntent(navigate: (route: { kind: 'article'; id: string }) => void): void {
  useEffect(() => {
    const applyIntent = () => {
      const intent = consumeOverlayIntent();
      if (intent?.articleId) navigate({ kind: 'article', id: intent.articleId });
    };
    applyIntent();
    overlayIntentListeners.add(applyIntent);
    return () => {
      overlayIntentListeners.delete(applyIntent);
    };
  }, [navigate]);
}
