#!/usr/bin/env node
/**
 * 构建脚本（ADR-0008：npm 预构建 lib/，no-build 安装路径）。
 * 产物：
 *   lib/index.js  —— 宿主插件入口（bundle src/host/index.ts；依赖 external，安装侧解析）
 *   lib/shared.js —— 双端契约入口（bundle src/shared/index.ts）
 *   lib/client.js —— Web client 真身：CJS bundle 包 window.__ModuleLoader__.load 外壳
 *                    （dsh-automation/官方 dsh-client-locale 同款加载契约，2026-08-18 实证）；
 *                    react/react-dom/@deepseek-ai/* external（宿主 ModuleLoader 提供，单实例）
 * 类型：tsc -p tsconfig.build.json 产 lib/types/*.d.ts（build script 的另一半）
 */

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = join(root, 'lib');
mkdirSync(lib, { recursive: true });

const common = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
};

await build({ ...common, entryPoints: [join(root, 'src/host/index.ts')], outfile: join(lib, 'index.js') });
await build({ ...common, entryPoints: [join(root, 'src/shared/index.ts')], outfile: join(lib, 'shared.js') });

// CSS 运行时注入：DSH 插件 client 不带独立 css 文件加载通道（dsh-automation 实证为
// createElement("style") 注入），.css import 编译成自注入模块。
const cssInjectPlugin = {
  name: 'dsh-wewrite-css-inject',
  setup(builder) {
    builder.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = JSON.stringify(readFileSync(args.path, 'utf8'));
      const contents = [
        `const css = ${css};`,
        '(typeof document !== "undefined") && (() => {',
        '  const el = document.createElement("style");',
        '  el.setAttribute("data-dsh-wewrite", "");',
        '  el.appendChild(document.createTextNode(css));',
        '  document.head.appendChild(el);',
        '})();',
        'module.exports = css;',
      ].join('\n');
      return { contents, loader: 'js' };
    });
  },
};

const clientResult = await build({
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  entryPoints: [join(root, 'src/client/index.tsx')],
  jsx: 'automatic',
  alias: { '@': join(root, 'src') },
  // 宿主 ModuleLoader 注册表提供（dsh-automation/官方 dsh-client-* 实证）：
  // react、react/jsx-runtime、react-dom、@deepseek-ai/dsh-client-ui-primitives。
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  plugins: [cssInjectPlugin],
  // write:false 下 esbuild 会把 sourcemap 以 data-URI 内联进 js（体积膨胀 6 倍）；
  // 源码随 repo 开源，map 不随产物分发。
  minify: true,
  logLevel: 'info',
  write: false,
});

for (const out of clientResult.outputFiles) {
  // write:false 无 outfile 时 esbuild 输出名是字面量 '<stdout>'（.map 为 '<stdout>.map'）。
  if (out.path === '<stdout>' || out.path.endsWith('.js')) {
    // 包 __ModuleLoader__.load 外壳：factory(require) 提供 CJS 依赖环境（宿主页面契约）。
    const body = out.text;
    const wrapped = `window.__ModuleLoader__.load({ id: "dsh-wewrite", factory: (require) => {\n${body}\nreturn module.exports; } });\n`;
    writeFileSync(join(lib, 'client.js'), wrapped, 'utf8');
  }
}

console.log('lib/index.js、lib/shared.js、lib/client.js 已生成');
