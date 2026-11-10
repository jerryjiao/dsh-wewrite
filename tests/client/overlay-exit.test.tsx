// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import type { ClientContext } from '@/client/lib/context';
import { apply } from '@/client/index';
import { isOverlayOpen, setOverlayOpen } from '@/client/chat/overlay-bridge';

/**
 * issue #2：浮层不得向宿主 shell.overlay 层写阻塞 DOM（入口会挡住宿主点击穿透），
 * 退出也不得依赖焦点落在浮层内。宿主 Modal 自带 portal + document 级 Escape。
 */

vi.mock('@/client/App', () => ({
  WewriteApp: () => <div data-testid="ww-stub-app" />,
}));

function makeCtx(): { ctx: ClientContext; overlay: () => ComponentType<Record<string, never>> } {
  let captured: ComponentType<Record<string, never>> | undefined;
  const ctx = {
    effect: () => {},
    connection: {
      rpc: {
        call: () => {
          throw new Error('rpc 不可达');
        },
      },
    },
    locale: {
      register: () => () => {},
      bind: () => (key: string) => key,
    },
    slots: {
      register: (options: { readonly name: string }, component: unknown) => {
        if (options.name === 'shell.overlay') captured = component as ComponentType<Record<string, never>>;
        return () => {};
      },
    },
  } as unknown as ClientContext;
  return {
    ctx,
    overlay: () => {
      if (!captured) throw new Error('shell.overlay 未注册');
      return captured;
    },
  };
}

afterEach(() => {
  // 模块级开合态复位，防跨用例串味。
  setOverlayOpen(false);
});

describe('写作台浮层退出（issue #2）', () => {
  it('Escape 关闭浮层，且打开时 shell.overlay 挂载容器内无 DOM', async () => {
    const { ctx, overlay } = makeCtx();
    apply(ctx);

    const Overlay = overlay();
    const { container } = render(<Overlay />);
    expect(isOverlayOpen()).toBe(false);

    act(() => {
      setOverlayOpen(true);
    });

    expect(isOverlayOpen()).toBe(true);
    // Modal portal 到 document.body → 宿主槽层容器保持空。
    expect(container.childNodes.length).toBe(0);
    expect(screen.getByTestId('ww-stub-app')).toBeTruthy();

    await userEvent.setup().keyboard('{Escape}');

    expect(isOverlayOpen()).toBe(false);
    expect(screen.queryByTestId('ww-stub-app')).toBeNull();
  });
});
