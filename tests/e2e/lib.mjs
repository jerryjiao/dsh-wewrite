/**
 * tests/e2e/lib.mjs —— E2E 用例共享断言/操作库（v0.2.0，QA 严过关）。
 *
 * 锚点真源：docs/redesign/uiux-workbench-delta.md §1（DOM 契约，已冻结）——
 * 有 data-testid 的锚点一律走 testid（delta §5-8），无 testid 的走 class/aria 沿用锚
 * （选题/定时/设置三页骨架不动，锚点来自 src/client 现状核实）。
 * 等待纪律（架构文档 §2.3.2）：断言走 DOM 等待封装，禁止裸 sleep；
 * 唯一例外是宿主就绪与 LLM 真跑轮询（pollUntil 内部节拍）。
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export { assert };

export const E2E_DIR = dirname(fileURLToPath(import.meta.url));
export const HOSTCTL = join(E2E_DIR, '../../scripts/hostctl.mjs');
export const STORAGE_PATH = join(homedir(), '.dsh/storages/dsh_wewrite.json');

// ---------- 断言封装（失败消息带定位说明，截图由 runner 统一落 artifacts） ----------

/** 等待可见并断言（DOM 等待，非裸 sleep）；超时时抛带语义 msg 的错误（排查友好） */
export async function expectVisible(locator, { timeout = 8000, msg } = {}) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
  } catch (err) {
    throw new Error(
      `${msg ?? '元素未在超时内可见'}（${timeout}ms；原始：${err.message.split('\n')[0].slice(0, 140)}）`,
    );
  }
}

/** 断言元素存在（count>0，不要求可见——用于挂载性/结构性断言） */
export async function expectPresent(locator, msg) {
  const n = await locator.count();
  assert.ok(n > 0, msg ?? `期望元素存在，实际 count=${n}（${String(locator)}）`);
}

/** 断言元素不存在（count===0，负向断言专用） */
export async function expectAbsent(locator, msg) {
  const n = await locator.count();
  assert.ok(n === 0, msg ?? `期望元素不存在，实际 count=${n}（${String(locator)}）`);
}

/** 断言元素不可见（存在但隐藏/折叠也接受） */
export async function expectNotVisible(locator, { timeout = 3000, msg } = {}) {
  let visible = true;
  try {
    await locator.first().waitFor({ state: 'hidden', timeout });
    visible = false;
  } catch {
    visible = await locator.first().isVisible().catch(() => false);
  }
  assert.ok(!visible, msg ?? `期望元素不可见（${String(locator)}）`);
}

/** 断言文本包含 */
export async function expectTextContains(locator, needle, msg) {
  const text = (await locator.first().innerText({ timeout: 8000 })).trim();
  assert.ok(
    text.includes(needle),
    msg ?? `期望文本包含「${needle}」，实际：「${text.slice(0, 120)}」`,
  );
}

/** 轮询直到 fn 返回真值（超时抛错；LLM 真跑/异步落库专用节拍） */
export async function pollUntil(fn, { timeout = 15000, interval = 500, msg } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  assert.ok(false, msg ?? `轮询 ${timeout}ms 未满足（最后值：${JSON.stringify(last)}）`);
}

// ---------- 顶栏导航（DOM 契约 §1-1） ----------

export const TAB = {
  home: '[data-testid="ww-topbar-tab-home"]',
  hotspots: '[data-testid="ww-topbar-tab-hotspots"]',
  schedule: '[data-testid="ww-topbar-tab-schedule"]',
};

/** 点顶栏导航对象并断言 aria-current=page 跟随 */
export async function clickTab(page, key, { timeout = 6000 } = {}) {
  const btn = page.locator(TAB[key]).first();
  await btn.waitFor({ state: 'visible', timeout });
  await btn.click();
  await pollUntil(
    async () => (await btn.getAttribute('aria-current')) === 'page',
    { timeout: 4000, msg: `点击 ${key} 后 aria-current 未跟随` },
  );
  return btn;
}

/** 回写作工作区（用例自足起点：多数用例要求 home 态） */
export async function gotoWorkbench(page) {
  return clickTab(page, 'home');
}

/**
 * 点编辑器三视图分段并等 aria-selected 跟随（DOM 契约 §1-7）。
 * 用例自足原则（二轮教训）：视图选择持久化 localStorage['ww.editor.view']，
 * 用例尾态会串扰后续用例——凡依赖特定视图（cm / preview）的用例必须显式前置，
 * 不依赖上一用例尾停在哪个视图；改完视图的用例应收尾复位 split（宽态默认）。
 */
export async function setEditorView(page, view, { timeout = 6000 } = {}) {
  const tab = page.locator(`[data-testid="ww-view-tab-${view}"]`).first();
  await tab.waitFor({ state: 'visible', timeout });
  await tab.click();
  await pollUntil(
    async () => (await tab.getAttribute('aria-selected')) === 'true',
    { timeout: 4000, msg: `切 ${view} 视图后 aria-selected 未跟随` },
  );
  return tab;
}

// ---------- 宿主生命周期（I 组 / H 组用；hostctl 唯一注入点，ADR-010） ----------

export function hostctl(...args) {
  const r = spawnSync(process.execPath, [HOSTCTL, ...args], {
    encoding: 'utf8',
    timeout: 60000,
  });
  if (r.status !== 0) {
    throw new Error(`hostctl ${args.join(' ')} 失败：${r.stdout ?? ''}${r.stderr ?? ''}`);
  }
  return r.stdout;
}

export function readStorageRaw() {
  return readFileSync(STORAGE_PATH, 'utf8');
}

// ---------- 常用复合锚点 ----------

export const LOC = {
  panelRoot: '.dsh-wewrite-panel',
  content: '#wewrite-panel-content',
  topbar: '[data-testid="ww-topbar"]',
  topbarNav: 'nav[aria-label="WeWrite 导航"]',
  settingsGear: '[data-testid="ww-topbar-settings"]',
  conn: '[data-testid="ww-topbar-conn"]',
  progressDot: '[data-testid="ww-progress-dot"]',
  progressCard: '[data-testid="ww-progress-card"]',
  workbench: '[data-testid="ww-workbench"]',
  rail: '[data-testid="ww-rail"]',
  railList: '.ww-rail__list',
  railNewForm: '[data-testid="ww-rail-new"]',
  startup: '[data-testid="ww-startup"]',
  startupInput: '[data-testid="ww-startup-input"]',
  startupSubmit: '[data-testid="ww-startup-submit"]',
  gateOverlay: '[data-testid="ww-gate-overlay"]',
  gateChip: '[data-testid="ww-gate-chip"]',
  settingsNav: 'nav[aria-label="设置分组"]',
  viewTabs: '.ww-view-tabs[aria-label="编辑器视图"]',
  toasts: '.ww-toasts',
};
