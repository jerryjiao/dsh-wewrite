/**
 * 面板全局 ambient 声明。
 * - CSS side-effect import（宿主 bundler 消费，tsc 侧仅声明模块存在）。
 * 若项目根后续补 vitest/css types（例如 vite/client），本文件与之合并即可。
 */
declare module '*.css';
