import { useEffect, useState } from 'react';
import type { WewriteRpc } from '../lib/rpc';
import { RUN_DETAIL_ENDPOINT, safeParseRunDetail, type RunDetail } from './meta';

/**
 * 运行卡进度轮询（ADR-013：client 轮询而非事件推送；architecture §5.2）。
 *
 * - active=true 时 3s 轮询 run/detail（对齐 App.tsx POLL_ACTIVE_MS 语义），
 *  挂载即取首帧；active=false（settled/replay）零请求。
 * - selector 二选一（@/shared/contract run/detail request union）：优先真 runId；
 *  只有 callId 时走 {callId}——host 侧 execute 已 bindRunCall(callId→runId)
 *  （run-tool.ts 锚点），presentCall 先于 execute 拿不到 runId 的断链由此闭合。
 * - D6 降级：RPC 失败/响应 schema 不符 → 静默保留末次快照（首帧失败 → undefined，
 *  卡片渲染「运行中」占位），绝不炸卡片；终态仍由 tool/result 驱动。
 * - selector 变更（重试新 run）先清旧快照，防上一 run 的进度串台。
 */

const POLL_ACTIVE_MS = 3000;

export type RunDetailSelector = { readonly runId: string } | { readonly callId: string };

function selectorKey(selector: RunDetailSelector | undefined): string {
  if (!selector) return '';
  return 'runId' in selector ? `runId:${selector.runId}` : `callId:${selector.callId}`;
}

export function useRunDetail(
  rpc: WewriteRpc,
  selector: RunDetailSelector | undefined,
  active: boolean,
): RunDetail | undefined {
  const [detail, setDetail] = useState<RunDetail | undefined>(undefined);
  const key = selectorKey(selector);

  // selector 变更（重试新 run）先清旧快照，防上一 run 的进度串台。
  useEffect(() => {
    setDetail(undefined);
  }, [key]);

  useEffect(() => {
    if (!active || !selector) return;
    let disposed = false;
    let latest: RunDetail | undefined;
    const take = (value: RunDetail | undefined) => {
      // 失败保留末次快照（D6）：只有拿到合法新帧才覆盖。
      if (value) latest = value;
      if (!disposed && latest) setDetail(latest);
    };
    const fetchOnce = () => {
      rpc
        .call<unknown>(RUN_DETAIL_ENDPOINT, selector)
        .then((raw) => take(safeParseRunDetail(raw)))
        .catch(() => {
          /* D6：静默降级，保留末次快照 */
        });
    };
    fetchOnce();
    const timer = window.setInterval(fetchOnce, POLL_ACTIVE_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [rpc, key, active]);

  return detail;
}
