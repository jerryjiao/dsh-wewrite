import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { RunParams, SnapshotResponse } from '@/shared/contract';
import type { Translate } from './lib/context';
import type { WewriteRpc } from './lib/rpc';
import type { Route } from './lib/router';
import type { ToastApi, ToastMessage } from './components/Toast';

/**
 * 面板状态中枢：路由 + snapshot 订阅刷新 + Toast + 生成态 + 面板宽度断点。
 * 不引状态库（纪律）：单个 context provider 足够面板级状态量。
 */

export type SnapshotState =
  | { status: 'loading' }
  | { status: 'ready'; data: SnapshotResponse }
  | { status: 'error'; message: string };

export interface GenerationState {
  runId: string;
  topic: string;
  overlayOpen: boolean;
}

export interface WewriteStore {
  rpc: WewriteRpc;
  t: Translate;
  route: Route;
  navigate(route: Route): void;
  snapshot: SnapshotState;
  refreshSnapshot(): Promise<void>;
  toast: ToastApi;
  toastMessages: readonly ToastMessage[];
  dismissToast(id: number): void;
  generation: GenerationState | null;
  startGeneration(params: RunParams, topic: string): Promise<void>;
  retryGeneration(): Promise<void>;
  cancelGeneration(): Promise<void>;
  setGenerationOverlay(open: boolean): void;
  activeRun: SnapshotResponse['runs'][number] | undefined;
  narrow: boolean;
}

const StoreContext = createContext<WewriteStore | null>(null);

export function useStore(): WewriteStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore 必须在 WewriteProvider 内使用');
  return store;
}

export function WewriteProvider({ rpc, t, narrow, children }: { rpc: WewriteRpc; t: Translate; narrow: boolean; children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ kind: 'home' });
  const [snapshot, setSnapshot] = useState<SnapshotState>({ status: 'loading' });
  const [toastMessages, setToastMessages] = useState<readonly ToastMessage[]>([]);
  const [generation, setGeneration] = useState<GenerationState | null>(null);
  const toastSeq = useRef(0);
  const lastGenerationParams = useRef<{ params: RunParams; topic: string } | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToastMessages((messages) => messages.filter((message) => message.id !== id));
  }, []);

  const toast = useMemo<ToastApi>(
    () => ({
      push(message) {
        toastSeq.current += 1;
        const id = toastSeq.current;
        setToastMessages((messages) => [...messages.slice(-3), { ...message, id }]);
      },
      dismiss: dismissToast,
    }),
    [dismissToast],
  );

  const refreshSnapshot = useCallback(async () => {
    try {
      const data = await rpc.call<SnapshotResponse>('snapshot', {});
      setSnapshot({ status: 'ready', data });
    } catch (error) {
      setSnapshot({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [rpc]);

  const navigate = useCallback((next: Route) => setRoute(next), []);

  const startGeneration = useCallback(
    async (params: RunParams, topic: string) => {
      try {
        const { runId } = await rpc.call<{ runId: string }>('run/start', { params });
        lastGenerationParams.current = { params, topic };
        setGeneration({ runId, topic, overlayOpen: true });
        void refreshSnapshot();
      } catch (error) {
        toast.push({
          kind: 'error',
          title: '未能启动生成',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [rpc, refreshSnapshot, toast],
  );

  const retryGeneration = useCallback(async () => {
    const last = lastGenerationParams.current;
    if (!last) return;
    await startGeneration(last.params, last.topic);
  }, [startGeneration]);

  const cancelGeneration = useCallback(async () => {
    const current = generation;
    if (!current) return;
    try {
      await rpc.call<{ ok: boolean }>('run/cancel', { runId: current.runId });
      toast.push({ kind: 'info', title: '已取消生成' });
      setGeneration(null);
    } catch (error) {
      toast.push({ kind: 'error', title: '取消失败', detail: error instanceof Error ? error.message : String(error) });
    }
    void refreshSnapshot();
  }, [generation, rpc, refreshSnapshot, toast]);

  const setGenerationOverlay = useCallback((open: boolean) => {
    setGeneration((current) => (current ? { ...current, overlayOpen: open } : current));
  }, []);

  const activeRun = useMemo(() => {
    if (snapshot.status !== 'ready' || !generation) return undefined;
    return snapshot.data.runs.find((run) => run.id === generation.runId);
  }, [snapshot, generation]);

  const value = useMemo<WewriteStore>(
    () => ({
      rpc,
      t,
      route,
      navigate,
      snapshot,
      refreshSnapshot,
      toast,
      toastMessages,
      dismissToast,
      generation,
      startGeneration,
      retryGeneration,
      cancelGeneration,
      setGenerationOverlay,
      activeRun,
      narrow,
    }),
    [
      rpc,
      t,
      route,
      navigate,
      snapshot,
      refreshSnapshot,
      toast,
      toastMessages,
      dismissToast,
      generation,
      startGeneration,
      retryGeneration,
      cancelGeneration,
      setGenerationOverlay,
      activeRun,
      narrow,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
