import type { CommandRowOwnerPropsLike } from '../lib/context';
import type { WewriteRpc } from '../lib/rpc';
import { Icon } from '../components/Icon';
import { cardT } from '../chat/card-text';
import { useRunDetail, type RunDetailSelector } from '../chat/run-detail-hook';
import { projectStages, StageTrack } from '../chat/stage-track';

/**
 * conversation.chat.commandview keyed `wewrite`（M3 / uiux §5.2）：
 * /wewrite 命令的时间线行——一行命令原文（等宽）+ pen-line + 执行状态，
 * 成功后携带 runId 则复用 run-detail-hook 展示六步进度。
 * 未注册本 keyed 行时宿主有 GenericCommandCard 兜底（S9），本组件纯增强。
 * runId 提取按 host commands.ts 落地形态三格式容错（见 parseRunId）。
 */

/**
 * outcome.text 的 runId 提取（M3 契约容错三格式）：
 * ① JSON {"runId":"…"}（结构化 done）；② 裸 runId；③ 散文 `runId: xxx`
 * （host commands.ts 落地形态：message 内嵌 `（runId: run_xxx）`）。
 */
function parseRunId(text: string | undefined): string | undefined {
  if (!text) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const runId = (parsed as { runId?: unknown }).runId;
      if (typeof runId === 'string' && runId) return runId;
    }
  } catch {
    /* 非 JSON → 继续按裸值/散文格式解析 */
  }
  if (/^[\w-]{1,128}$/.test(text)) return text;
  const inProse = text.match(/runId[（(：:\s]*['"]?([A-Za-z0-9_-]{1,128})['"]?/);
  return inProse?.[1];
}

export function WewriteCommandRow({ node, rpc }: { node?: CommandRowOwnerPropsLike['node']; rpc: WewriteRpc }) {
  const t = cardT();
  // hook 先于早退调用（node 为 null 的兜底分支不破坏 hook 顺序）。
  const parsedRunId = node?.outcome?.kind === 'success' ? parseRunId(node.outcome.text) : undefined;
  const selector: RunDetailSelector | undefined = parsedRunId ? { runId: parsedRunId } : undefined;
  // 命令成功且带 runId → 轮询六步进度（管线可能仍在跑：命令 handler 先返 runId）。
  const detail = useRunDetail(rpc, selector, Boolean(parsedRunId));
  if (!node) return null;
  const executing = node.outcome === null;
  const progress = projectStages(detail?.steps);
  const status = executing ? t('chat.commandExecuting') : node.outcome?.kind === 'success' ? t('chat.commandDone') : t('chat.commandFailed');

  return (
    <article className={`ww-chatcard ww-chatcard--command${node.outcome?.kind === 'error' ? ' ww-chatcard--failed' : ''}`}>
      <header className="ww-chatcard__head">
        <Icon name="pen-line" size={16} />
        <span className="ww-chatcard__code">
          /{node.name ?? 'wewrite'}
          {node.args ? ` ${node.args}` : ''}
        </span>
        <span className={node.outcome?.kind === 'error' ? 'ww-chatcard__meta ww-chatcard__meta--danger' : 'ww-chatcard__meta'}>{status}</span>
      </header>
      {selector ? (
        <div className="ww-chatcard__body">
          <StageTrack progress={progress} t={t} />
          <p className="ww-chatcard__note">{detail ? t('chat.runEta') : t('chat.seeWorkbench')}</p>
        </div>
      ) : null}
      {node.outcome?.kind === 'error' && node.outcome.text ? (
        <div className="ww-chatcard__body">
          <p className="ww-chatcard__digest">{node.outcome.text}</p>
        </div>
      ) : null}
    </article>
  );
}
