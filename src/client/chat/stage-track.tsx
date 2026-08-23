import type { RunDetailStep } from './meta';
import { cardT, type CardT } from './card-text';

/**
 * 六段分轨（uiux §1.1）：6 段 × 20px × 4px（--ww-stage-seg-w/--ww-stage-track-h）。
 * 段色：done=fg-secondary / current=accent（全卡唯一 accent 位）/ pending=border /
 * failed=danger。分轨永不单独达意——右侧/下方必有「n/6 · 阶段名」文字 +
 * 全阶段标签（状态不以颜色为唯一载体）。run-tool-card 与 commandview 共用。
 */

export const STAGE_KEYS = ['topic', 'outline', 'draft', 'gates', 'render', 'images'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export function stageLabel(t: CardT, stage: string): string {
  const key = `chat.stage.${stage}` as `chat.stage.${StageKey}`;
  return t(key);
}

export type StageState = 'pending' | 'running' | 'succeeded' | 'failed';

export interface StageProgress {
  /** 六步状态（缺 steps 数据时全 unknown → 渲染中性 pending 观感）。 */
  readonly states: readonly (StageState | undefined)[];
  /** 已完成步数。 */
  readonly done: number;
  /** 当前步名（无数据/终态时 undefined）。 */
  readonly current?: string;
}

/** RunDetail.steps → 六步进度投影（steps 缺失的步保持 undefined）。 */
export function projectStages(steps: readonly RunDetailStep[] | undefined): StageProgress {
  const byName = new Map((steps ?? []).map((step) => [step.name, step.status]));
  const states = STAGE_KEYS.map((name) => byName.get(name) as StageState | undefined);
  const done = states.filter((state) => state === 'succeeded').length;
  const current = STAGE_KEYS.find((name) => byName.get(name) === 'running');
  return { states, done, current };
}

export function StageTrack({ progress, t }: { progress: StageProgress; t?: CardT }) {
  const tt = t ?? cardT();
  const currentLabel = progress.current ? stageLabel(tt, progress.current) : undefined;
  return (
    <div className="ww-chatcard__stages">
      <div className="ww-chatcard__track" aria-hidden="true">
        {progress.states.map((state, index) => (
          <span
            key={index}
            className={
              state === 'succeeded'
                ? 'ww-chatcard__seg ww-chatcard__seg--done'
                : state === 'running'
                  ? 'ww-chatcard__seg ww-chatcard__seg--current'
                  : state === 'failed'
                    ? 'ww-chatcard__seg ww-chatcard__seg--failed'
                    : 'ww-chatcard__seg'
            }
          />
        ))}
      </div>
      <span className="ww-chatcard__stagecount">
        {tt('chat.stageCount', { done: String(progress.done), total: String(STAGE_KEYS.length), stage: currentLabel ?? tt('chat.running') })}
      </span>
      <ol className="ww-chatcard__stagelist">
        {STAGE_KEYS.map((name, index) => {
          const state = progress.states[index];
          return (
            <li
              key={name}
              className={
                state === 'succeeded'
                  ? 'ww-chatcard__stagename ww-chatcard__stagename--done'
                  : state === 'running'
                    ? 'ww-chatcard__stagename ww-chatcard__stagename--current'
                    : state === 'failed'
                      ? 'ww-chatcard__stagename ww-chatcard__stagename--failed'
                      : 'ww-chatcard__stagename'
              }
            >
              {stageLabel(tt, name)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
