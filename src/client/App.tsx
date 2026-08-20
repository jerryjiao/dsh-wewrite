import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from './lib/context';
import type { WewriteRpc } from './lib/rpc';
import { TopBar } from './components/TopBar';
import { PipelineStepper } from './components/PipelineStepper';
import { ProgressCard } from './components/ProgressCard';
import { ToastHost } from './components/Toast';
import { useStore, WewriteProvider } from './store';
import { WorkbenchPanel } from './panels/workbench-panel';
import { HotspotsPanel } from './panels/hotspots-panel';
import { SchedulePanel } from './panels/schedule-panel';
import { SettingsPanel } from './panels/settings-panel';
import './styles/tokens.css';
import './styles/base.css';
import './styles/topbar.css';
import './styles/rail.css';
import './styles/workbench.css';
import './styles/overlay.css';
import './styles/states.css';
import './styles/panels.css';
import './styles/settings.css';
import './styles/editor.css';
import './styles/preview.css';
import './styles/generation.css';

/**
 * 面板根组件：挂载根元素带 class="dsh-wewrite-panel"（--ww-* token 作用域）。
 * v0.2 工作区范式（uiux-workbench-delta §1-0）：
 * TopBar（4 导航对象）+ 内容区（工作区路由满铺 .ww-content--flush）
 * + 右下 ProgressCard + 首次提交全屏确认 GenerationLayer + Toast 栈。
 */

const NARROW_BREAKPOINT = 900;
const POLL_IDLE_MS = 10000;
const POLL_ACTIVE_MS = 3000;

function usePanelWidth(): { ref: RefObject<HTMLDivElement>; width: number } {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function GenerationLayer() {
  const store = useStore();
  const { generation, activeRun, retryGeneration, cancelGeneration, setGenerationOverlay, refreshSnapshot, toast, t } = store;
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (!activeRun || !generation) return;
    if (activeRun.status === 'succeeded' && announced.current !== activeRun.id) {
      announced.current = activeRun.id;
      toast.push({ kind: 'success', title: t('toast.generateDone'), detail: `《${generation.topic}》已生成，去写作台查看。` });
      void refreshSnapshot();
    }
  }, [activeRun, generation, refreshSnapshot, toast, t]);

  if (!generation || !generation.overlayOpen) return null;
  const terminal = activeRun !== undefined && ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(activeRun.status);

  return (
    <Modal
      open
      onClose={() => setGenerationOverlay(false)}
      title={`正在生成《${generation.topic}》`}
      closeLabel="关闭生成视图"
      contentClassName="ww-generation-modal"
    >
      <div aria-live="polite">
        {activeRun ? (
          <PipelineStepper
            run={activeRun}
            topic={generation.topic}
            onRetry={() => void retryGeneration()}
            onCancel={() => void cancelGeneration()}
            onBackground={() => setGenerationOverlay(false)}
            retrying={false}
          />
        ) : (
          <p className="ww-generation-modal__pending">已提交，等待宿主调度…</p>
        )}
        {terminal ? (
          <div className="ww-generation-modal__done">
            <Button variant="primary" size="sm" className="ww-btn-accent" onClick={() => setGenerationOverlay(false)}>
              收起
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function PanelBody() {
  const store = useStore();
  const { route } = store;
  switch (route.kind) {
    case 'home':
    case 'articles':
      return <WorkbenchPanel />;
    case 'article':
      return <WorkbenchPanel articleId={route.id} />;
    case 'hotspots':
      return <HotspotsPanel />;
    case 'schedule':
      return <SchedulePanel />;
    case 'settings':
      return <SettingsPanel />;
  }
}

export function WewriteApp({ rpc, t }: { rpc: WewriteRpc; t: Translate }) {
  const { ref, width } = usePanelWidth();
  const narrow = width < NARROW_BREAKPOINT;

  return (
    <div ref={ref} className="dsh-wewrite-panel ww-root">
      <WewriteProvider rpc={rpc} t={t} narrow={narrow}>
        <PanelChrome />
      </WewriteProvider>
    </div>
  );
}

function PanelChrome() {
  const store = useStore();
  const { route, navigate, snapshot, refreshSnapshot, toastMessages, dismissToast, generation, activeRun } = store;
  const [progressCardOpen, setProgressCardOpen] = useState(true);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const generating = generation !== null && activeRun !== undefined && (activeRun.status === 'queued' || activeRun.status === 'running');

  // 新 run 提交后进度卡回到展开默认（首次全屏确认收起后由卡接管）。
  const runId = generation?.runId;
  useEffect(() => {
    if (runId) setProgressCardOpen(true);
  }, [runId]);

  useEffect(() => {
    const period = generating ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const timer = window.setInterval(() => void refreshSnapshot(), period);
    return () => window.clearInterval(timer);
  }, [generating, refreshSnapshot]);

  const connection = useMemo(() => {
    if (snapshot.status !== 'ready') return { configured: false, loading: snapshot.status === 'loading' };
    const { settings, credentials } = snapshot.data.config;
    const secretConfigured = credentials['WEWRITE_WECHAT_SECRET']?.configured ?? false;
    return { configured: secretConfigured && settings.wechatAppId.length > 0, loading: false };
  }, [snapshot]);

  const workbenchRoute = route.kind === 'home' || route.kind === 'article' || route.kind === 'articles';

  return (
    <div className="ww-shell">
      <TopBar
        route={route}
        t={store.t}
        connection={connection}
        generating={generating}
        progressCardOpen={progressCardOpen}
        onToggleProgressCard={() => setProgressCardOpen((open) => !open)}
        onNavigate={navigate}
      />
      <main className={workbenchRoute ? 'ww-content ww-content--flush' : 'ww-content'} id="wewrite-panel-content">
        <PanelBody />
      </main>
      <ProgressCard open={progressCardOpen && !generation?.overlayOpen} onCollapse={() => setProgressCardOpen(false)} />
      <GenerationLayer />
      <ToastHost messages={toastMessages} onDismiss={dismissToast} />
      <span className="ww-sr-only" aria-live="polite">
        {generating ? '生成任务运行中' : ''}
      </span>
      <span className="ww-sr-only">{toastMessages.length > 0 ? toastMessages[toastMessages.length - 1].title : ''}</span>
    </div>
  );
}
