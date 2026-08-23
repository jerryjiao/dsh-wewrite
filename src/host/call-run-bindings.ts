/**
 * callId→runId 内存映射（M2 运行卡 runId 断链修复，architecture §5.2 假设修正）：
 * presentCall 在 execute 之前执行、结构上拿不到 startRun 生成的 runId，前端运行卡的
 * 推导链是 args.runId→rawInput.runId→callId 兜底——host 侧在 execute 时把宿主
 * ToolExecutionInput.callId（rc.7 必填）绑定到 runId，run/detail 即可按 callId 反查。
 * 生命周期：进程内存（插件 dispose 随 service 消亡）；终态不主动清理（回放/晚查询安全），
 * 防膨胀用有界 FIFO——超上限淘汰最旧绑定。重复 bind 同 callId 刷新插入序（不翻倍占额）。
 */

export interface CallRunBindings {
  bind(callId: string, runId: string): void;
  resolve(callId: string): string | undefined;
  clear(): void;
  readonly size: number;
}

export const CALL_RUN_BINDINGS_LIMIT = 500;

export function createCallRunBindings(limit: number = CALL_RUN_BINDINGS_LIMIT): CallRunBindings {
  const map = new Map<string, string>();
  return {
    bind(callId: string, runId: string): void {
      if (!callId || !runId) return;
      if (!map.has(callId) && map.size >= limit) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.delete(callId);
      map.set(callId, runId);
    },
    resolve(callId: string): string | undefined {
      return map.get(callId);
    },
    clear(): void {
      map.clear();
    },
    get size(): number {
      return map.size;
    },
  };
}
