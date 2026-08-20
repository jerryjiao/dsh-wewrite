import { useEffect, useRef, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { describeRpcFailure } from '../../lib/rpc';
import { Icon } from '../Icon';
import { useStore } from '../../store';

/**
 * AI 改写 popover（uiux v0.3 §3，视觉规格 uiux-v0.3-design §D2）：
 * 指令输入（Enter 提交）+ 4 快捷 chip（即点即发）+ 生成中态（主钮 spin/disabled）
 * + 取消（生成中=中止请求）。失败行内错误（不 toast）；Escape / 外点关闭。
 * 完成 = onApply 回调（EditorWorkbench 单 transaction 替换选区进 undo 历史）。
 */

/** 快捷指令 chip（§D2-2 命名契约：testid 后缀 colloquial/condense/expand/data）。 */
const QUICK_CHIPS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'colloquial', label: '更口语' },
  { id: 'condense', label: '精简一半' },
  { id: 'expand', label: '扩写细节' },
  { id: 'data', label: '更有数据感' },
];

/** 契约上限：instruction ≤ 200 字符，超出截断（host 端 zod 会拒超长）。 */
const INSTRUCTION_MAX = 200;

export interface RewriteTarget {
  /** CodeMirror 文档位置（UTF-16 偏移，与 doc 偏移同口径）。 */
  from: number;
  to: number;
  /** 选区文本快照（开 popover 时捕获，已按契约 text ≤ 8000 截断）。 */
  text: string;
}

export function RewritePopover({
  target,
  title,
  left,
  top,
  onApply,
  onCancel,
  onBusyChange,
}: {
  target: RewriteTarget;
  /** 文章题名（语气锚点，可选——useArticleDoc 的 article.title 传下来）。 */
  title?: string;
  /** 相对 .ww-editor 容器的定位（§D2-4 定位与避让规则）。 */
  left: number;
  top: number;
  onApply: (target: RewriteTarget, nextText: string) => void;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { rpc } = useStore();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onBusyChange(false);
    // 外点关闭（§D2-6）：popover 外部 mousedown 即关（选区保留，只关面板不动文本）。
    // 挂载/卸载各执行一次（onCancel/onBusyChange 由父组件闭包持有，无需进依赖）。
    function onDocMouseDown(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onCancel();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      abortRef.current?.abort();
      onBusyChange(false);
    };
    // 故意不列依赖：本 effect 只需挂载期执行一次
  }, []);

  async function submit(raw: string): Promise<void> {
    const value = raw.trim().slice(0, INSTRUCTION_MAX);
    if (!value || busy) {
      // 空指令不灰按钮：点击聚焦输入（v2 §3-01 CTA enabled 策略）
      if (!value) inputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      const result = await rpc.call<{ text: string }>(
        'article/rewrite',
        {
          text: target.text,
          instruction: value,
          title: title ? title.slice(0, 200) : undefined,
        },
        controller.signal,
      );
      onApply(target, result.text);
    } catch (cause) {
      if (controller.signal.aborted) return; // 用户中止：静默关闭，不报错
      setError(describeRpcFailure(cause).title);
    } finally {
      abortRef.current = null;
      setBusy(false);
      onBusyChange(false);
    }
  }

  function cancel(): void {
    abortRef.current?.abort();
    onCancel();
  }

  return (
    <div
      ref={popoverRef}
      className="ww-rewrite-popover"
      role="dialog"
      aria-label="AI 改写"
      data-testid="ww-rewrite-popover"
      style={{ left, top }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation(); // 不冒泡到外层浮层（写作台 Esc 收起）
          cancel();
        }
      }}
    >
      <input
        ref={inputRef}
        className="ww-rewrite-popover__input"
        data-testid="ww-rewrite-input"
        aria-label="改写指令"
        placeholder="一句话说明怎么改，如：更口语一点"
        value={instruction}
        autoFocus
        disabled={busy}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit(instruction);
        }}
      />
      {error ? (
        <p className="ww-rewrite-popover__error" data-testid="ww-rewrite-error" role="alert">{error}</p>
      ) : null}
      <div className="ww-rewrite-popover__quickrow">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="ww-rewrite-popover__quick"
            data-testid={`ww-rewrite-quick-${chip.id}`}
            disabled={busy}
            onClick={() => void submit(chip.label)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="ww-rewrite-popover__foot">
        <Button variant="ghost" size="sm" data-testid="ww-rewrite-cancel" onClick={cancel}>
          {busy ? '中止' : '取消'}
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="ww-btn-accent"
          data-testid="ww-rewrite-go"
          disabled={busy}
          icon={<Icon name={busy ? 'loader-circle' : 'wand-sparkles'} size={16} className={busy ? 'ww-spin' : undefined} />}
          onClick={() => void submit(instruction)}
        >
          {busy ? '改写中…' : '改写'}
        </Button>
      </div>
    </div>
  );
}
