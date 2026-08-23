import { describe, expect, it } from 'vitest';
import { CALL_RUN_BINDINGS_LIMIT, createCallRunBindings } from '@/host/call-run-bindings';

/**
 * callId→runId 内存映射单测（M2 运行卡 runId 断链修复，architecture §5.2 假设修正）。
 * 语义：presentCall 先于 execute 拿不到 runId，前端按 args.runId→rawInput.runId→callId
 * 兜底——host 侧 execute 绑 callId→runId，run/detail 按 callId 反查。
 * 清理语义：终态不主动清（回放/晚查询安全），有界 FIFO 防膨胀，clear 全清（dispose）。
 */

describe('createCallRunBindings（bind/resolve 基本面）', () => {
  it('bind 后 resolve 返回 runId；未知 callId 返回 undefined', () => {
    const bindings = createCallRunBindings();
    bindings.bind('call_1', 'run_a');
    expect(bindings.resolve('call_1')).toBe('run_a');
    expect(bindings.resolve('call_unknown')).toBeUndefined();
  });

  it('同 callId 重复 bind 覆盖旧 runId 且不翻倍占额', () => {
    const bindings = createCallRunBindings(3);
    bindings.bind('call_1', 'run_a');
    bindings.bind('call_1', 'run_b');
    expect(bindings.resolve('call_1')).toBe('run_b');
    expect(bindings.size).toBe(1);
  });

  it('空串 callId 或 runId 拒绑（防御宿主异常值）', () => {
    const bindings = createCallRunBindings();
    bindings.bind('', 'run_a');
    bindings.bind('call_1', '');
    expect(bindings.size).toBe(0);
    expect(bindings.resolve('call_1')).toBeUndefined();
  });

  it('FIFO 淘汰：超上限时最旧绑定被淘汰，最近保持可查（默认上限 500 条）', () => {
    const bindings = createCallRunBindings();
    for (let index = 0; index < CALL_RUN_BINDINGS_LIMIT; index += 1) {
      bindings.bind(`call_${index}`, `run_${index}`);
    }
    bindings.bind('call_new', 'run_new');
    expect(bindings.size).toBe(CALL_RUN_BINDINGS_LIMIT);
    expect(bindings.resolve('call_0'), '最旧绑定应被淘汰').toBeUndefined();
    expect(bindings.resolve('call_1')).toBe('run_1');
    expect(bindings.resolve('call_new')).toBe('run_new');
  });

  it('clear 全清（dispose 语义）：清空后 resolve 一律 undefined，可重新 bind', () => {
    const bindings = createCallRunBindings();
    bindings.bind('call_1', 'run_a');
    bindings.clear();
    expect(bindings.size).toBe(0);
    expect(bindings.resolve('call_1')).toBeUndefined();
    bindings.bind('call_1', 'run_b');
    expect(bindings.resolve('call_1')).toBe('run_b');
  });
});
