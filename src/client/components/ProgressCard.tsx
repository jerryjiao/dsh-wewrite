import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useStore } from '../store';
import { Icon } from './Icon';
import { PipelineStepper } from './PipelineStepper';

/**
 * 右下角进度卡（ProgressCard，uiux-workbench-delta §1-5，L3 去全屏化）：
 * 首次提交短暂全屏确认（GenerationLayer）收起/转后台后本卡出现并常驻；
 * bottom = 96 + 48 = 144px 与 Toast 线（96px）垂直错开；收起后顶栏 ProgressDot 仍是常驻锚点。
 * 卡体复用 PipelineStepper 紧凑档（只渲染阶段列表，头/脚由本卡提供）。
 */

export function ProgressCard({ open, onCollapse }: { open: boolean; onCollapse: () => void }) {
  const store = useStore();
  const { generation, activeRun, retryGeneration, cancelGeneration } = store;

  if (!open || !generation || !activeRun) return null;
  // 终态语义（delta §1-5）：succeeded/cancelled/interrupted 交 Toast（卡消失）；
  // failed 保留卡片供「重试」，直到用户收起或重试产生新 run。
  const active = activeRun.status === 'queued' || activeRun.status === 'running';
  const failed = activeRun.status === 'failed';
  if (!active && !failed) return null;

  return (
    <aside
      className="ww-progress-card"
      role="region"
      aria-label="生成进度"
      data-testid="ww-progress-card"
      id="ww-progress-card"
    >
      <div className="ww-progress-card__head">
        <Icon name="loader-circle" size={16} className="ww-progress-card__state" />
        <span className="ww-progress-card__topic" title={generation.topic}>{generation.topic}</span>
        <button
          type="button"
          className="ww-progress-card__collapse"
          data-testid="ww-progress-card-collapse"
          aria-label="收起进度卡片"
          onClick={onCollapse}
        >
          <Icon name="x" size={20} />
        </button>
      </div>
      <div className="ww-progress-card__body">
        <PipelineStepper run={activeRun} topic={generation.topic} compact />
        {failed && activeRun.error ? <p className="ww-progress-card__error">{activeRun.error.message}</p> : null}
      </div>
      <div className="ww-progress-card__foot">
        {failed ? (
          <Button variant="ghost" size="sm" icon={<Icon name="rotate-ccw" size={16} />} onClick={() => void retryGeneration()}>
            重试
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="ww-danger-ghost"
            data-testid="ww-progress-card-cancel"
            icon={<Icon name="x" size={16} />}
            onClick={() => void cancelGeneration()}
          >
            取消生成
          </Button>
        )}
      </div>
    </aside>
  );
}
