import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { RunSummary } from '@/shared/contract';
import { RUN_STATUS_LABEL } from '../lib/format';
import { CodeChip } from './bits';
import { Icon } from './Icon';

/**
 * 生成中六阶段 stepper（DESIGN §4.2 / §4.2 生成态）。
 * 步骤序列 = 引擎 PIPELINE_STEP_NAMES：topic→outline→draft→gates→render→images。
 * 契约事实（contract.RunSummary）：run 视图无 steps 明细——阶段行按 run 整体状态着色
 * （运行中=当前批次未完成、失败=标注失败阶段入口），明细随契约扩展后点亮；
 * 不伪造阶段级进度。失败续跑 = run/start 重跑本稿（AC-4 保留已完成产物）。
 */

const STAGES: ReadonlyArray<{ name: string; label: string }> = [
  { name: 'topic', label: '选题分析' },
  { name: 'outline', label: '研究与提纲' },
  { name: 'draft', label: '初稿写作' },
  { name: 'gates', label: '质量门禁' },
  { name: 'render', label: '排版转换' },
  { name: 'images', label: '配图生成' },
];

export function PipelineStepper({
  run,
  topic,
  onRetry,
  onCancel,
  onBackground,
  retrying,
}: {
  run: RunSummary;
  topic: string;
  onRetry: () => void;
  onCancel: () => void;
  onBackground: () => void;
  retrying: boolean;
}) {
  const failed = run.status === 'failed';
  return (
    <div className="ww-stepper">
      <div className="ww-stepper__head">
        <h3 className="ww-stepper__title">正在生成《{topic}》</h3>
        <span className="ww-stepper__meta">
          {RUN_STATUS_LABEL[run.status]} · 预计 3–5 分钟
        </span>
      </div>
      <ol className="ww-stepper__list">
        {STAGES.map((stage) => (
          <li key={stage.name} className={run.status === 'succeeded' ? 'ww-stage ww-stage--done' : 'ww-stage'}>
            <span className="ww-stage__lead">
              {run.status === 'succeeded' ? (
                <Icon name="check" size={16} />
              ) : (
                <span className="ww-stage__hollow" aria-hidden="true" />
              )}
              <span className="ww-stage__name">{stage.label}</span>
            </span>
          </li>
        ))}
      </ol>
      {run.status === 'running' || run.status === 'queued' ? (
        <p className="ww-stepper__fallback">阶段明细随 run 记录回传；当前以整体状态跟踪。</p>
      ) : null}
      {failed && run.error ? (
        <div className="ww-stage__error">
          <p>
            {run.error.message} <CodeChip>{run.error.code}</CodeChip>
          </p>
          <Button variant="outline" size="sm" icon={<Icon name="rotate-ccw" size={16} />} onClick={onRetry} disabled={retrying}>
            重试本阶段
          </Button>
        </div>
      ) : null}
      <div className="ww-stepper__foot">
        <Button variant="ghost" size="sm" onClick={onBackground}>
          转入后台
        </Button>
        <Button variant="ghost" size="sm" icon={<Icon name="x" size={16} />} onClick={onCancel}>
          取消生成
        </Button>
      </div>
    </div>
  );
}
