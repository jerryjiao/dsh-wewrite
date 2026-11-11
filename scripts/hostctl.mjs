#!/usr/bin/env node
/**
 * hostctl —— DSH 宿主生命周期 CLI（v0.2.0 测试基建）
 *
 * 用法：node scripts/hostctl.mjs <status|start|stop|restart|ensure>
 *   status   查宿主是否在跑（3080 上的 dsh 进程）、PID、版本、env 是否含 ZHIPU_API_KEY
 *   stop     kill 3080 上的 dsh 进程（SIGTERM → ≤15s 等退出 → SIGKILL 兜底；不碰其他进程）
 *   start    未跑才拉起：pinned 且 npx 缓存有同版本 → node 直跑缓存 bin；否则 npx --yes 装后跑。
 *            子进程一退出立即报错（带退出码 + 日志尾），不等超时
 *   restart  stop → start → 轮询就绪（≤180s，含 npx 首次下载）→ 打印状态摘要
 *   ensure   幂等：在跑且 env 齐、版本 = 期望版本 → no-op；否则 restart；没跑 → start
 *
 * 期望版本：DSH_HOST_VERSION 优先，否则查 `npm view @deepseek-ai/dsh dist-tags.latest`。
 * unpinned 查询失败显式报错——不退回任何本地旧缓存（旧缓存会让上游变更验证不到）。
 * pinned 时优先复用 npx 缓存里版本完全相等的 dsh（含它当初那套依赖）；找不到才 npx 装。
 *
 * key 纪律：ZHIPU_API_KEY 只在 start 时从 ~/.zcode/cli/config.json 现读现注入子进程
 * env，不打印、不写日志、不落任何文件（key 唯一注入点，轮换自动跟随）。
 * 本文件同时导出纯函数供 dev-install.mjs / tests/e2e 复用，import 时无副作用。
 */
import { execFileSync, spawn } from 'node:child_process';
import { openSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'http://127.0.0.1:3080';
const PORT = 3080;
const LOG = '/tmp/dsh-web.log';
const PKG = '@deepseek-ai/dsh';

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

// 进程命令行（取不到返回空串）
function commandOf(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// 从进程命令行取 @deepseek-ai/dsh 包目录，非 dsh 进程返回 null。
// npx 直接跑 .bin 垫片时 argv 是 node_modules/.bin/dsh，按同层 node_modules 还原包目录。
export function parseDshPkgDir(command) {
  const direct = command.match(/(\S+\/node_modules\/@deepseek-ai\/dsh)(?=[/\s]|$)/);
  if (direct) return direct[1];
  const shim = command.match(/(\S+\/node_modules)\/\.bin\/dsh(?=\s|$)/);
  return shim ? `${shim[1]}/@deepseek-ai/dsh` : null;
}

// 读在跑 dsh 进程的 package.json 版本；认不出、包名不符或读不到返回 null
export function readDshVersion(command) {
  const dir = parseDshPkgDir(command);
  if (!dir) return null;
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return pkg.name === PKG ? (pkg.version ?? null) : null;
  } catch {
    return null;
  }
}

// 当前宿主的可访问 URL：0.2.2 起根地址无 token 直接 401，日志里最后一条
// `dsh web: http://127.0.0.1:3080/?token=...` 就是本进程入口。读不到退回根地址。
// 仅供进程内导航——返回值含一次性访问 token，调用方不得打印。
export function readHostWebUrl(logPath = LOG) {
  try {
    const lines = readFileSync(logPath, 'utf8').trimEnd().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(/dsh web: (http:\/\/127\.0\.0\.1:3080\/\?token=[^\s]+)/);
      if (match) return match[1];
    }
  } catch {
    // 日志不可读：退回根地址，由穿越阶段的 401 空页暴露问题
  }
  return BASE;
}

// 3080 上真正的 dsh 进程（端口可能同时被浏览器连接等其他进程占用，不能按端口一刀切）
export function findDshPids() {
  return findHostPids().filter((pid) => parseDshPkgDir(commandOf(pid)) !== null);
}

// 期望版本：DSH_HOST_VERSION 优先，否则 npm latest。查询失败直接抛错，不退回旧缓存。
export function resolveExpectedVersion(env = process.env, run = execFileSync) {
  const pin = env.DSH_HOST_VERSION?.trim();
  if (pin) return pin;
  let stdout;
  try {
    stdout = run('npm', ['view', PKG, 'dist-tags.latest'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`查询 ${PKG} 的 npm latest 版本失败（不退回本地旧缓存）：${err.message}`);
  }
  const version = String(stdout ?? '').trim();
  if (!version) throw new Error(`查询 ${PKG} 的 npm latest 版本返回空值，无法启动宿主`);
  return version;
}

// semver 排序用（核心数字 + 预发布后缀），只服务 cordis 版本比较
function compareVersion(a, b) {
  const [ac, ap = ''] = a.split('-');
  const [bc, bp = ''] = b.split('-');
  const as = ac.split('.').map(Number);
  const bs = bc.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (as[i] ?? 0) - (bs[i] ?? 0);
    if (d) return d;
  }
  if (ap === bp) return 0;
  if (!ap) return 1;
  if (!bp) return -1;
  return ap < bp ? -1 : 1;
}

// 在 npx 缓存里找本地已装、版本完全相等的 dsh；多份时取 @deepseek-ai/cordis 版本最低的
// （旧依赖更接近当初那套）。返回 { dir, bin, cordisVersion }，没有返回 null。
export function findCachedHost(version, npxRoot = join(homedir(), '.npm/_npx')) {
  let entries;
  try {
    entries = readdirSync(npxRoot);
  } catch {
    return null;
  }
  const found = [];
  for (const entry of entries) {
    const dir = join(npxRoot, entry, 'node_modules/@deepseek-ai/dsh');
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
      continue; // 该缓存目录没有 dsh
    }
    if (pkg.name !== PKG || pkg.version !== version) continue;
    const bin = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.dsh ?? Object.values(pkg.bin ?? {})[0]);
    if (!bin) continue;
    let cordisVersion = null;
    try {
      cordisVersion =
        JSON.parse(readFileSync(join(npxRoot, entry, 'node_modules/@deepseek-ai/cordis/package.json'), 'utf8')).version ?? null;
    } catch {
      // 缓存缺 cordis：排到最后
    }
    found.push({ dir, bin: join(dir, bin), cordisVersion });
  }
  found.sort((a, b) =>
    a.cordisVersion == null ? 1 : b.cordisVersion == null ? -1 : compareVersion(a.cordisVersion, b.cordisVersion),
  );
  return found[0] ?? null;
}

// ---------- 生命周期 ----------
// 日志尾 N 行；token= 参数打码（URL 里的访问 token 不外泄）
export function tailLog(logPath = LOG, lines = 20) {
  try {
    return readFileSync(logPath, 'utf8')
      .trimEnd()
      .split('\n')
      .slice(-lines)
      .join('\n')
      .replace(/(token=)[^\s&"']+/gi, '$1***');
  } catch {
    return `（读不到日志 ${logPath}）`;
  }
}

// 子进程提前退出（任何退出码）立即抛错并带日志尾；超时 180s（含 npx 首次下载）。
export async function waitReady(child, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let exited;
  const onExit = (code, signal) => {
    exited = { code, signal };
  };
  child?.once('exit', onExit);
  try {
    while (Date.now() < deadline) {
      let ready = false;
      try {
        // 就绪 = 3080 有 HTTP 响应 且 有 dsh 进程在监听（防止端口被其他进程占时误判）
        await fetch(BASE, { signal: AbortSignal.timeout(2000) });
        ready = findDshPids().length > 0;
      } catch {
        // 还没起，继续轮询
      }
      if (exited) {
        const how = exited.signal ? `信号 ${exited.signal}` : `退出码 ${exited.code}`;
        throw new Error(`宿主子进程已退出（${how}），日志尾（${LOG}）：\n${tailLog()}`);
      }
      if (ready) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`宿主 ${BASE} ${timeoutMs}ms 内未就绪，排查日志：${LOG}`);
  } finally {
    child?.off?.('exit', onExit);
  }
}

// web 子命令参数：两条启动路径共用。--no-open 关掉宿主自开浏览器
// （e2e 用 playwright 无头，不需要；否则每次重启都冒一个新标签）。
export const WEB_ARGS = Object.freeze(['web', '--no-open']);

// 启动命令表：cached 有值走本地缓存 bin，否则 npx 装期望版本。
export function hostStartCommand(version, cached = null) {
  if (cached) return { cmd: process.execPath, args: [cached.bin, ...WEB_ARGS] };
  // --legacy-peer-deps=false 覆盖仓库 .npmrc（否则新版 dsh 的 peer 依赖不装，宿主启动即 ERR_MODULE_NOT_FOUND）。
  return { cmd: 'npx', args: ['--yes', '--legacy-peer-deps=false', `${PKG}@${version}`, ...WEB_ARGS] };
}

export async function startHost() {
  const s = hostStatus();
  if (s.running) {
    console.log(`宿主已在跑（PID ${s.pids.join(', ')}，版本 ${s.version ?? '未知'}），ZHIPU_API_KEY: ${s.envOk ? 'OK' : 'MISSING（用 restart 补注入）'}`);
    return;
  }
  const version = resolveExpectedVersion();
  // 版本号固定到 dist-tag 解析值，避免 npx 复用旧缓存。pin 时优先复用 npx 缓存里同版本的 dsh。
  const cached = process.env.DSH_HOST_VERSION?.trim() ? findCachedHost(version) : null;
  if (process.env.DSH_HOST_VERSION?.trim() && !cached) {
    console.log(`依赖可能与当初不同：npx 缓存里没有 ${PKG}@${version}，改走 npx 安装`);
  }
  const { cmd, args } = hostStartCommand(version, cached);
  if (cached) console.log(`宿主用本地缓存 ${cached.dir}（cordis ${cached.cordisVersion ?? '未知'}）`);
  const fd = openSync(LOG, 'a');
  const child = spawn(cmd, args, {
    cwd: process.cwd(), // 继承当前 shell 的 cwd 与 env，仅追加 ZHIPU_API_KEY
    env: { ...process.env, ZHIPU_API_KEY: extractZhipuApiKey() }, // 唯一注入点
    detached: true, // 脱离父进程，shell 退出宿主不死
    stdio: ['ignore', fd, fd], // 日志落文件，防 SIGPIPE 挂死
  });
  child.unref();
  await waitReady(child);
  const started = hostStatus();
  if (!started.running) throw new Error(`3080 已响应但未发现 dsh 进程（可能被其他进程占用），排查日志：${LOG}`);
  console.log(`宿主已起（PID ${started.pids.join(', ')}，版本 ${started.version ?? '未知'}，期望 ${version}），ZHIPU_API_KEY: OK，日志 ${LOG}`);
}

export async function stopHost() {
  const pids = findDshPids();
  if (!pids.length) {
    console.log('宿主未在跑（3080 无 dsh 进程），无需停止');
    return;
  }
  for (const pid of pids) {
    try {
      process.kill(Number.parseInt(pid, 10), 'SIGTERM');
    } catch {
      // 进程已退出，继续
    }
  }
  // 轮询 dsh 进程退出（≤15s），仍在则 SIGKILL 兜底
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (findDshPids().length === 0) {
      console.log(`宿主已停（原 PID ${pids.join(', ')}）`);
      return;
    }
  }
  for (const pid of findDshPids()) {
    try {
      process.kill(Number.parseInt(pid, 10), 'SIGKILL');
    } catch {
      // 已退出
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
  const remain = findDshPids();
  if (remain.length) throw new Error(`SIGKILL 后仍有 dsh 进程在跑：${remain.join(', ')}`);
  console.log(`宿主已停（SIGKILL 兜底，原 PID ${pids.join(', ')}）`);
}

export function hostStatus() {
  const listeners = findHostPids();
  const pids = findDshPids();
  if (!pids.length) return { running: false, pids: [], envOk: false, version: null, foreign: listeners.length > 0 };
  const version = readDshVersion(commandOf(pids[0]));
  return { running: true, pids, envOk: pids.some((p) => hasZhipuEnv(p)), version, foreign: listeners.length > pids.length };
}

function printStatus() {
  const s = hostStatus();
  if (!s.running) {
    console.log(`宿主状态：未运行（127.0.0.1:${PORT} 无 dsh 进程）`);
    if (s.foreign) console.log(`注意：${PORT} 端口上有非 dsh 进程，未计入宿主状态`);
    return s;
  }
  console.log(`宿主状态：运行中`);
  console.log(`PID：${s.pids.join(', ')}`);
  console.log(`版本：${s.version ?? '未知（进程路径下无 package.json）'}`);
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
  const expected = resolveExpectedVersion();
  const s = hostStatus();
  if (!s.running) {
    console.log(`ensure：宿主未在跑，执行 start（期望版本 ${expected}）`);
    await startHost();
    return;
  }
  if (s.envOk && s.version === expected) {
    console.log(`ensure：宿主在跑、env 齐全、版本 ${s.version} = 期望版本，无需操作（PID ${s.pids.join(', ')}）`);
    return;
  }
  const reasons = [];
  if (s.version !== expected) reasons.push(`在跑版本 ${s.version ?? '未知'} ≠ 期望版本 ${expected}`);
  if (!s.envOk) reasons.push('缺 ZHIPU_API_KEY');
  console.log(`ensure：${reasons.join('，')}（PID ${s.pids.join(', ')}），执行 restart`);
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
