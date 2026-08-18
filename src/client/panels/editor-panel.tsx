import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ArticleDetail, RunParams } from '@/shared/contract';
import type { GateReportView } from '../components/GateReport';
import { gateStatusForArticle } from '../lib/gate';
import { countWords, formatAgo } from '../lib/format';
import { describeRpcFailure } from '../lib/rpc';
import { articleStatusBadge, CodeChip, ErrorNote, SkeletonBlock, StatusBadge } from '../components/bits';
import { GateReport } from '../components/GateReport';
import { ScheduleForm } from '../components/ScheduleForm';
import { EditorWorkbench } from '../components/editor/EditorWorkbench';
import { PreviewCanvas } from '../components/editor/PreviewCanvas';
import { StatusStrip } from '../components/editor/StatusStrip';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

/**
 * 编辑器（DESIGN §9.4，文章库下钻）：页头（返回/标题/状态/自动保存/三视图 Tab/推草稿箱 ▾）
 * → 主区（CodeMirror 6 + 375px 预览画布双栏；<900 单栏 Tab）→ 底部 StatusStrip。
 * 预览 = article/preview 真实产物（AC-8）；门禁未过阻断默认推送路径（AC-7）。
 */

type EditorView = 'edit' | 'preview' | 'gate';

const PREVIEW_DEBOUNCE_MS = 300;
const AUTOSAVE_DEBOUNCE_MS = 1200;

export function EditorPanel({ articleId }: { articleId: string }) {
  const store = useStore();
  const { rpc, navigate, narrow, refreshSnapshot, toast, t, snapshot, startGeneration } = store;

  const [article, setArticle] = useState<ArticleDetail | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [markdown, setMarkdown] = useState('');
  const [theme, setTheme] = useState('professional-clean');
  const [view, setView] = useState<EditorView>('edit');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | undefined>();
  const [previewHtml, setPreviewHtml] = useState<string | undefined>();
  const [previewing, setPreviewing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [gateBlockOpen, setGateBlockOpen] = useState(false);
  const [pushMenuOpen, setPushMenuOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    let alive = true;
    setArticle(undefined);
    setLoadError(undefined);
    setPreviewHtml(undefined);
    rpc.call<ArticleDetail>('article/get', { id: articleId }).then((detail) => {
      if (!alive) return;
      setArticle(detail);
      setMarkdown(detail.markdown);
      setTheme(detail.theme);
    }).catch((error: unknown) => {
      if (alive) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      alive = false;
    };
  }, [rpc, articleId]);

  const dirtyRef = useRef(false);
  const handleMarkdownChange = useCallback((next: string) => {
    dirtyRef.current = true;
    setMarkdown(next);
  }, []);

  // 自动保存（失焦停顿节流）：article/save 回填详情（AC-5 存储，仅本地）。
  useEffect(() => {
    if (!article || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      setSaveState('saving');
      rpc
        .call<ArticleDetail>('article/save', {
          id: article.id,
          slug: article.slug,
          title: article.title,
          digest: article.digest,
          markdown,
          theme,
        })
        .then((saved) => {
          dirtyRef.current = false;
          setArticle(saved);
          setSavedAt(new Date().toISOString());
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [markdown, theme, article, rpc]);

  // 预览：300ms 防抖 + 上一次请求中止（AC-8：<1s 本地刷新）。
  useEffect(() => {
    if (!article) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreviewing(true);
      rpc
        .call<{ html: string }>('article/preview', { markdown, theme }, controller.signal)
        .then((result) => setPreviewHtml(result.html))
        .catch(() => undefined)
        .finally(() => setPreviewing(false));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [article, markdown, theme, rpc]);

  // 契约 v0.1 RunSummary 无 gates 步明细——分数/规则型报告待契约扩展后接入（组件已就绪）。
  const gateReport: GateReportView | undefined = undefined;

  const gateStatus = useMemo(() => {
    const runs = snapshot.status === 'ready' ? snapshot.data.runs : [];
    return gateStatusForArticle(runs, { id: articleId, lastRunId: article?.lastRunId });
  }, [snapshot, articleId, article]);

  async function pushDraft() {
    if (!article || pushing) return;
    setPushing(true);
    try {
      await rpc.call<{ mediaId: string; thumbMediaId: string }>('wechat/pushDraft', { articleId: article.id });
      toast.push({ kind: 'success', title: t('toast.pushed') });
      await refreshSnapshot();
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
      imageCount: Math.min(10, article.bodyImageIds.length),
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
      toast.push({ kind: 'success', title: '已排期', detail: '到达时刻后自动生成并推进草稿箱。' });
      setScheduleOpen(false);
      await refreshSnapshot();
    } catch (error) {
      toast.push({ kind: 'error', title: '排期失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setScheduleBusy(false);
    }
  }

  if (loadError) {
    return <ErrorNote title="文章加载失败。" hint={loadError} action={<Button variant="outline" size="sm" onClick={() => navigate({ kind: 'articles' })}>返回文章库</Button>} />;
  }

  if (!article) {
    return (
      <div className="ww-editor-page ww-editor-page--loading">
        <SkeletonBlock lines={6} />
      </div>
    );
  }

  const badge = articleStatusBadge(article.status);
  const model = snapshot.status === 'ready' ? snapshot.data.config.settings.llmDefault.model : undefined;
  const author = snapshot.status === 'ready' ? snapshot.data.config.settings.wechatAuthor : '公众号';
  const today = new Date().toLocaleDateString('zh-Hans-CN', { month: 'long', day: 'numeric' });

  return (
    <div className="ww-editor-page">
      <header className="ww-editor-head">
        <div className="ww-editor-head__main">
          <Button variant="ghost" size="sm" icon={<Icon name="arrow-left" size={16} />} onClick={() => navigate({ kind: 'articles' })}>
            {t('action.back')}
          </Button>
          <h2 className="ww-editor-head__title" title={article.title}>{article.title}</h2>
          <StatusBadge tone={badge.tone} label={badge.label} />
          {saveState === 'saved' && savedAt ? <span className="ww-editor-head__saved">自动保存于 {formatAgo(savedAt)}</span> : null}
        </div>
        <div className="ww-editor-head__actions">
          <div className="ww-view-tabs" role="tablist" aria-label="编辑器视图">
            {([['edit', '编辑'], ['preview', '微信预览'], ['gate', '门禁报告']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'ww-view-tab ww-view-tab--active' : 'ww-view-tab'} onClick={() => setView(key)}>{label}</button>
            ))}
          </div>
          <Menu
            open={pushMenuOpen}
            anchor={
              <button type="button" className="ww-menu-trigger" aria-expanded={pushMenuOpen} aria-haspopup="menu" onClick={() => setPushMenuOpen((open) => !open)} disabled={pushing}>
                {pushing ? t('action.pushing') : t('action.pushDraft')}
                <Icon name="chevron-down" size={16} />
              </button>
            }
            items={[
              { id: 'push', label: '推草稿箱', icon: <Icon name="send" size={16} /> },
              { id: 'schedule', label: '推草稿箱并定时…', icon: <Icon name="calendar-clock" size={16} /> },
            ]}
            onSelect={(id) => {
              setPushMenuOpen(false);
              if (id === 'push') requestPush();
              else setScheduleOpen(true);
            }}
            onClose={() => setPushMenuOpen(false)}
            align="end"
          />
        </div>
      </header>

      <div className={narrow ? 'ww-editor-body ww-editor-body--narrow' : 'ww-editor-body'}>
        {view === 'edit' ? <EditorWorkbench value={markdown} onChange={handleMarkdownChange} /> : null}
        {view === 'preview' || (!narrow && view === 'edit') ? (
          <PreviewCanvas html={previewHtml} rendering={previewing} theme={theme} onThemeChange={setTheme} author={author} today={today} />
        ) : null}
        {view === 'gate' ? (
          <div className="ww-editor-gate">
            <GateReport report={gateReport} onLocate={() => setView('edit')} onFixOne={() => void runFix()} onFixAll={() => void runFix()} fixing={fixing} />
          </div>
        ) : null}
      </div>

      <StatusStrip
        items={[
          <>{countWords(markdown).toLocaleString('zh-Hans-CN')} 字</>,
          <>门禁 {gateStatus.label}</>,
          <>图 {article.bodyImageIds.length} 张</>,
          <>模型 {model ?? '—'}</>,
        ]}
        saveState={saveState}
        onRetrySave={() => setSaveState('idle')}
      />

      <Modal
        open={gateBlockOpen}
        onClose={() => setGateBlockOpen(false)}
        title="门禁未过"
        closeLabel="关闭"
        description={`最近一次运行${gateStatus.label}。修改后再推，或显式选择「仍然推送」。`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setGateBlockOpen(false)}>继续修改</Button>
            <Button variant="ghost" size="sm" className="ww-danger-ghost" onClick={() => { setGateBlockOpen(false); void pushDraft(); }}>
              仍然推送
            </Button>
          </>
        }
      >
        <p className="ww-modal-note">
          推送前可在 <CodeChip>门禁报告</CodeChip> 视图查看未过规则并逐项修复。
        </p>
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
