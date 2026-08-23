/**
 * client 组件测试 setup（chat-integration M2）：RTL 渲染清理。
 *
 * vitest globals=false → @testing-library/react 的自动 cleanup（依赖全局
 * afterEach）不生效，跨用例 DOM 累积会让 screen 全局查询命中上一用例的
 * 渲染（getByRole 多命中）。本 setup 仅在 jsdom 环境（document 存在）注册
 * afterEach(cleanup)，node 环境的 host/shared 测试零影响。
 */
import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
  });
}
