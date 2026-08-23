import { useEffect } from 'react';
import type { GateReportView } from './GateReport';
import { GateReport } from './GateReport';
import { Icon } from './Icon';

/**
 * 门禁报告覆盖面板（GateOverlayPanel，uiux-workbench-delta §1-6）：
 * 工作区右缘 360px 滑出层，非模态（打开时编辑器仍可输入）——门禁是「检查报告」不是「编辑视图」。
 * 入口 = StatusStrip 门禁 chip + 左栏门禁标记；关闭 = Esc / 关闭钮 / 切换文章 / 离开工作区。
 * 面板体复用 GateReport（.ww-gate 内容契约零改动：分数/规则/定位/单项修复/全量修复）。
 */

export function GateOverlayPanel({
  open,
  gateLabel,
  blocking,
  report,
  fixing,
  onLocate,
  onFixOne,
  onFixAll,
  onClose,
}: {
  open: boolean;
  gateLabel: string;
  blocking: boolean;
  report: GateReportView | undefined;
  fixing: boolean;
  onLocate: (ruleId: string) => void;
  onFixOne: (ruleId: string) => void;
  onFixAll: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ww-gate-overlay" role="dialog" aria-modal="false" aria-label="门禁报告" data-testid="ww-gate-overlay" id="ww-gate-overlay">
      <div className="ww-gate-overlay__head">
        <Icon name={blocking ? 'shield-alert' : 'shield-check'} size={16} className={blocking ? 'ww-gate-overlay__state ww-gate-overlay__state--fail' : 'ww-gate-overlay__state'} />
        <span className="ww-gate-overlay__title">门禁报告</span>
        <span className="ww-gate-overlay__label">{gateLabel}</span>
        <button type="button" className="ww-gate-overlay__close" data-testid="ww-gate-overlay-close" aria-label="关闭门禁报告" onClick={onClose}>
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="ww-gate-overlay__body">
        <GateReport report={report} onLocate={onLocate} onFixOne={onFixOne} onFixAll={onFixAll} fixing={fixing} />
      </div>
    </div>
  );
}
