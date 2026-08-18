import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { useState } from 'react';
import { Icon } from '../Icon';

/**
 * 375px 微信预览画布（PreviewCanvas，DESIGN §4.2）。
 *
 * - 底 --ww-canvas-bg 固定浅色（公众号文章永远浅底，不随宿主主题）。
 * - 内容 = article/preview 的真实产物 HTML（与推草稿箱载荷字节一致，AC-8）；
 *   宿主侧已转义 script/iframe，画布内为 UGC 排版主题域。
 * - 刷新期间画布角标「渲染中…」，不整屏遮罩。
 */

export const CANVAS_THEMES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'professional-clean', label: '经典蓝 · professional-clean' },
  { id: 'reader-serif', label: '暖宋 · reader-serif' },
  { id: 'compact-mono', label: '紧凑灰 · compact-mono' },
];

export function PreviewCanvas({
  html,
  rendering,
  theme,
  onThemeChange,
  author,
  today,
}: {
  html: string | undefined;
  rendering: boolean;
  theme: string;
  onThemeChange: (theme: string) => void;
  author: string;
  today: string;
}) {
  const entries: MenuEntry[] = CANVAS_THEMES.map((item) => ({ id: item.id, label: item.label }));
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  return (
    <section className="ww-preview" aria-label="微信预览画布">
      <div className="ww-preview__bar">
        <span className="ww-preview__bar-title">
          <Icon name="smartphone" size={16} /> 微信预览
        </span>
        <Menu
          open={themeMenuOpen}
          anchor={
            <button
              type="button"
              className="ww-preview__theme"
              aria-label="切换排版主题"
              aria-expanded={themeMenuOpen}
              aria-haspopup="menu"
              onClick={() => setThemeMenuOpen((open) => !open)}
            >
              <Icon name="palette" size={16} />
              <span className="ww-preview__theme-name">{theme}</span>
              <Icon name="chevron-down" size={16} />
            </button>
          }
          items={entries}
          selectedId={theme}
          onSelect={(id) => {
            setThemeMenuOpen(false);
            onThemeChange(id);
          }}
          onClose={() => setThemeMenuOpen(false)}
          align="end"
        />
      </div>
      <div className="ww-preview__frame">
        {rendering ? <span className="ww-preview__rendering">渲染中…</span> : null}
        {html === undefined ? (
          <div className="ww-preview__skeleton" aria-hidden="true">
            <span className="ww-preview__skeleton-title" />
            <span className="ww-preview__skeleton-meta" />
            <span className="ww-preview__skeleton-line" />
            <span className="ww-preview__skeleton-line" />
            <span className="ww-preview__skeleton-line ww-preview__skeleton-line--short" />
          </div>
        ) : (
          <div className="ww-preview__canvas">
            <header className="ww-preview__canvas-head">
              <p className="ww-preview__account">{author}</p>
              <p className="ww-preview__date">{today}</p>
            </header>
            {/* preview-ugc：宿主渲染的微信排版产物（已过转义），UGC 域允许富文本 */}
            <div className="ww-preview__content" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>
    </section>
  );
}
