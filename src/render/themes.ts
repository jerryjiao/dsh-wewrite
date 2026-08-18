/**
 * 排版主题（架构 §3 render：内联样式 + 主题）。
 * 微信正文禁 style 块——主题以「标签 → 内联 style 串」形态注入渲染层。
 * P0 视觉门禁：纯色平涂，无渐变；无紫粉禁色。
 */

export interface RenderTheme {
  readonly id: string;
  readonly section: string;
  readonly p: string;
  readonly h2: string;
  readonly h3: string;
  readonly strong: string;
  readonly em: string;
  readonly a: string;
  readonly code: string;
  readonly pre: string;
  readonly preCode: string;
  readonly blockquote: string;
  readonly table: string;
  readonly th: string;
  readonly td: string;
  readonly ul: string;
  readonly ol: string;
  readonly li: string;
  readonly hr: string;
  readonly img: string;
}

const BASE_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const MONO_FONT = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

const professionalClean: RenderTheme = {
  id: 'professional-clean',
  section: `font-family: ${BASE_FONT}; line-height: 1.8; color: #333; font-size: 16px; padding: 0 16px; max-width: 100%; box-sizing: border-box;`,
  p: 'margin: 12px 0; text-align: justify;',
  h2: 'font-size: 19px; font-weight: bold; margin: 22px 0 12px; color: #222;',
  h3: 'font-size: 17px; font-weight: bold; margin: 18px 0 10px; color: #333;',
  strong: 'color: #111; font-weight: 600;',
  em: 'color: #555;',
  a: 'color: #576b95; text-decoration: none; word-break: break-all;',
  code: `background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: ${MONO_FONT}; font-size: 14px; color: #c7254e;`,
  pre: 'background: #282c34; color: #abb2bf; padding: 16px; border-radius: 6px; overflow-x: auto; margin: 14px 0; line-height: 1.5;',
  preCode: 'background: none; padding: 0; color: inherit; font-size: 13px; white-space: pre;',
  blockquote: 'border-left: 4px solid #ddd; margin: 14px 0; padding: 8px 16px; color: #666; background: #fafafa;',
  table: 'width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px;',
  th: 'border: 1px solid #ddd; padding: 8px 12px; text-align: left; background: #f5f5f5; font-weight: 600;',
  td: 'border: 1px solid #ddd; padding: 8px 12px; text-align: left;',
  ul: 'padding-left: 20px; margin: 10px 0;',
  ol: 'padding-left: 20px; margin: 10px 0;',
  li: 'margin: 4px 0;',
  hr: 'border: none; border-top: 1px solid #eee; margin: 20px 0;',
  img: 'max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 4px;',
};

const techDark: RenderTheme = {
  ...professionalClean,
  id: 'tech-dark',
  section: `font-family: ${BASE_FONT}; line-height: 1.8; color: #d7dae0; font-size: 16px; padding: 0 16px; max-width: 100%; box-sizing: border-box; background: #1e222a;`,
  h2: 'font-size: 19px; font-weight: bold; margin: 22px 0 12px; color: #e8eaed;',
  h3: 'font-size: 17px; font-weight: bold; margin: 18px 0 10px; color: #cfd3dc;',
  strong: 'color: #f2f3f5; font-weight: 600;',
  code: `background: #2c313a; padding: 2px 6px; border-radius: 3px; font-family: ${MONO_FONT}; font-size: 14px; color: #98c379;`,
  blockquote: 'border-left: 4px solid #4b5263; margin: 14px 0; padding: 8px 16px; color: #9da5b4; background: #23272f;',
  th: 'border: 1px solid #4b5263; padding: 8px 12px; text-align: left; background: #2c313a; font-weight: 600;',
  td: 'border: 1px solid #4b5263; padding: 8px 12px; text-align: left;',
};

const minimalGray: RenderTheme = {
  ...professionalClean,
  id: 'minimal-gray',
  p: 'margin: 14px 0; text-align: justify; color: #444;',
  h2: 'font-size: 18px; font-weight: bold; margin: 24px 0 12px; color: #111; padding-left: 10px; border-left: 3px solid #999;',
  h3: 'font-size: 16px; font-weight: bold; margin: 18px 0 10px; color: #333;',
  code: `background: #ececec; padding: 2px 5px; border-radius: 2px; font-family: ${MONO_FONT}; font-size: 14px; color: #333;`,
  blockquote: 'border-left: 3px solid #bbb; margin: 14px 0; padding: 6px 14px; color: #777;',
};

const THEMES: Readonly<Record<string, RenderTheme>> = {
  'professional-clean': professionalClean,
  'tech-dark': techDark,
  'minimal-gray': minimalGray,
};

export const DEFAULT_THEME_ID = 'professional-clean';

/** 未知主题回落默认（接受任意 theme 字符串，产物恒合法）。 */
export function resolveTheme(themeId: string | undefined): RenderTheme {
  return THEMES[themeId ?? ''] ?? professionalClean;
}
