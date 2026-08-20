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
 * - 缩放档 100/90/75%（v0.2 §1-7）：纯 CSS transform 视觉变换，载荷字节不变（AC-7）。
 */

export const CANVAS_THEMES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'professional-clean', label: '经典蓝 · professional-clean' },
  { id: 'reader-serif', label: '暖宋 · reader-serif' },
  { id: 'compact-mono', label: '紧凑灰 · compact-mono' },
];

export const ZOOM_LEVELS: ReadonlyArray<{ id: string; label: string; value: number }> = [
  { id: '100', label: '100%', value: 1 },
  { id: '90', label: '90%', value: 0.9 },
  { id: '75', label: '75%', value: 0.75 },
];

export function PreviewCanvas({
  html,
  rendering,
  theme,
  onThemeChange,
  author,
  today,
  zoom,
  onZoomChange,
}: {
  html: string | undefined;
  rendering: boolean;
  theme: string;
  onThemeChange: (theme: string) => void;
  author: string;
  today: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const themeEntries: MenuEntry[] = CANVAS_THEMES.map((item) => ({ id: item.id, label: item.label }));
  const zoomEntries: MenuEntry[] = ZOOM_LEVELS.map((item) => ({ id: item.id, label: item.label }));
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomId = String(Math.round(zoom * 100));

  return (
    <section className="ww-preview" aria-label="微信预览画布">
      <div className="ww-preview__bar">
        <span className="ww-preview__bar-title">
          <Icon name="smartphone" size={16} /> 微信预览
        </span>
        <div className="ww-preview__controls">
          <Menu
            open={zoomMenuOpen}
            anchor={
              <button
                type="button"
                className="ww-preview__zoom"
                aria-label="预览缩放"
                aria-expanded={zoomMenuOpen}
                aria-haspopup="menu"
                onClick={() => setZoomMenuOpen((open) => !open)}
              >
                <span className="ww-preview__zoom-value">{zoomId}%</span>
                <Icon name="chevron-down" size={16} />
              </button>
            }
            items={zoomEntries}
            selectedId={zoomId}
            onSelect={(id) => {
              setZoomMenuOpen(false);
              const matched = ZOOM_LEVELS.find((item) => item.id === id);
              if (matched) onZoomChange(matched.value);
            }}
            onClose={() => setZoomMenuOpen(false)}
            align="end"
          />
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
            items={themeEntries}
            selectedId={theme}
            onSelect={(id) => {
              setThemeMenuOpen(false);
              onThemeChange(id);
            }}
            onClose={() => setThemeMenuOpen(false)}
            align="end"
          />
        </div>
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
          <div
            className="ww-preview__canvas"
            style={zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: 'top center' } : undefined}
          >
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
