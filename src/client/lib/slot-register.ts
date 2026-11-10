import type { ClientContext } from './context';

/**
 * 0.2.2 起 slots.register 要求目标 slot 已被父条目声明（未声明直接抛
 * `slot "X" is not declared`），而插件 apply 早于宿主声明——故经
 * slots.inject 等声明到位再注册。旧宿主无 inject 时直接注册。
 */
export function registerSlot(
  ctx: ClientContext,
  name: string,
  register: () => () => void,
): () => void {
  if (typeof ctx.slots.inject !== 'function') return register();
  return ctx.slots.inject(name, register);
}
