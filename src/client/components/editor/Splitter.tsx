import { useRef } from 'react';

/**
 * 分栏拖拽线（uiux-workbench-delta §1-7）：5px 热区 + col-resize；
 * 拖拽直接操纵容器 grid-template-columns（无过渡）；松手提交比例；
 * 双击复位 55/45；键盘 ←/→ 以 2% 步进微调。比例持久化由父层负责（ww.editor.split）。
 */

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
export const DEFAULT_RATIO = 0.55;
const KEY_STEP = 0.02;

function clampRatio(ratio: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

export function splitColumns(ratio: number): string {
  const clamped = clampRatio(ratio);
  return `calc((100% - 5px) * ${clamped}) 5px calc((100% - 5px) * ${1 - clamped})`;
}

export function EditorSplitter({ ratio, onRatioChange }: { ratio: number; onRatioChange: (ratio: number) => void }) {
  const dragging = useRef(false);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const container = target.parentElement;
    if (!container) return;
    dragging.current = true;
    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      container.style.gridTemplateColumns = splitColumns((moveEvent.clientX - rect.left) / rect.width);
    };
    const finish = (upEvent: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
      dragging.current = false;
      const rect = container.getBoundingClientRect();
      onRatioChange(clampRatio((upEvent.clientX - rect.left) / rect.width));
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  }

  return (
    <div
      className="ww-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整编辑与预览分栏"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onRatioChange(DEFAULT_RATIO)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          onRatioChange(clampRatio(ratio + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP)));
        }
      }}
    />
  );
}
