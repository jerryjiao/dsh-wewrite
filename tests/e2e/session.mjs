/**
 * tests/e2e/session.mjs —— E2E 宿主驱动 helper（v0.2.0 测试骨架）
 *
 * 职责（架构文档 docs/redesign/test-zhipu-architecture.md §2.2/2.3）：
 *   - launchBrowser/openPanel/sleep/domIs：真浏览器穿越到 WeWrite 面板
 *   - 相位 storage 管理：backupStorage/resetStorage/restoreStorage/seedDemo +
 *     phaseFreshStorage/phaseDemoStorage/phaseRestoreStorage（fresh/demo/restore 编排）
 *
 * playwright 从 workspace 根 node_modules 向上解析命中（tmp-probe-btn.mjs 先例实证，
 * 不加 @playwright/test、不需要 NODE_PATH）。宿主生命周期复用 scripts/hostctl.mjs
 * 的导出函数（import 无副作用）；demo 种子复用 scripts/seed-demo-data.mjs 的
 * seedDemoData（单一逻辑源）。storage 写操作一律先停宿主（host 内存态会覆盖文件，
 * seed-demo-data.mjs 先例实证）。
 */
import { chromium } from 'playwright';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findHostPids, startHost, stopHost } from '../../scripts/hostctl.mjs';
import { seedDemoData } from '../../scripts/seed-demo-data.mjs';

export const BASE = 'http://127.0.0.1:3080';
const UNIT_PATH = join(homedir(), '.dsh/storages/dsh_wewrite.json');
const BACKUP_PATH = '/tmp/dsh-wewrite-e2e-backup.json';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 启动无头浏览器并开一个固定参数的 page：
 * viewport 1440x900 / locale zh-CN / deviceScaleFactor 1（截图排查够用，省内存）。
 */
export async function launchBrowser() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    deviceScaleFactor: 1,
  });
  return { browser, page };
}

/** domIs：容错探测（可见等待的 try/bool 形态，不抛错）；断言用例里抛错请自行判断返回值 */
export async function domIs(locator, { timeout = 8000 } = {}) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/** 穿越失败时 dump 页面可点文本，辅助排查宿主 DOM 变化（capture 脚本先例） */
async function dumpClickable(page) {
  const texts = await page.locator('button, [role=tab], a').allInnerTexts().catch(() => []);
  console.error('[openPanel 排查] 页面可点文本：', texts.slice(0, 40).join(' | '));
}

/**
 * openPanel：goto → onboarding → workspace → 首消息 → 写作台 tab → 面板出现。
 * 复刻 scripts/capture-screenshots.mjs 第 1-3 段的实测序列与容错：
 *   - onboarding 按钮（Continue/继续 exact；Configure later/稍后配置/Skip/跳过 contains）
 *     每步短超时探测，不弹就过；
 *   - workspace 输入行 placeholder 双语正则 + 通用 input 回退；已存在则点侧栏项；
 *   - 首消息激活会话（不依赖模型回包成功——无 key 报错但视图环已挂载，实测注释）；
 *   - 写作台 tab 双 locale 回退。
 */
export async function openPanel(page) {
  // 1) 首页 + onboarding 向导（新 profile localStorage 为空时可能弹）
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  for (const label of ['Continue', '继续']) {
    const btn = page.getByRole('button', { name: label, exact: true }).first();
    if (await domIs(btn, { timeout: 1000 })) {
      await btn.click().catch(() => {});
      await sleep(2000);
    }
  }
  for (const label of ['Configure later', '稍后配置', 'Skip', '跳过']) {
    const btn = page.getByRole('button', { name: label, exact: false }).first();
    if (await domIs(btn, { timeout: 1000 })) {
      await btn.click().catch(() => {});
      await sleep(2000);
    }
  }
  await sleep(1500);

  // 1.5) 重进场景早退：宿主恢复上次会话时 WeWrite 面板可能已直接挂载——
  // 此时跳过 workspace/首消息/tab 步骤直接返回面板。关键防线：下方首消息的
  // composer 回退 locator（textarea/[contenteditable=true] 全页 first()）会命中
  // 面板编辑器 CodeMirror 的 .cm-content（contenteditable=true），把 'e2e-init'
  // 打进文章正文并触发自动保存落库，污染文章数据（二轮 E02/E03「e2e-init」
  // 8 字串扰的真根因——重进前面板已随会话恢复）。
  const restoredPanel = page.locator('.dsh-wewrite-panel').first();
  if (await domIs(restoredPanel, { timeout: 3000 })) {
    return restoredPanel;
  }

  // 2) workspace 打开会话（fill → Enter；已存在则直接点侧栏 workspace 项）
  const wsInput = (await page.getByPlaceholder(/workspace|工作区/i).count()
    ? page.getByPlaceholder(/workspace|工作区/i)
    : page.locator('input[type=text], input:not([type])')
  ).first();
  const hasSession = await page.getByText(/还没有会话|No sessions/i).count();
  if ((await wsInput.count()) && hasSession) {
    await wsInput.click();
    await wsInput.fill('/tmp/dsh-demo-workspace');
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(4000);
  } else {
    const wsItem = page.getByText('workspace', { exact: true }).first();
    if (await wsItem.count()) {
      await wsItem.click({ force: true }).catch(() => {});
      await sleep(4000);
    }
  }

  // 2.5) 空会话下宿主不渲染视图区——发首消息让 tab 环挂载（消息内容无关紧要）。
  // 回退 locator 排除 .cm-content（CodeMirror 内容区也是 contenteditable=true，
  // 面板恢复/晚挂载竞态下会被全页 first() 误命中——见 1.5 注释的数据污染教训）
  const composer = (await page.getByPlaceholder(/describe|描述/i).count()
    ? page.getByPlaceholder(/describe|描述/i)
    : page.locator('textarea, [contenteditable=true]:not(.cm-content)')
  ).first();
  if (await composer.count()) {
    await composer.click();
    await composer.fill('e2e-init').catch(async () => {
      await composer.type('e2e-init');
    });
    await sleep(400);
    await page.keyboard.press('Enter');
    await sleep(6000); // 模型未配 key 会报错，但会话已非空、视图环已挂载
  }

  // 3) 找到并点开写作台 tab（locale zh/en 回退）
  let tab = null;
  for (const n of ['写作台', 'Workbench', 'WeWrite', 'wewrite']) {
    const el = page.getByRole('tab', { name: n, exact: false });
    if (await el.count()) { tab = el.first(); break; }
    const btn = page.getByRole('button', { name: n, exact: false });
    if (await btn.count()) { tab = btn.first(); break; }
  }
  if (!tab) {
    await dumpClickable(page);
    throw new Error('写作台 tab 未找到（宿主 DOM 可能已变化，见上方排查输出）');
  }
  await tab.click();
  await sleep(4000);

  // 终点断言：WeWrite 面板根挂载
  const panel = page.locator('.dsh-wewrite-panel').first();
  if (!(await domIs(panel, { timeout: 10000 }))) {
    await dumpClickable(page);
    throw new Error('.dsh-wewrite-panel 未出现（v0.2 UI 重构后锚点可能变化，见上方排查输出）');
  }
  return panel;
}

// ---------- 相位 storage 管理（§2.3.1） ----------
// 实测路径：~/.dsh/storages/dsh_wewrite.json（2026-08-19 ls + 结构核实，
// 顶层 {unit, global:{v,settings,claimedOccurrences}, tables:{articles,runs,schedules,images}}）。

/** storage 写操作前置断言：宿主必须已停（host 内存态会覆盖文件） */
function assertHostStopped(op) {
  const pids = findHostPids();
  if (pids.length) {
    throw new Error(`storage ${op} 要求宿主已停止（监听 3080 的 PID：${pids.join(', ')}）`);
  }
}

/** 备份现网 unit 到 /tmp（幂等：直接覆盖旧备份） */
export function backupStorage() {
  assertHostStopped('backup');
  const unit = readFileSync(UNIT_PATH, 'utf8');
  writeFileSync(BACKUP_PATH, unit, 'utf8');
  console.log(`storage 已备份 -> ${BACKUP_PATH}`);
}

/** 重置为全新用户态（fresh 相位）：直接删除 unit 文件，让宿主下次启动走 lazy create
 * （openJsonUnit 对 ENOENT 用 descriptor.version + INITIAL_GLOBAL 建单元——宿主自己的
 * 权威初始化路径，schema 进化无需本脚本跟随）。
 * 实测踩坑记录：手写「最小空 unit」两处翻车——① unit header 必须是对象
 * {name:'dsh_wewrite', version:1} 而非字符串（否则 missing or foreign unit header）；
 * ② claimedOccurrences 是 z.array 而非对象（否则 stored global does not match its
 * schema）。删文件一并绕开这两类 schema 耦合。 */
export function resetStorage() {
  assertHostStopped('reset');
  rmSync(UNIT_PATH, { force: true });
  console.log('storage 已重置（unit 文件删除，宿主下次启动 lazy create 全新状态）');
}

/** 从备份恢复 unit，并校验与备份逐字节一致 */
export function restoreStorage() {
  assertHostStopped('restore');
  const backup = readFileSync(BACKUP_PATH, 'utf8');
  writeFileSync(UNIT_PATH, backup, 'utf8');
  const restored = readFileSync(UNIT_PATH, 'utf8');
  if (restored !== backup) throw new Error('storage 恢复后校验不一致（写入与读回不相等）');
  console.log('storage 已从备份恢复（校验一致）');
}

/** 备份状态（模块级）：phaseFreshStorage 备份成功后置位，restoreIfBackedUp 据此决定是否恢复 */
let backupTaken = false;

/**
 * fresh 相位编排：停宿主 → 备份 → 重置 → 重启（带 env；startHost 内含就绪轮询）。
 * 任一步失败都会先恢复备份再抛出（数据不留半途）。
 */
export async function phaseFreshStorage() {
  await stopHost();
  try {
    backupStorage();
    backupTaken = true;
    resetStorage();
  } catch (err) {
    if (backupTaken) {
      try { restoreStorage(); } catch { /* 备份本身不可用时无从恢复，抛原始错误 */ }
    }
    throw err;
  }
  try {
    await startHost();
  } catch (err) {
    // 宿主起不来（如 unit 形状被拒）：先停干净再恢复备份，避免数据停在重置态
    await stopHost().catch(() => {});
    try { restoreStorage(); } catch { /* 恢复失败由上层 finally 兜底警告 */ }
    throw err;
  }
}

/** demo 相位种子写入：读当前 unit → 整表替换种子集（seedDemoData，与
 * scripts/seed-demo-data.mjs CLI 同一份逻辑，不抄两份）→ 写回。
 * 种子集合与「刻意不种 schedule run」的原因见 seed-demo-data.mjs 头注释。 */
export function seedDemo() {
  assertHostStopped('seed');
  const unit = JSON.parse(readFileSync(UNIT_PATH, 'utf8'));
  seedDemoData(unit);
  writeFileSync(UNIT_PATH, JSON.stringify(unit, null, 2), 'utf8');
  console.log('storage 已种入 demo 种子（3 文章 / 2 run / 1 schedule，imageProviders 裁单家 openai）');
}

/**
 * demo 相位编排（§2.3.1）：停宿主 → 备份（若 fresh 未备过）→ 种子写入 → 重启（带 env）。
 * - 连跑 fresh→demo：fresh 已备份，此处不重复；种子在 fresh 用例操作后的状态上整表替换
 *   tables，settings 只覆盖 imageProviders（llmDefault 等 fresh 配置保留）。
 * - 单独跑 --phase=demo：先备份现网再种入，runner 收尾 restoreIfBackedUp 恢复现网
 *   （现网数据零丢失）。
 * - 幂等：种子是整表替换（非 merge），重跑 tables 结果一致。
 * 任一步失败先恢复备份再抛出。
 */
export async function phaseDemoStorage() {
  await stopHost();
  try {
    if (!backupTaken) {
      backupStorage();
      backupTaken = true;
    }
    seedDemo();
  } catch (err) {
    await stopHost().catch(() => {});
    if (backupTaken) {
      try { restoreStorage(); } catch { /* 恢复失败由 runner finally 兜底警告 */ }
    }
    throw err;
  }
  await startHost();
}

/** restore 相位编排：停宿主 → 恢复备份并校验 → 重启（带 env） */
export async function phaseRestoreStorage() {
  await stopHost();
  restoreStorage();
  await startHost();
}

/** runner 收尾用：只在确实做过备份时恢复（幂等；恢复成功后清除标记） */
export async function restoreIfBackedUp() {
  if (!backupTaken) return;
  await phaseRestoreStorage();
  backupTaken = false;
}
