import type { Translate } from '../lib/context';
import type { ContentBlockLike, RunningToolCallLike, ToolCallBlockLike, ToolResultNodeLike } from '../lib/context';
import type { WewriteRpc } from '../lib/rpc';
import { Icon } from '../components/Icon';
import { cardT, type CardT } from './card-text';
import { isOverlayAvailable, openOverlayWithArticle } from './overlay-bridge';
import { safeParseRunMeta } from './meta';
import { useRunDetail } from './run-detail-hook';
import { projectStages, StageTrack } from './stage-track';

/**
 * tool.call.toolview keyed `wewrite_run` 渲染器（architecture §5.2，M2）。
 *
 * - running（RunningToolCall）：run/detail 3s 轮询 → 六步进度卡；RPC 失败 D6 静默
 *   保留末次快照（首帧失败 → 「运行中」占位，不炸卡片）。
 * - settled（ToolResultNode）：meta 安全解析（RunToolMetaSchema）→ 成稿卡 +
 *   「打开写作台」动作（overlayAvailable=false 时隐藏，D3）；schema 不符 →
 *   resultView 文本兜底（AC-M2-07）。settled 形态即回放形态（callView/resultView/
 *   meta 全持久化），零额外逻辑（AC-M2-03）。
 * - 默认形态是状态的纯函数（无本地折叠记忆，replay 安全）。
 *
 * QA 契约（tests/client/chat-run-card.test.tsx）：具名导出 RunToolCard，
 * props { block, rpc, t? }。
 */

export interface RunToolCardProps {
  readonly block: ToolCallBlockLike;
  readonly rpc: WewriteRpc;
  readonly t?: Translate;
}

function isSettled(block: ToolCallBlockLike): block is ToolResultNodeLike {
  return 'kind' in block && block.kind === 'tool-result';
}

function parseArgsRaw(argsRaw: string | undefined): Record<string, unknown> {
  if (!argsRaw) return {};
  try {
    const parsed: unknown = JSON.parse(argsRaw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function textFromBlocks(blocks: readonly ContentBlockLike[] | undefined): string {
  if (!blocks) return '';
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/** AC-M2-07 兜底：meta 不过 schema → 按 resultView/原始 content 文本渲染，无富卡动作。 */
function FallbackRunCard({ block, t }: { block: ToolResultNodeLike; t: CardT }) {
  const text = textFromBlocks(block.resultView?.content) || textFromBlocks(block.content);
  return (
    <article className="ww-chatcard ww-chatcard--run ww-chatcard--fallback">
      <header className="ww-chatcard__head">
        <span className="ww-chatcard__kind">{t('chat.cardKind')}</span>
        <span className="ww-chatcard__title">{block.resultView?.title ?? block.callView?.title ?? block.call?.name ?? ''}</span>
      </header>
      <div className="ww-chatcard__body">
        <p className="ww-chatcard__digest">{text}</p>
      </div>
    </article>
  );
}

function RunningRunCard({ block, rpc, t }: { block: RunningToolCallLike; rpc: WewriteRpc; t: CardT }) {
  const args = parseArgsRaw(block.argsRaw);
  const topic = typeof args.topic === 'string' ? args.topic : (block.callView?.title ?? '');
  // selector 推导：args/rawInput 内嵌真 runId 优先；只有 callId 时走 {callId}——
  // host 侧 run-tool execute 已 bindRunCall(callId→runId)，二选一 union 契约闭合断链。
  const rawInput =
    block.callView?.rawInput && typeof block.callView.rawInput === 'object'
      ? (block.callView.rawInput as Record<string, unknown>)
      : {};
  const argsRunId = typeof args.runId === 'string' ? args.runId : undefined;
  const rawRunId = typeof rawInput.runId === 'string' ? rawInput.runId : undefined;
  const selector = argsRunId || rawRunId ? { runId: (argsRunId ?? rawRunId) as string } : { callId: block.callId };
  const detail = useRunDetail(rpc, selector, true);
  const progress = projectStages(detail?.steps);

  return (
    <article className="ww-chatcard ww-chatcard--run ww-chatcard--running">
      <header className="ww-chatcard__head">
        <span className="ww-chatcard__kind">{t('chat.cardKind')}</span>
        <span className="ww-chatcard__title" title={topic}>
          {topic ? `《${topic}》` : ''}
        </span>
        <span className="ww-chatcard__meta">{t('chat.running')}</span>
      </header>
      <div className="ww-chatcard__body">
        <StageTrack progress={progress} t={t} />
        <p className="ww-chatcard__note">{detail ? t('chat.runEta') : t('chat.seeWorkbench')}</p>
      </div>
    </article>
  );
}

function SettledRunCard({ block, t }: { block: ToolResultNodeLike; t: CardT }) {
  const meta = safeParseRunMeta(block.meta);
  if (!meta) return <FallbackRunCard block={block} t={t} />;

  if (!meta.ok) {
    return (
      <article className="ww-chatcard ww-chatcard--run ww-chatcard--failed">
        <header className="ww-chatcard__head">
          <span className="ww-chatcard__kind">{t('chat.cardKind')}</span>
          <span className="ww-chatcard__title" title={meta.topic}>
            《{meta.topic}》
          </span>
          <span className="ww-chatcard__meta ww-chatcard__meta--danger">{t('chat.runFailed')}</span>
        </header>
        <div className="ww-chatcard__body">
          <p className="ww-chatcard__digest">{meta.error?.message ?? t('chat.runFailed')}</p>
          <p className="ww-chatcard__note">{t('chat.seeWorkbench')}</p>
          {meta.error ? <span className="ww-chatcard__code">{meta.error.code}</span> : null}
        </div>
      </article>
    );
  }

  const articleId = meta.articleId;
  const canOpen = Boolean(articleId) && isOverlayAvailable();
  return (
    <article className="ww-chatcard ww-chatcard--run ww-chatcard--settled">
      <header className="ww-chatcard__head">
        <span className="ww-chatcard__kind">{t('chat.cardKind')}</span>
        <span className="ww-chatcard__title" title={meta.title ?? meta.topic}>
          《{meta.title ?? meta.topic}》
        </span>
        {meta.gatePassed ? <span className="ww-chatcard__chip ww-chatcard__chip--ok">{t('chat.gatePassed')}</span> : null}
      </header>
      <div className="ww-chatcard__body">
        {meta.digest ? <p className="ww-chatcard__digest">{meta.digest}</p> : null}
      </div>
      {canOpen && articleId ? (
        <footer className="ww-chatcard__actions">
          <button
            type="button"
            className="ww-chatcard__action"
            data-testid="ww-chatcard-open-workbench"
            onClick={() => openOverlayWithArticle(articleId)}
          >
            <Icon name="square-pen" size={16} />
            {t('chat.openWorkbench')}
          </button>
        </footer>
      ) : null}
    </article>
  );
}

export function RunToolCard({ block, rpc, t }: RunToolCardProps) {
  const tt = cardT(t);
  if (isSettled(block)) return <SettledRunCard block={block} t={tt} />;
  return <RunningRunCard block={block} rpc={rpc} t={tt} />;
}
