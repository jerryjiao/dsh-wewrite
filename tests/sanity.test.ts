import { describe, expect, it } from 'vitest';

// 用途：验证 vitest runner 本身工作正常（恒绿哨兵）。
// 本文件不依赖任何 src/ 模块——它必须在任何实现存在之前就通过。
describe('sanity', () => {
  it('runner 基本断言工作正常', () => {
    expect([1, 2, 3].reduce((a, b) => a + b, 0)).toBe(6);
    expect(typeof fetch).toBe('function');
    expect(typeof AbortController).toBe('function');
    expect(typeof FormData).toBe('function');
  });

  it('Node 全局按 engines 门（>=22.19）可用', () => {
    const [major, minor] = process.versions.node.split('.').map((x) => Number(x));
    expect(major === 22 ? minor >= 19 : major > 22).toBe(true);
  });
});
