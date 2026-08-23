#!/usr/bin/env node
/**
 * tests/e2e/runner.mjs —— 轻量 E2E runner（v0.2.0 测试骨架）
 *
 * 用法：
 *   node tests/e2e/runner.mjs                      # 全相位（fresh → demo → live）
 *   node tests/e2e/runner.mjs --phase=fresh,demo   # 相位过滤
 *   node tests/e2e/runner.mjs --list               # 只列用例不执行
 *   npm run test:e2e / npm run test:e2e:live
 *
 * 用例注册约定：tests/e2e/cases/*.mjs 每文件 default export 用例对象（或数组）：
 *   { id, group, phase: 'fresh' | 'demo' | 'live', fn: async (page, ctx) => {} }
 *   ctx = { BASE, sleep, domIs, openPanel }（来自 tests/e2e/session.mjs）
 *
 * 相位语义（架构文档 §2.3.1）：fresh 前停宿主备份并重置 storage，跑完全部相位后
 * 恢复备份并校验一致（数据零丢失）；demo 相位的 seedDemo 未实现，有用例即标失败
 * （不静默跳过）；live 相位不动 storage。失败截图存 tests/e2e/artifacts/。
 * CI 环境无本机宿主（3080/zcode key），探测即跳过、退出码 0（§2.6）。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BASE,
  domIs,
  launchBrowser,
  openPanel,
  phaseDemoStorage,
  phaseFreshStorage,
  restoreIfBackedUp,
  sleep,
} from './session.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(E2E_DIR, 'cases');
const ARTIFACTS_DIR = join(E2E_DIR, 'artifacts');
const HOSTCTL = join(E2E_DIR, '../../scripts/hostctl.mjs');
const PHASE_ORDER = ['fresh', 'demo', 'live'];

// ---------- 参数解析 ----------
let phases = null;
let listOnly = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--list') {
    listOnly = true;
  } else if (arg.startsWith('--phase=')) {
    phases = arg.slice('--phase='.length).split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    console.error(`未知参数：${arg}（支持 --phase=fresh,demo,live 与 --list）`);
    process.exit(1);
  }
}
if (phases) {
  const bad = phases.filter((p) => !PHASE_ORDER.includes(p));
  if (bad.length) {
    console.error(`未知相位：${bad.join(', ')}（可选 fresh / demo / live）`);
    process.exit(1);
  }
}

// ---------- CI 跳过 ----------
if (process.env.CI) {
  console.log('CI 环境无本机宿主（3080 / zcode key 均不可用），跳过 E2E');
  process.exit(0);
}

// ---------- 用例加载 ----------
async function loadCases() {
  let files = [];
  try {
    files = readdirSync(CASES_DIR).filter((f) => f.endsWith('.mjs')).sort();
  } catch {
    throw new Error(`用例目录不存在：${CASES_DIR}`);
  }
  const cases = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(CASES_DIR, file)).href);
    const exported = mod.default;
    if (!exported) throw new Error(`${file} 缺少 default export 用例`);
    const list = Array.isArray(exported) ? exported : [exported];
    for (const c of list) {
      if (!c?.id || !c?.phase || typeof c.fn !== 'function') {
        throw new Error(`${file} 用例形状不符：需要 { id, group, phase: 'fresh'|'demo'|'live', fn(page, ctx) }`);
      }
      if (!PHASE_ORDER.includes(c.phase)) {
        throw new Error(`${file} 用例 ${c.id} 相位非法：${c.phase}`);
      }
      cases.push({ group: 'default', ...c, file });
    }
  }
  return cases;
}

async function ensureHostRunning() {
  const r = spawnSync(process.execPath, [HOSTCTL, 'ensure'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('hostctl ensure 失败（宿主未就绪）');
}

async function runPhase(page, ctx, phaseCases, results) {
  // 相位开始穿越一次，相位内复用同一 page（架构 §2.3.2）
  // 视口兜底：每相位开始恢复默认 1440x900——同一 page 跨相位复用，防上一相位任何
  // 用例把 viewport 留在窄态毒化本相位（E2E 首轮 A04 失败路径未恢复 → demo 相位连坐教训）
  await page.setViewportSize({ width: 1440, height: 900 });
  let traversed = true;
  try {
    await openPanel(page);
  } catch (err) {
    traversed = false;
    console.error(`相位穿越失败：${err.message}`);
  }
  for (const c of phaseCases) {
    if (!traversed) {
      results.push({ ...c, ok: false, error: '相位穿越失败（openPanel 抛错，见上方排查输出）', stack: '', ms: 0 });
      continue;
    }
    const t0 = Date.now();
    try {
      await c.fn(page, ctx);
      results.push({ ...c, ok: true, ms: Date.now() - t0 });
      console.log(`  PASS ${c.id}`);
    } catch (err) {
      results.push({ ...c, ok: false, error: err.message, stack: err.stack ?? '', ms: Date.now() - t0 });
      console.log(`  FAIL ${c.id}：${err.message}`);
      try {
        mkdirSync(ARTIFACTS_DIR, { recursive: true });
        await page.screenshot({ path: join(ARTIFACTS_DIR, `${c.id}.png`), fullPage: true });
        console.log(`  失败截图 -> tests/e2e/artifacts/${c.id}.png`);
      } catch {
        // 截图本身失败（page 已关闭等）不掩盖用例错误
      }
    }
  }
}

async function main() {
  const all = await loadCases();
  const selectedPhases = phases ?? PHASE_ORDER;
  const selected = all.filter((c) => selectedPhases.includes(c.phase));

  if (listOnly) {
    console.log(`用例清单（共 ${all.length} 个）：`);
    for (const ph of PHASE_ORDER) {
      for (const c of all.filter((x) => x.phase === ph)) {
        console.log(`  [${ph}] [${c.group}] ${c.id}  (${c.file})`);
      }
    }
    return 0;
  }

  console.log(`共加载 ${all.length} 用例，本次执行 ${selected.length} 个（相位：${selectedPhases.join(' -> ')}）`);
  await ensureHostRunning();

  const { browser, page } = await launchBrowser();
  const ctx = { BASE, sleep, domIs, openPanel };
  const results = [];
  let fatalError = null;
  try {
    for (const ph of selectedPhases) {
      const phaseCases = selected.filter((c) => c.phase === ph);
      if (!phaseCases.length) continue;
      console.log(`\n==== 相位 ${ph}（${phaseCases.length} 用例）====`);
      if (ph === 'fresh') {
        // 备份标记由 session.mjs 管理：备份成功后置位，失败也保证 finally 能恢复
        await phaseFreshStorage(); // 停宿主 → 备份 → 重置空 unit → 重启
      }
      if (ph === 'demo') {
        await phaseDemoStorage(); // 停宿主 → 备份（若未备）→ seedDemo 种子 → 重启
      }
      await runPhase(page, ctx, phaseCases, results);
    }
  } catch (err) {
    fatalError = err;
  } finally {
    // 只要做过备份就恢复（相位编排自身失败时已先行恢复，此处兜底二次校验，幂等；
    // 未做过备份时 restoreIfBackedUp 静默跳过）
    try {
      await restoreIfBackedUp();
    } catch (err) {
      console.error(`storage 恢复失败：${err.message}`);
      console.error(`备份仍在 /tmp/dsh-wewrite-e2e-backup.json，请手动恢复到 ~/.dsh/storages/dsh_wewrite.json（先停宿主）`);
    }
    await browser.close().catch(() => {});
  }
  if (fatalError) {
    console.error(`\nrunner 致命错误：${fatalError.stack ?? fatalError.message}`);
  }

  // ---------- 汇总 ----------
  const fails = results.filter((r) => !r.ok);
  console.log('\n==== E2E 结果 ====');
  for (const r of results) {
    const flag = r.ok ? 'PASS' : 'FAIL';
    console.log(`${flag}  [${r.phase}] [${r.group}] ${r.id}  ${(r.ms / 1000).toFixed(1)}s  (${r.file})`);
    if (!r.ok && r.stack) {
      const head = r.stack.split('\n').slice(0, 3).join('\n');
      console.log(`      ${head.split('\n').join('\n      ')}`);
    }
  }
  console.log('----');
  console.log(`${results.length} 用例：${results.length - fails.length} 通过 / ${fails.length} 失败` + (fails.length ? `（失败截图见 tests/e2e/artifacts/）` : ''));
  return fails.length > 0 || fatalError ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`runner 出错：${err.stack ?? err.message}`);
    process.exit(1);
  },
);
