import { useEffect, useState } from 'react';
import type { PushEvent } from '@/shared/contract';
import { formatShortDateTime } from '../lib/format';
import type { WewriteRpc } from '../lib/rpc';
import { Icon } from './Icon';

/**
 * 「最近推送」小节（v0.5.6 推送留痕的展示面）：挂在设置页公众号接入区块下。
 *
 * 为什么放设置页常驻：推送失败的 toast 关掉就无痕，用户没法复盘「上次为什么没进去」。
 * 这里拉最近 5 条留痕（成功与失败都记），失败附 reason 的一句话，平实中文不堆术语。
 * 留痕是只读展示：读不到只降级成一句提示，不连坐整页设置（不影响凭据配置本身）。
 */

/** reason → 平实一句话文案；未知 reason 兜底为「推送失败」，契约加枚举时 UI 不会开天窗。 */
const REASON_TEXT: Record<string, string> = {
  'cover-missing': '缺封面',
  'gates-not-passed': '门禁未过',
  'no-credentials': '没配公众号凭据',
  'wechat-api': '微信接口拒绝',
  'article-not-found': '文章不存在',
};

function reasonText(reason: string | undefined): string {
  if (!reason) return '推送失败';
  return REASON_TEXT[reason] ?? '推送失败';
}

type LoadState = 'loading' | 'ready' | 'error';

export function PushHistorySection({ rpc }: { rpc: WewriteRpc }) {
  const [events, setEvents] = useState<PushEvent[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    // cancelled 旗标：卸载后不再 setState（设置页切组会立刻卸载本小节）。
    let cancelled = false;
    rpc
      .call<PushEvent[]>('wechat/pushEvents', { limit: 5 })
      .then((rows) => {
        if (cancelled) return;
        // 宿主契约保证数组；防御非数组响应按「读不到」降级，不渲染脏数据。
        if (Array.isArray(rows)) {
          setEvents(rows);
          setState('ready');
        } else {
          setState('error');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  return (
    <div data-testid="ww-push-history">
      <h4 className="ww-settings__h">最近推送</h4>
      {state === 'error' ? (
        <p className="ww-field__note" data-testid="ww-push-history-error">推送记录暂时读不到。</p>
      ) : state === 'loading' ? (
        <p className="ww-field__note" data-testid="ww-push-history-loading">读取中…</p>
      ) : events.length === 0 ? (
        <p className="ww-field__note" data-testid="ww-push-history-empty">还没有推送记录。</p>
      ) : (
        // 列表复用 ww-field（flex 纵排），行复用 ww-settings__row，不引新样式类。
        <div className="ww-field">
          {events.map((event) => (
            <div key={event.id} className="ww-settings__row" data-testid="ww-push-history-row">
              <span className="ww-field__hint">{formatShortDateTime(event.occurredAt)}</span>
              <span>{event.articleTitle}</span>
              {event.ok ? (
                <span style={{ color: 'var(--ww-success)', display: 'inline-flex', alignItems: 'center', gap: 'var(--ww-space-1)' }}>
                  <Icon name="circle-check" size={16} /> 成功
                </span>
              ) : (
                <span style={{ color: 'var(--ww-danger)', display: 'inline-flex', alignItems: 'center', gap: 'var(--ww-space-1)' }}>
                  <Icon name="triangle-alert" size={16} /> 失败 · {reasonText(event.reason)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
