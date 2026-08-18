import { useEffect } from 'react';
import { Icon } from './Icon';

/**
 * 面板内 Toast（官方 primitives 0.0.1-rc.1 无 Toast 导出——按 DESIGN.md §4.2 自建）。
 *
 * - 位置：面板右下角固定栈，z-index 走 --ww-z-toast。
 * - 可访问性：容器 aria-live="polite"（生成完成/推送结果屏幕阅读器播报，DESIGN §8）。
 * - 语义色走 --ww-success / --ww-danger / --ww-info；动作链接（如「去设置代理」）可选。
 */

export interface ToastMessage {
  id: number;
  kind: 'success' | 'error' | 'info';
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastApi {
  push(message: Omit<ToastMessage, 'id'>): void;
  dismiss(id: number): void;
}

const TOAST_LIVE_MS = 6000;

export function ToastHost({ messages, onDismiss }: { messages: readonly ToastMessage[]; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (messages.length === 0) return;
    const timers = messages.map((message) => {
      const timer = window.setTimeout(() => onDismiss(message.id), TOAST_LIVE_MS);
      return () => window.clearTimeout(timer);
    });
    return () => {
      for (const clear of timers) clear();
    };
  }, [messages, onDismiss]);

  if (messages.length === 0) return null;
  return (
    <div className="ww-toasts" role="status" aria-live="polite">
      {messages.map((message) => (
        <div key={message.id} className={`ww-toast ww-toast--${message.kind}`}>
          <Icon
            name={message.kind === 'success' ? 'circle-check' : message.kind === 'error' ? 'circle-alert' : 'sparkles'}
            size={16}
          />
          <div className="ww-toast__body">
            <p className="ww-toast__title">{message.title}</p>
            {message.detail ? <p className="ww-toast__detail">{message.detail}</p> : null}
          </div>
          {message.actionLabel && message.onAction ? (
            <button type="button" className="ww-toast__action" onClick={message.onAction}>
              {message.actionLabel}
            </button>
          ) : null}
          <button type="button" className="ww-toast__close" aria-label="关闭提示" onClick={() => onDismiss(message.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
