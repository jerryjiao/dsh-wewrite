import { describe, expect, it, vi } from 'vitest';
import type { ClientContext } from '@/client/lib/context';
import { registerSlot } from '@/client/lib/slot-register';

/**
 * 0.2.2 起 slots.register 需 slot 已声明：有 inject 时必须延后注册，
 * 旧宿主（无 inject）保持直接注册。
 */

describe('registerSlot', () => {
  it('slots 带 inject：register 延后到 inject 回调，disposer 来自 inject', () => {
    const disposeInject = vi.fn();
    const inject = vi.fn((_key: string, _callback: () => () => void) => disposeInject);
    const register = vi.fn(() => vi.fn());
    const ctx = { slots: { register: vi.fn(), inject } } as unknown as ClientContext;

    const dispose = registerSlot(ctx, 'sidebar.footer.action', register);

    expect(inject).toHaveBeenCalledWith('sidebar.footer.action', register);
    expect(register).not.toHaveBeenCalled();

    // 宿主声明到位后，inject 回调里才注册。
    inject.mock.calls[0]![1]();
    expect(register).toHaveBeenCalledTimes(1);

    dispose();
    expect(disposeInject).toHaveBeenCalledTimes(1);
  });

  it('slots 不带 inject：直接调 register，返回其 disposer', () => {
    const disposeRegister = vi.fn();
    const register = vi.fn(() => disposeRegister);
    const ctx = { slots: { register: vi.fn() } } as unknown as ClientContext;

    const dispose = registerSlot(ctx, 'shell.overlay', register);

    expect(register).toHaveBeenCalledTimes(1);
    dispose();
    expect(disposeRegister).toHaveBeenCalledTimes(1);
  });
});
