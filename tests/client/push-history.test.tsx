// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PushHistorySection } from '@/client/components/PushHistorySection';
import { formatShortDateTime } from '@/client/lib/format';
import type { WewriteRpc } from '@/client/lib/rpc';
import type { PushEvent } from '@/shared/contract';

/**
 * 「最近推送」小节组件测试（v0.5.6 留痕展示面）：
 * mock wechat/pushEvents RPC，钉定四件事——列表渲染、空态、失败 reason 文案、加载失败兜底。
 * 时间断言用 formatShortDateTime 自身算期望值：组件换格式化函数时测试会立刻暴露。
 */

function makeRpc(impl: (endpoint: string, payload?: unknown) => Promise<unknown>): WewriteRpc {
  return { call: vi.fn(impl) } as unknown as WewriteRpc;
}

function event(partial: Partial<PushEvent>): PushEvent {
  return {
    id: `push_${Math.random().toString(36).slice(2, 8)}`,
    articleId: 'art_x',
    articleTitle: '一篇稿',
    occurredAt: '2026-08-18T12:00:00.000Z',
    durationMs: 1000,
    ok: true,
    message: '已进草稿箱',
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PushHistorySection：列表渲染', () => {
  it('成功与失败混排：时间/标题/成败标记齐，失败附 reason 文案；RPC 参数是 limit 5', async () => {
    const rpc = makeRpc(async () => [
      event({ id: 'push_ok', articleTitle: '稿A', occurredAt: '2026-08-18T12:00:00.000Z', ok: true }),
      event({ id: 'push_fail', articleTitle: '稿B', occurredAt: '2026-08-18T13:05:00.000Z', ok: false, reason: 'cover-missing', message: '缺封面' }),
    ]);

    render(<PushHistorySection rpc={rpc} />);

    // RPC 口径钉死：wechat/pushEvents + limit 5（别悄悄改成拉全量）。
    expect(rpc.call).toHaveBeenCalledWith('wechat/pushEvents', { limit: 5 });

    // 时间走 format.ts 现成格式化器（MM-dd HH:mm），期望值用同一函数算，跨时区确定。
    expect(await screen.findByText(formatShortDateTime('2026-08-18T12:00:00.000Z'))).toBeTruthy();
    expect(screen.getByText(formatShortDateTime('2026-08-18T13:05:00.000Z'))).toBeTruthy();

    expect(screen.getByText('稿A')).toBeTruthy();
    expect(screen.getByText('稿B')).toBeTruthy();
    expect(screen.getByText('成功')).toBeTruthy();
    expect(screen.getByText('失败 · 缺封面')).toBeTruthy(); // reason → 平实中文一句话
    expect(screen.getAllByTestId('ww-push-history-row').length).toBe(2);
  });

  it('五种 reason 都有平实文案（契约枚举逐个对上，不加新枚举时兜底不空串）', async () => {
    const reasons = ['cover-missing', 'gates-not-passed', 'no-credentials', 'wechat-api', 'article-not-found'] as const;
    const rpc = makeRpc(async () =>
      reasons.map((reason, index) =>
        event({ id: `push_${reason}`, articleTitle: `稿-${reason}`, occurredAt: `2026-08-18T1${index}:00:00.000Z`, ok: false, reason }),
      ),
    );

    render(<PushHistorySection rpc={rpc} />);

    expect(await screen.findByText('失败 · 缺封面')).toBeTruthy();
    expect(screen.getByText('失败 · 门禁未过')).toBeTruthy();
    expect(screen.getByText('失败 · 没配公众号凭据')).toBeTruthy();
    expect(screen.getByText('失败 · 微信接口拒绝')).toBeTruthy();
    expect(screen.getByText('失败 · 文章不存在')).toBeTruthy();
  });
});

describe('PushHistorySection：空态与失败兜底', () => {
  it('空列表：显示「还没有推送记录。」', async () => {
    const rpc = makeRpc(async () => []);
    render(<PushHistorySection rpc={rpc} />);
    expect(await screen.findByTestId('ww-push-history-empty')).toBeTruthy();
    expect(screen.getByText('还没有推送记录。')).toBeTruthy();
  });

  it('RPC 抛错：显示「推送记录暂时读不到。」，不向上炸、不渲染半截列表', async () => {
    const rpc = makeRpc(async () => {
      throw new Error('rpc channel closed');
    });
    render(<PushHistorySection rpc={rpc} />);
    expect(await screen.findByTestId('ww-push-history-error')).toBeTruthy();
    expect(screen.getByText('推送记录暂时读不到。')).toBeTruthy();
    expect(screen.queryByTestId('ww-push-history-row')).toBeNull();
  });

  it('宿主违约返回非数组：同样按「读不到」降级，不渲染脏数据', async () => {
    const rpc = makeRpc(async () => undefined);
    render(<PushHistorySection rpc={rpc} />);
    expect(await screen.findByTestId('ww-push-history-error')).toBeTruthy();
  });
});
