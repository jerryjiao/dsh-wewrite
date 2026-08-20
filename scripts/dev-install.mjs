#!/usr/bin/env node
/**
 * dev-install —— 改版到生效的原子三连（v0.2.0 开发回路）
 *
 * 用法：node scripts/dev-install.mjs（或 npm run dev:install）
 * 顺序：
 *   1. npm run build                    —— 复用 package.json 构建（esbuild bundle + tsc types）
 *   2. rm -rf + cp -R lib/ → ~/.dsh/profiles/web/node_modules/dsh-wewrite/lib/
 *   3. hostctl ensure                   —— 宿主未跑则拉起；在跑缺 env 则 restart 补注入
 *
 * 为什么 cp 后必须重启宿主：host 侧 lib/index.js 是宿主进程 require 的 esbuild bundle，
 * 无 watch 无热重载；统一 ensure/restart 一并消除 host/client 两侧缓存不确定性。
 * 结尾打印「宿主就绪，刷新浏览器页面即生效」。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOSTCTL = join(ROOT, 'scripts/hostctl.mjs');
const TARGET = join(homedir(), '.dsh/profiles/web/node_modules/dsh-wewrite/lib');

// 1) 构建（复用 package.json 的 scripts.build，不重复实现）
console.log('[1/3] npm run build ...');
execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

// 2) 覆盖安装 lib/（先删后拷，保证没有旧产物残留）
console.log(`[2/3] 安装 lib/ -> ${TARGET} ...`);
rmSync(TARGET, { recursive: true, force: true });
cpSync(join(ROOT, 'lib'), TARGET, { recursive: true });

// 3) 宿主 ensure（幂等：env 齐且在跑 → no-op；缺 env → restart；未跑 → start）
console.log('[3/3] hostctl ensure ...');
const ensured = spawnSync(process.execPath, [HOSTCTL, 'ensure'], { stdio: 'inherit' });
if (ensured.status !== 0) {
  console.error('宿主 ensure 失败，安装未完成');
  process.exit(ensured.status ?? 1);
}

console.log('宿主就绪，刷新浏览器页面即生效');
