#!/usr/bin/env node
/**
 * hostctl —— DSH 宿主生命周期 CLI（v0.2.0 测试基建）
 *
 * 用法：node scripts/hostctl.mjs <status|start|stop|restart|ensure>
 *   status   查宿主是否在跑（监听 127.0.0.1:3080）、PID、env 是否含 ZHIPU_API_KEY
 *   stop     kill 监听 3080 的全部进程（SIGTERM → ≤15s 等端口释放 → SIGKILL 兜底）
 *   start    未跑才拉起：node <dsh-bin> web，detached + 日志落 /tmp/dsh-web.log
 *   restart  stop → 等端口释放 → start → 轮询就绪（≤30s）→ 打印状态摘要
 *   ensure   幂等：在跑且 env 齐 → no-op；在跑但缺 env → 自动 restart；没跑 → start
 *
 * key 纪律：ZHIPU_API_KEY 只在 start 时从 ~/.zcode/cli/config.json 现读现注入子进程
 * env，不打印、不写日志、不落任何文件（key 唯一注入点，轮换自动跟随）。
 * 本文件同时导出纯函数供 dev-install.mjs / tests/e2e 复用，import 时无副作用。
 */
import { execFileSync, spawn } from 'node:child_process';
import { openSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'http://127.0.0.1:3080';
const PORT = 3080;
const LOG = '/tmp/dsh-web.log';

// ---------- key 解析 ----------
// 读 ~/.zcode/cli/config.json 的 provider 表，取 baseURL 含 open.bigmodel.cn
// 且 id 含 coding-plan 的 apiKey（排除 imported:claude 同域条目）。
export function extractZhipuApiKey() {
  const config = JSON.parse(readFileSync(join(homedir(), '.zcode/cli/config.json'), 'utf8'));
  for (const [id, provider] of Object.entries(config.provider ?? {})) {
    const baseURL = provider?.options?.baseURL ?? '';
    const apiKey = provider?.options?.apiKey;
    if (
      id.includes('coding-plan') &&
      baseURL.includes('open.bigmodel.cn') &&
      typeof apiKey === 'string' &&
      apiKey.length >= 40
    ) {
      return apiKey;
    }
  }
  throw new Error('zcode config（~/.zcode/cli/config.json）未找到 bigmodel coding-plan 的 apiKey');
}

// ---------- 探测 ----------
// lsof -ti tcp:3080：返回所有监听进程 PID（去重；空返回 []）
export function findHostPids() {
  let out = '';
  try {
    out = execFileSync('lsof', ['-ti', `tcp:${PORT}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))];
}

// macOS ps eww 检查进程 env 是否带 ZHIPU_API_KEY（只返回布尔，不外泄 env 内容）
export function hasZhipuEnv(pid) {
  try {
    return execFileSync('ps', ['eww', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .includes('ZHIPU_API_KEY=');
  } catch {
    return false;
  }
}

// dsh 可执行文件动态解析（npx 缓存哈希目录会变，不硬编码）：
// ① PATH 里的 dsh；② glob ~/.npm/_npx/*/node_modules/.bin/dsh；③ 都没有则报错
export function resolveDshBin() {
  try {
    const which = execFileSync('which', ['dsh'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (which) return realpathSync(which);
  } catch {
    // PATH 里没有 dsh，走 npx 缓存扫描
  }
  const npxRoot = join(homedir(), '.npm/_npx');
  try {
    for (const entry of readdirSync(npxRoot)) {
      const candidate = join(npxRoot, entry, 'node_modules/.bin/dsh');
      try {
        return realpathSync(candidate);
      } catch {
        // 该缓存目录没有 dsh，继续扫
      }
    }
  } catch {
    // ~/.npm/_npx 不存在
  }
  throw new Error('未找到 dsh 可执行文件（PATH 与 ~/.npm/_npx/*/node_modules/.bin/dsh 均未命中）。请先手动跑一次 `npx dsh web` 让 npx 落缓存，再重试');
}

// ---------- 生命周期 ----------
export async function waitReady(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // 任何 HTTP 响应（含 404/5xx）都算监听；连接被拒/超时则重试
      await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`宿主 ${BASE} ${timeoutMs}ms 内未就绪，排查日志：${LOG}`);
}

export async function startHost() {
  const pids = findHostPids();
  if (pids.length) {
    console.log(`宿主已在跑（PID ${pids.join(', ')}），ZHIPU_API_KEY: ${pids.some((p) => hasZhipuEnv(p)) ? 'OK' : 'MISSING（用 restart 补注入）'}`);
    return;
  }
  const bin = resolveDshBin();
  const fd = openSync(LOG, 'a');
  const child = spawn(process.execPath, [bin, 'web'], {
    cwd: process.cwd(), // 继承当前 shell 的 cwd 与 env，仅追加 ZHIPU_API_KEY
    env: { ...process.env, ZHIPU_API_KEY: extractZhipuApiKey() }, // 唯一注入点
    detached: true, // 脱离父进程，shell 退出宿主不死
    stdio: ['ignore', fd, fd], // 日志落文件，防 SIGPIPE 挂死
  });
  child.unref();
  await waitReady();
  const started = findHostPids();
  console.log(`宿主已起（PID ${started.join(', ')}），ZHIPU_API_KEY: OK，日志 ${LOG}`);
}

export async function stopHost() {
  const pids = findHostPids();
  if (!pids.length) {
    console.log('宿主未在跑（3080 无监听），无需停止');
    return;
  }
  for (const pid of pids) {
    try {
      process.kill(Number.parseInt(pid, 10), 'SIGTERM');
    } catch {
      // 进程已退出，继续
    }
  }
  // 轮询端口释放（≤15s），仍在则 SIGKILL 兜底
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (findHostPids().length === 0) {
      console.log(`宿主已停（原 PID ${pids.join(', ')}）`);
      return;
    }
  }
  for (const pid of findHostPids()) {
    try {
      process.kill(Number.parseInt(pid, 10), 'SIGKILL');
    } catch {
      // 已退出
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
  const remain = findHostPids();
  if (remain.length) throw new Error(`SIGKILL 后仍有进程监听 3080：${remain.join(', ')}`);
  console.log(`宿主已停（SIGKILL 兜底，原 PID ${pids.join(', ')}）`);
}

export function hostStatus() {
  const pids = findHostPids();
  if (!pids.length) return { running: false, pids: [], envOk: false };
  return { running: true, pids, envOk: pids.some((p) => hasZhipuEnv(p)) };
}

function printStatus() {
  const s = hostStatus();
  if (!s.running) {
    console.log(`宿主状态：未运行（127.0.0.1:${PORT} 无监听）`);
    return s;
  }
  console.log(`宿主状态：运行中`);
  console.log(`PID：${s.pids.join(', ')}`);
  console.log(`端口：127.0.0.1:${PORT} 监听中`);
  console.log(`ZHIPU_API_KEY：${s.envOk ? 'OK' : 'MISSING（restart 可补注入）'}`);
  return s;
}

export async function restartHost() {
  await stopHost();
  await startHost();
  printStatus();
}

export async function ensureHost() {
  const s = hostStatus();
  if (!s.running) {
    console.log('ensure：宿主未在跑，执行 start');
    await startHost();
    return;
  }
  if (s.envOk) {
    console.log(`ensure：宿主在跑且 env 齐全（PID ${s.pids.join(', ')}），无需操作`);
    return;
  }
  console.log(`ensure：宿主在跑但缺 ZHIPU_API_KEY（PID ${s.pids.join(', ')}），执行 restart 补注入`);
  await restartHost();
}

// ---------- CLI 入口（import 复用时无副作用） ----------
const USAGE = '用法：node scripts/hostctl.mjs <status|start|stop|restart|ensure>';

async function main(cmd) {
  switch (cmd) {
    case 'status':
      printStatus();
      break;
    case 'start':
      await startHost();
      break;
    case 'stop':
      await stopHost();
      break;
    case 'restart':
      await restartHost();
      break;
    case 'ensure':
      await ensureHost();
      break;
    default:
      console.error(cmd ? `未知子命令：${cmd}\n${USAGE}` : USAGE);
      process.exit(1);
  }
}

const invokedAsCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsCli) {
  main(process.argv[2]).catch((err) => {
    console.error(`hostctl 出错：${err.message}`);
    process.exit(1);
  });
}
