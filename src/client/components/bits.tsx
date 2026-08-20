import type { ReactNode } from 'react';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { ARTICLE_STATUS_LABEL, RUN_STATUS_LABEL } from '../lib/format';
import type { ArticleStatus, RunStatus } from '../lib/format';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/**
 * 通用四态件与小组件（官方缺位处自建，全部挂 --ww-* token）。
 * 状态点语言（DESIGN §4.4）：形状+颜色双重冗余，StateDot aria-hidden 配文字。
 */

/**
 * 空态（v2 §3-03 组合 glyph）：40px 圆形容器（sunken 底）承载主 icon 20px，
 * 右下角叠次 icon 12px（--ww-bg-page 描边圆）；hero = 大居中版（空页面主舞台）。
 */
export function EmptyState({
  icon,
  title,
  action,
  subIcon,
  hero,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  subIcon?: IconName;
  hero?: boolean;
}) {
  return (
    <div className={hero ? 'ww-empty ww-empty--hero' : 'ww-empty'}>
      <span className="ww-empty__glyph">
        {icon}
        {subIcon ? (
          <span className="ww-empty__glyph-sub">
            <Icon name={subIcon} size={12} />
          </span>
        ) : null}
      </span>
      <p className="ww-empty__title">{title}</p>
      {action ? <div className="ww-empty__actions">{action}</div> : null}
    </div>
  );
}

export function SkeletonRow({ cells = 1, height = 44 }: { cells?: number; height?: number }) {
  return (
    <div className="ww-skeleton-row" style={{ height }} aria-hidden="true">
      {Array.from({ length: cells }, (_, index) => (
        <span key={index} className="ww-skeleton-row__cell" />
      ))}
    </div>
  );
}

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ww-skeleton-block" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="ww-skeleton-block__line" />
      ))}
    </div>
  );
}

/** 失败态：具体原因 + 出路 + 重试动作（DESIGN §8 五态覆盖的 Error 态统一件）。 */
export function ErrorNote({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="ww-error" role="alert">
      <Icon name="circle-alert" size={20} />
      <div className="ww-error__body">
        <p className="ww-error__title">{title}</p>
        {hint ? <p className="ww-error__hint">{hint}</p> : null}
        {action ? <div className="ww-error__actions">{action}</div> : null}
      </div>
    </div>
  );
}

export function RetryButton({ onRetry, busy }: { onRetry: () => void; busy?: boolean }) {
  return (
    <Button variant="outline" size="sm" icon={<Icon name="rotate-ccw" size={16} />} onClick={onRetry} disabled={busy}>
      重试
    </Button>
  );
}

/** 等宽信息带：slug / 模型名 / RRULE 原文 / 规则 ID / 分数（工程编辑风视觉签名）。 */
export function CodeChip({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={className ? `ww-code ${className}` : 'ww-code'}>{children}</code>;
}

export type BadgeTone = 'idle' | 'ongoing' | 'warning' | 'error' | 'done';

const BADGE_DOT: Record<BadgeTone, StateDotState | null> = {
  idle: null,
  ongoing: 'ongoing',
  warning: 'warning',
  error: 'error',
  done: 'done',
};

/** 状态点 + 文字标签（不靠颜色单独传达；idle=无点起始态）。 */
export function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const dot = BADGE_DOT[tone];
  return (
    <span className="ww-status">
      {dot ? <StateDot state={dot} /> : <span className="ww-status__hollow" aria-hidden="true" />}
      <span className="ww-status__label">{label}</span>
    </span>
  );
}

export function articleStatusBadge(status: ArticleStatus): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'editing':
      return { tone: 'idle', label: ARTICLE_STATUS_LABEL.editing };
    case 'rendered':
      return { tone: 'done', label: ARTICLE_STATUS_LABEL.rendered };
    case 'pushed':
      return { tone: 'done', label: ARTICLE_STATUS_LABEL.pushed };
    case 'failed':
      return { tone: 'error', label: ARTICLE_STATUS_LABEL.failed };
  }
}

export function runStatusBadge(status: RunStatus): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'queued':
      return { tone: 'ongoing', label: RUN_STATUS_LABEL.queued };
    case 'running':
      return { tone: 'ongoing', label: RUN_STATUS_LABEL.running };
    case 'succeeded':
      return { tone: 'done', label: RUN_STATUS_LABEL.succeeded };
    case 'failed':
      return { tone: 'error', label: RUN_STATUS_LABEL.failed };
    case 'cancelled':
      return { tone: 'idle', label: RUN_STATUS_LABEL.cancelled };
    case 'interrupted':
      return { tone: 'warning', label: RUN_STATUS_LABEL.interrupted };
  }
}
