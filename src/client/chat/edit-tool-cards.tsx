import type { ReactNode } from 'react';
import type { Translate } from '../lib/context';
import type { ContentBlockLike, ToolCallBlockLike, ToolResultNodeLike } from '../lib/context';
import { cardT, type CardT } from './card-text';
import { safeParsePushMeta, safeParseRewriteMeta, type PushToolMeta, type RewriteToolMeta } from './meta';

/**
 * tool.call.toolview keyed `wewrite_rewrite` / `wewrite_push_draft` 渲染器（M2）。
 *
 * 两工具 settled 即终态（无轮询）：meta 驱动终态卡；schema 不符 → resultView 文本
 * 兜底（AC-M2-07 同 run 卡）；running → 标题 + 「运行中」占位。
 */

export interface EditToolCardProps {
  readonly block: ToolCallBlockLike;
  readonly t?: Translate;
}

function isSettled(block: ToolCallBlockLike): block is ToolResultNodeLike {
  return 'kind' in block && block.kind === 'tool-result';
}

function textFromBlocks(blocks: readonly ContentBlockLike[] | undefined): string {
  if (!blocks) return '';
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function CardShell({
  kind,
  title,
  tone,
  children,
}: {
  kind: string;
  title: string;
  tone?: 'danger' | undefined;
  children: ReactNode;
}) {
  return (
    <article className={`ww-chatcard ww-chatcard--edit${tone === 'danger' ? ' ww-chatcard--failed' : ''}`}>
      <header className="ww-chatcard__head">
        <span className="ww-chatcard__kind">{kind}</span>
        <span className="ww-chatcard__title" title={title}>
          {title}
        </span>
      </header>
      <div className="ww-chatcard__body">{children}</div>
    </article>
  );
}

/** meta 不符 schema：文本兜底卡（无富卡字段推断，AC-M2-07）。 */
function FallbackEditCard({ block, kind }: { block: ToolResultNodeLike; kind: string }) {
  const text = textFromBlocks(block.resultView?.content) || textFromBlocks(block.content);
  return (
    <CardShell kind={kind} title={block.resultView?.title ?? block.callView?.title ?? ''}>
      <p className="ww-chatcard__digest">{text}</p>
    </CardShell>
  );
}

function ErrorBody({ code, message, t }: { code?: string; message: string; t: CardT }) {
  return (
    <>
      <p className="ww-chatcard__digest">{message}</p>
      {code === 'wechat-40164' ? <p className="ww-chatcard__note">{t('chat.errorHint.ip')}</p> : null}
      {code ? <span className="ww-chatcard__code">{code}</span> : null}
    </>
  );
}

export function RewriteToolCard({ block, t }: EditToolCardProps) {
  const tt = cardT(t);
  const kind = tt('chat.rewriteKind');
  if (!isSettled(block)) {
    return (
      <CardShell kind={kind} title={block.callView?.title ?? kind}>
        <p className="ww-chatcard__note">{tt('chat.running')}</p>
      </CardShell>
    );
  }
  const meta: RewriteToolMeta | undefined = safeParseRewriteMeta(block.meta);
  if (!meta) return <FallbackEditCard block={block} kind={kind} />;
  if (!meta.ok) {
    return (
      <CardShell kind={kind} title={block.callView?.title ?? kind} tone="danger">
        <ErrorBody code={meta.error?.code} message={meta.error?.message ?? tt('chat.runFailed')} t={tt} />
      </CardShell>
    );
  }
  return (
    <CardShell
      kind={kind}
      title={tt('chat.rewriteDone', { from: String(meta.charsIn), to: String(meta.charsOut) })}
    >
      <span className="ww-chatcard__code">
        {meta.charsIn} → {meta.charsOut}
      </span>
    </CardShell>
  );
}

export function PushToolCard({ block, t }: EditToolCardProps) {
  const tt = cardT(t);
  const kind = tt('chat.pushKind');
  if (!isSettled(block)) {
    return (
      <CardShell kind={kind} title={block.callView?.title ?? kind}>
        <p className="ww-chatcard__note">{tt('chat.running')}</p>
      </CardShell>
    );
  }
  const meta: PushToolMeta | undefined = safeParsePushMeta(block.meta);
  if (!meta) return <FallbackEditCard block={block} kind={kind} />;
  if (!meta.ok) {
    return (
      <CardShell kind={kind} title={`《${meta.title}》`} tone="danger">
        <ErrorBody code={meta.error?.code} message={meta.error?.message ?? tt('chat.runFailed')} t={tt} />
      </CardShell>
    );
  }
  return (
    <CardShell kind={kind} title={`《${meta.title}》 · ${tt('chat.pushDone')}`}>
      {meta.mediaId ? <span className="ww-chatcard__code">{meta.mediaId}</span> : null}
    </CardShell>
  );
}
