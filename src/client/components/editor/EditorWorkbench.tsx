import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { redo, undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useRef } from 'react';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { Icon } from '../Icon';

/**
 * 编辑区（EditorWorkbench，DESIGN §4.2）：CodeMirror 6 + 浮动格式工具条。
 * 等宽 --ww-font-code；markdown 语法定义（代码块内部语言高亮不加载，控 bundle 体积）；
 * 主题视觉在 editor.css 用 --ww-* 覆写（跟随宿主浅/深）。
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

export function EditorWorkbench({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);

  return (
    <div className="ww-editor">
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
      <CodeMirror
        ref={editorRef}
        value={value}
        height="100%"
        className="ww-editor__cm"
        theme="light"
        extensions={[markdown({ base: markdownLanguage })]}
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
        onChange={onChange}
        aria-label="Markdown 正文编辑区"
      />
    </div>
  );
}
