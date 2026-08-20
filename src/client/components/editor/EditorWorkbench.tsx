import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { redo, undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { Icon } from '../Icon';
import { RewritePopover } from './RewritePopover';
import type { RewriteTarget } from './RewritePopover';

/**
 * 编辑区（EditorWorkbench，DESIGN §4.2）：CodeMirror 6 + 顶部 sticky 格式工具条。
 * v0.3 R3：updateListener 监听选区，非空选区上方浮「AI 改写」chip（wand-sparkles，
 * 浮现语言同 .ww-hotspot__write），点击开 RewritePopover；完成以单 transaction
 * 替换选区（进 undo 历史）。等宽 --ww-font-code；主题视觉在 editor.css 覆写。
 */

type ToolAction =
  | { kind: 'wrap'; before: string; after: string; icon: 'bold' | 'italic' | 'code' }
  | { kind: 'prefix'; prefix: string; icon: 'heading-2' | 'list' | 'list-ordered' | 'quote' }
  | { kind: 'link'; icon: 'link' }
  | { kind: 'history'; icon: 'undo-2'; redo?: boolean };

const TOOLS: ReadonlyArray<{ id: string; tooltip: string; action: ToolAction }> = [
  { id: 'bold', tooltip: '加粗', action: { kind: 'wrap', before: '**', after: '**', icon: 'bold' } },
  { id: 'italic', tooltip: '斜体', action: { kind: 'wrap', before: '*', after: '*', icon: 'italic' } },
  { id: 'h2', tooltip: '二级标题', action: { kind: 'prefix', prefix: '## ', icon: 'heading-2' } },
  { id: 'ul', tooltip: '无序列表', action: { kind: 'prefix', prefix: '- ', icon: 'list' } },
  { id: 'ol', tooltip: '有序列表', action: { kind: 'prefix', prefix: '1. ', icon: 'list-ordered' } },
  { id: 'quote', tooltip: '引用', action: { kind: 'prefix', prefix: '> ', icon: 'quote' } },
  { id: 'code', tooltip: '行内代码', action: { kind: 'wrap', before: '`', after: '`', icon: 'code' } },
  { id: 'link', tooltip: '链接', action: { kind: 'link', icon: 'link' } },
  { id: 'undo', tooltip: '撤销', action: { kind: 'history', icon: 'undo-2' } },
  { id: 'redo', tooltip: '重做', action: { kind: 'history', icon: 'undo-2', redo: true } },
];

function applyTool(view: EditorView | undefined, action: ToolAction): void {
  if (!view) return;
  const { state } = view;
  const changes = state.changeByRange((range) => {
    if (action.kind === 'wrap') {
      return {
        changes: [
          { from: range.from, insert: action.before },
          { from: range.to, insert: action.after },
        ],
        range,
      };
    }
    if (action.kind === 'prefix') {
      const line = state.doc.lineAt(range.from);
      return {
        changes: [{ from: line.from, insert: action.prefix }],
        range,
      };
    }
    if (action.kind === 'link') {
      const text = state.sliceDoc(range.from, range.to) || '链接文字';
      return {
        changes: [{ from: range.from, to: range.to, insert: `[${text}](https://)` }],
        range,
      };
    }
    return { changes: [], range };
  });
  if (action.kind === 'history') {
    if (action.redo) redo(view);
    else undo(view);
    return;
  }
  view.dispatch(changes);
  view.focus();
}

/** chip/popover 锚点（相对 .ww-editor 容器坐标，§D2-4 定位与避让规则）。 */
interface RewriteAnchor {
  left: number;
  top: number;
}

const CHIP_HEIGHT = 28;
const CHIP_GAP = 8;
/** 翻转阈值：选区首行上缘距容器顶不足 48px（chip 28 + gap 8 + 12 余量）时翻到选区下方。 */
const FLIP_THRESHOLD = 48;

export function EditorWorkbench({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (next: string) => void;
  /** 文章题名（article/rewrite 的语气锚点，可选——EditorPanel 从 useArticleDoc 传下）。 */
  title?: string;
}) {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const editorBoxRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<RewriteAnchor | null>(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [popover, setPopover] = useState<(RewriteAnchor & { target: RewriteTarget }) | null>(null);

  // 选区 → chip 锚点（§D2-4）：选区左缘上方 8px；上缘不足翻到选区下方；水平 clamp。
  // 选区可能滚到 sticky 工具条底下（coordsAtPos 照算）——两条分支都以工具条底+间距为下限，
  // 保证 chip 永远可点（v0.3 live 实测：被遮选区的 chip 曾落进工具条矩形内）。
  const handleEditorUpdate = useCallback((update: ViewUpdate) => {
    const view = update.view;
    const selection = view.state.selection.main;
    if (selection.empty) {
      setAnchor(null);
      return;
    }
    const box = editorBoxRef.current;
    const fromCoords = view.coordsAtPos(selection.from);
    const toCoords = view.coordsAtPos(selection.to);
    if (!box || !fromCoords || !toCoords) return;
    const rect = box.getBoundingClientRect();
    const toolbar = box.querySelector<HTMLElement>('.ww-editor__toolbar');
    const minTop = toolbar ? toolbar.offsetHeight + CHIP_GAP : FLIP_THRESHOLD;
    let top = fromCoords.top - rect.top - CHIP_HEIGHT - CHIP_GAP;
    if (top < Math.max(FLIP_THRESHOLD, minTop)) top = Math.max(toCoords.bottom - rect.top + CHIP_GAP, minTop);
    const left = Math.min(Math.max(fromCoords.left - rect.left, CHIP_GAP), Math.max(CHIP_GAP, rect.width - 120));
    setAnchor((prev) =>
      prev && Math.abs(prev.left - left) < 1 && Math.abs(prev.top - top) < 1 ? prev : { left, top },
    );
  }, []);

  const extensions = useMemo(
    () => [markdown({ base: markdownLanguage }), EditorView.updateListener.of(handleEditorUpdate)],
    [handleEditorUpdate],
  );

  const chipVisible = anchor !== null && !rewriteOpen && !rewriteBusy;
  // 浮现语言（§D2-5）：opacity+translateY 100ms——插入帧后再挂 --shown 触发过渡
  useEffect(() => {
    const el = chipRef.current;
    if (!el) return;
    if (chipVisible) {
      const raf = requestAnimationFrame(() => el.classList.add('ww-rewrite-chip--shown'));
      return () => cancelAnimationFrame(raf);
    }
    el.classList.remove('ww-rewrite-chip--shown');
  }, [chipVisible, anchor]);

  function openRewrite(): void {
    const view = editorRef.current?.view;
    const box = editorBoxRef.current;
    if (!view || !box || !anchor) return;
    const selection = view.state.selection.main;
    if (selection.empty) return;
    // 契约 text ≤ 8000：超长选区截断（CodeMirror 位置与 String.slice 同为 UTF-16 偏移口径）
    const to = Math.min(selection.to, selection.from + 8000);
    const text = view.state.sliceDoc(selection.from, to);
    if (!text.trim()) return;
    const rect = box.getBoundingClientRect();
    const left = Math.min(Math.max(anchor.left, CHIP_GAP), Math.max(CHIP_GAP, rect.width - 336));
    setPopover({ left, top: anchor.top, target: { from: selection.from, to, text } });
    setRewriteOpen(true);
  }

  /** LLM 产出以单 transaction 替换选区（进 undo 历史，Ctrl+Z 可回滚）。 */
  function applyRewrite(target: RewriteTarget, nextText: string): void {
    editorRef.current?.view?.dispatch({ changes: { from: target.from, to: target.to, insert: nextText } });
    closeRewrite();
  }

  function closeRewrite(): void {
    setRewriteOpen(false);
    setPopover(null);
  }

  function handleBusyChange(busy: boolean): void {
    setRewriteBusy(busy);
  }

  return (
    <div className="ww-editor" ref={editorBoxRef}>
      <div className="ww-editor__toolbar" role="toolbar" aria-label="Markdown 格式工具">
        {TOOLS.map((tool) => (
          <Tooltip key={tool.id} label={tool.tooltip} side="bottom">
            <button
              type="button"
              className="ww-editor__tool"
              aria-label={tool.tooltip}
              onClick={() => applyTool(editorRef.current?.view, tool.action)}
            >
              <Icon name={tool.action.icon} size={16} />
            </button>
          </Tooltip>
        ))}
      </div>
      {anchor ? (
        <button
          ref={chipRef}
          type="button"
          className="ww-rewrite-chip"
          data-testid="ww-rewrite-chip"
          aria-label="AI 改写选中内容"
          aria-expanded={rewriteOpen}
          style={{ left: anchor.left, top: anchor.top }}
          onClick={openRewrite}
        >
          <Icon name="wand-sparkles" size={12} />
          AI 改写
        </button>
      ) : null}
      {rewriteOpen && popover ? (
        <RewritePopover
          target={popover.target}
          title={title}
          left={popover.left}
          top={popover.top}
          onApply={applyRewrite}
          onCancel={closeRewrite}
          onBusyChange={handleBusyChange}
        />
      ) : null}
      <CodeMirror
        ref={editorRef}
        value={value}
        height="100%"
        className="ww-editor__cm"
        theme="light"
        extensions={extensions}
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
        onChange={onChange}
        aria-label="Markdown 正文编辑区"
      />
    </div>
  );
}
