// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastHost, type ToastMessage } from '@/client/components/Toast';

/**
 * Toast openUrl 行为（推送成功的「去公众号后台」出口）：
 * - 只有 openUrl：动作按钮点击 = window.open(url, '_blank', 'noopener')；
 * - onAction 优先：两者都在时只执行 onAction（面板内跳转不受外链干扰）；
 * - 无动作：不渲染按钮，结构与样式不变。
 */

const user = userEvent.setup();

function message(partial: Partial<Omit<ToastMessage, 'id'>>): ToastMessage {
  return { id: 1, kind: 'success', title: '已进草稿箱', ...partial };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ToastHost：openUrl 动作', () => {
  it('只有 openUrl 时点动作按钮，新开外链（noopener）', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onDismiss = vi.fn();
    render(
      <ToastHost
        messages={[message({ detail: '到公众号后台检查排版与封面，群发在后台手动执行', actionLabel: '去公众号后台', openUrl: 'https://mp.weixin.qq.com/' })]}
        onDismiss={onDismiss}
      />,
    );
    await user.click(screen.getByRole('button', { name: '去公众号后台' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://mp.weixin.qq.com/', '_blank', 'noopener');
  });

  it('onAction 与 openUrl 并存时 onAction 优先，不触发 window.open', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onAction = vi.fn();
    render(
      <ToastHost
        messages={[message({ actionLabel: '去设置', onAction, openUrl: 'https://example.com/' })]}
        onDismiss={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: '去设置' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('无 actionLabel/onAction/openUrl 时不渲染动作按钮，关闭按钮仍在', () => {
    render(<ToastHost messages={[message({})]} onDismiss={vi.fn()} />);
    expect(screen.getByRole('button', { name: '关闭提示' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '去公众号后台' })).toBeNull();
  });
});
