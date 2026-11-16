import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PushDraftResult, RunParams } from '@/shared/contract';
import type { GateReportView } from '../components/GateReport';
import { gateStatusForArticle } from '../lib/gate';
import { countWords } from '../lib/format';
import { pushOutcomeToToast } from '../lib/push-outcome';
import { describeRpcFailure } from '../lib/rpc';
import { articleStatusBadge, CodeChip, ErrorNote, SkeletonBlock, StatusBadge } from '../components/bits';
import { ScheduleForm } from '../components/ScheduleForm';
import { EditorWorkbench } from '../components/editor/EditorWorkbench';
import { PreviewCanvas } from '../components/editor/PreviewCanvas';
import { StatusStrip } from '../components/editor/StatusStrip';
import { EditorHeadActions } from '../components/editor/EditorHeadActions';
import type { EditorView } from '../components/editor/EditorHeadActions';
import { CoverControl } from '../components/editor/CoverControl';
import { EditorSplitter, splitColumns } from '../components/editor/Splitter';
import { useArticleDoc } from '../components/editor/useArticleDoc';
import { GateOverlayPanel } from '../components/GateOverlayPanel';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

/**
 * 编辑器（DESIGN §9.4 + uiux-workbench-delta §1-6/§1-7）：v0.2 起嵌入工作区主区。
 * 页头单行（rail toggle/下拉 + 标题 + 状态 | 三视图分段 + ⋯管理 + 推草稿箱 ▾ CTA）→ 主区三视图（仅编辑/双栏可拖/仅预览缩放档）
 * → StatusStrip（含门禁 chip 入口）+ GateOverlayPanel 右缘滑出（非模态）。保存状态唯一出口 = StatusStrip 右侧。
 */

const VIEW_STORAGE_KEY = 'ww.editor.view';
const SPLIT_STORAGE_KEY = 'ww.editor.split';

function readStoredView(): EditorView | undefined {
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return raw === 'edit' || raw === 'split' || raw === 'preview' ? raw : undefined;
  } catch {
    return undefined;
  }
}

function readStoredSplit(): number {
  try {
    const raw = Number.parseFloat(window.localStorage.getItem(SPLIT_STORAGE_KEY) ?? '');
    return Number.isFinite(raw) && raw > 0.15 && raw < 0.85 ? raw : 0.55;
  } catch {
    return 0.55;
  }
}
export function EditorPanel({
  articleId,
  leading,
  gateOpen,
  onGateOpenChange,
}: {
  articleId: string;
  leading: ReactNode;
  gateOpen: boolean;
  onGateOpenChange: (open: boolean) => void;
}) {
  const store = useStore();
  const { rpc, navigate, narrow, refreshSnapshot, toast, t, snapshot, startGeneration } = store;

  const doc = useArticleDoc(rpc, articleId);
  const { article } = doc;

  const [view, setView] = useState<EditorView>(readStoredView() ?? (narrow ? 'edit' : 'split'));
  const [splitRatio, setSplitRatio] = useState(readStoredSplit);
  const [zoom, setZoom] = useState(1);
  const [pushing, setPushing] = useState(false);
  const [gateBlockOpen, setGateBlockOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [fixing, setFixing] = useState(false);

  const gateReport: GateReportView | undefined = undefined; // 契约 v0.1 RunSummary 无 gates 步明细，分数/规则型报告待扩展后接入

  const gateStatus = useMemo(() => {
    const runs = snapshot.status === 'ready' ? snapshot.data.runs : [];
    return gateStatusForArticle(runs, { id: articleId, lastRunId: article?.lastRunId });
  }, [snapshot, articleId, article]);

  // 公众号凭据就绪判据与 StartupCard 一致；未就绪只拦推送、不影响出稿。
  const wechatReady =
    snapshot.status === 'ready' &&
    (snapshot.data.config.credentials['WEWRITE_WECHAT_SECRET']?.configured ?? false) &&
    snapshot.data.config.settings.wechatAppId.length > 0;

  async function pushDraft() {
    if (!article || pushing) return;
    setPushing(true);
    try {
      // v0.5.6：推送结果是数据面 union（失败不再抛 RPC 异常），分类/出路在 failure 里。
      const result = await rpc.call<PushDraftResult>('wechat/pushDraft', { articleId: article.id });
      // 数据面不再需要 describeRpcFailure 兜底；网络层异常仍走 catch 的通用文案。
      toast.push(pushOutcomeToToast(result, { navigate: () => navigate({ kind: 'settings' }) }));
      if (result.ok) await refreshSnapshot();
    } catch (error) {
      const failure = describeRpcFailure(error);
      toast.push({
        kind: 'error',
        title: failure.title,
        detail: failure.hint,
        actionLabel: failure.ipWhitelist ? t('action.goSettingsProxy') : undefined,
        onAction: failure.ipWhitelist ? () => navigate({ kind: 'settings' }) : undefined,
      });
    } finally {
      setPushing(false);
    }
  }

  function requestPush() {
    if (!article) return;
    if (gateStatus.blocking) {
      setGateBlockOpen(true);
      return;
    }
    void pushDraft();
  }

  async function runFix() {
    if (!article) return;
    setFixing(true);
    const params: RunParams = {
      topicMode: 'fixed',
      topic: article.title,
      theme: article.theme,
      // 不传 imageCount：宿主缺省按 1 跑（DEFAULT_IMAGE_COUNT）→ 修复运行必产封面；此前传 0 会产出无封面稿，推草稿箱永远被门禁卡死。
    };
    await startGeneration(params, article.title);
    setFixing(false);
  }

  async function submitSchedule(request: { name: string; rrule: string; timeZone: string }) {
    if (!article) return;
    setScheduleBusy(true);
    try {
      await rpc.call('schedule/save', {
        name: request.name,
        rrule: request.rrule,
        timeZone: request.timeZone,
        params: { topicMode: 'fixed', topic: article.title, theme: article.theme },
        enabled: true,
      });
      toast.push({ kind: 'success', title: '已排期', detail: '到点自动跑稿；推送草稿箱要手动执行。' });
      setScheduleOpen(false);
      await refreshSnapshot();
    } catch (error) {
      toast.push({ kind: 'error', title: '排期失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setScheduleBusy(false);
    }
  }

  function persistLocal(key: string, value: string): void {
    // 持久化失败（隐私模式等）仅影响下次默认值，忽略即可。
    try {
      window.localStorage.setItem(key, value);
    } catch { /* noop */ }
  }

  function changeView(next: EditorView) {
    setView(next);
    persistLocal(VIEW_STORAGE_KEY, next);
  }

  function changeSplit(ratio: number) {
    setSplitRatio(ratio);
    persistLocal(SPLIT_STORAGE_KEY, String(ratio));
  }

  if (doc.loadError) {
    return (
      <div className="ww-editor-page ww-editor-page--padded">
        <ErrorNote title="文章加载失败。" hint={doc.loadError} action={<Button variant="outline" size="sm" onClick={doc.retryLoad}>重试</Button>} />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="ww-editor-page ww-editor-page--padded" aria-busy="true"><SkeletonBlock lines={6} /></div>
    );
  }

  const badge = articleStatusBadge(article.status);
  const model = snapshot.status === 'ready' ? snapshot.data.config.settings.llmDefault.model : undefined;
  const author = snapshot.status === 'ready' ? snapshot.data.config.settings.wechatAuthor : '公众号';
  // 窄态回落：split 不可用，仅编辑（delta §1-7）。
  const effectiveView: EditorView = narrow && view === 'split' ? 'edit' : view;

  return (
    <div className="ww-editor-page">
      <header className="ww-editor-head">
        <div className="ww-editor-head__main">
          {leading}
          <h2 className="ww-editor-head__title" title={article.title}>{article.title}</h2>
          <StatusBadge tone={badge.tone} label={badge.label} />
        </div>
        <EditorHeadActions
          view={effectiveView}
          onViewChange={changeView}
          article={article}
          onArticleChanged={doc.setArticle}
          onDeleted={() => navigate({ kind: 'home' })}
          pushing={pushing}
          pushLabel={t('action.pushDraft')}
          pushingLabel={t('action.pushing')}
          onPush={requestPush}
          onSchedule={() => setScheduleOpen(true)}
          wechatReady={wechatReady}
          onConfigureWechat={() => navigate({ kind: 'settings' })}
        />
      </header>
      {/* 封面控件（v0.5.6）：封面是推草稿箱硬门槛；放页头正下方不进单行页头（页头永不折行，横幅需要可读宽度） */}
      <CoverControl article={article} rpc={rpc} toast={toast} onArticleChanged={doc.setArticle} />

      <div
        className={effectiveView === 'split' ? 'ww-editor-body ww-editor-body--split' : 'ww-editor-body'}
        style={effectiveView === 'split' ? { gridTemplateColumns: splitColumns(splitRatio) } : undefined}
      >
        {effectiveView !== 'preview' ? <EditorWorkbench value={doc.markdown} onChange={doc.handleMarkdownChange} title={article.title} /> : null}
        {effectiveView === 'split' ? <EditorSplitter ratio={splitRatio} onRatioChange={changeSplit} /> : null}
        {effectiveView !== 'edit' ? (
          <PreviewCanvas
            html={doc.previewHtml}
            rendering={doc.previewing}
            theme={doc.theme}
            onThemeChange={doc.setTheme}
            author={author}
            today={new Date().toLocaleDateString('zh-Hans-CN', { month: 'long', day: 'numeric' })}
            zoom={zoom}
            onZoomChange={setZoom}
          />
        ) : null}
      </div>

      <StatusStrip
        items={[
          <>{countWords(doc.markdown).toLocaleString('zh-Hans-CN')} 字</>,
          <button
            type="button"
            className="ww-statusstrip__gate"
            data-testid="ww-gate-chip"
            aria-expanded={gateOpen}
            aria-controls="ww-gate-overlay"
            onClick={() => onGateOpenChange(!gateOpen)}
          >
            <Icon
              name={gateStatus.blocking ? 'shield-alert' : 'shield-check'}
              size={12}
              className={gateStatus.blocking ? 'ww-statusstrip__gate-icon--warn' : 'ww-statusstrip__gate-icon--ok'}
            />
            <span className="ww-statusstrip__gate-label">门禁 {gateStatus.label}</span>
            <Icon name="chevron-up" size={12} />
          </button>,
          <>图 {article.bodyImageIds.length} 张</>,
          <>模型 {model ?? '—'}</>,
        ]}
        saveState={doc.saveState}
        onRetrySave={() => doc.setSaveState('idle')}
      />

      <GateOverlayPanel
        open={gateOpen}
        gateLabel={gateStatus.label}
        blocking={gateStatus.blocking}
        report={gateReport}
        fixing={fixing}
        onLocate={() => changeView('edit')}
        onFixOne={() => void runFix()}
        onFixAll={() => void runFix()}
        onClose={() => onGateOpenChange(false)}
      />

      <Modal
        open={gateBlockOpen}
        onClose={() => setGateBlockOpen(false)}
        title="门禁未过"
        closeLabel="关闭"
        description={`最近一次运行${gateStatus.label}。修改后再推。`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setGateBlockOpen(false)}>取消</Button>
            <Button variant="primary" size="sm" className="ww-btn-accent" onClick={() => { setGateBlockOpen(false); void runFix(); }}>重新生成并修复</Button>
          </>
        }
      >
        <p className="ww-modal-note">推送前可在 <CodeChip>门禁报告</CodeChip> 面板查看未过规则并逐项修复。</p>
      </Modal>

      <ScheduleForm
        key={article.id}
        open={scheduleOpen}
        initial={{ name: article.title }}
        submitLabel="创建定时"
        busy={scheduleBusy}
        onCancel={() => setScheduleOpen(false)}
        onSubmit={(request) => void submitSchedule(request)}
      />
    </div>
  );
}
