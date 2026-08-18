#!/usr/bin/env node
/**
 * 官网/README 截图采集（2026-08-19）。跑在本机 dsh web（127.0.0.1:3080）上，
 * 用 workspace 根 node_modules 的 playwright 驱动真实 Chromium 逐页实拍。
 * 用法：先 scripts/seed-demo-data.mjs（dsh web 未运行时）→ 起 dsh web → node 本脚本。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://127.0.0.1:3080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('captured', name);
};

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: 'zh-CN', // 中文界面截图（DSH UI 与插件 tab 标签都按 locale 本地化）
});

// 1) 首页：可能弹 beta consent / API key 向导（新 profile localStorage 为空）
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(4000);
for (const label of ['Continue', '继续']) {
  const btn = page.getByRole('button', { name: label, exact: true });
  if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(2500); }
}
for (const label of ['Configure later', '稍后配置', 'Skip', '跳过']) {
  const btn = page.getByRole('button', { name: label, exact: false });
  if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(2500); }
}
await sleep(2000);

// 2) 主界面：填 workspace 打开会话（实测序列：fill → 点击输入行 → 会话引导完成，
//    会话视图出现后 conversation.view tab 环才挂载）；placeholder 双语正则 + 通用回退
const wsInput = (await page.getByPlaceholder(/workspace|工作区/i).count()
  ? page.getByPlaceholder(/workspace|工作区/i)
  : page.locator('input[type=text], input:not([type])')
).first();
const hasSession = await page.getByText(/还没有会话|No sessions/i).count();
if (await wsInput.count() && hasSession) {
  await wsInput.click();
  await wsInput.fill('/tmp/dsh-demo-workspace');
  await sleep(500);
  await page.keyboard.press('Enter');
  await sleep(4000);
} else {
  // workspace 已存在：直接点侧栏 workspace 项开新会话
  const wsItem = page.getByText('workspace', { exact: true }).first();
  if (await wsItem.count()) {
    await wsItem.click({ force: true }).catch(() => {});
    await sleep(4000);
  }
}

// 2.5) 空会话（blank composerPhase）下宿主不渲染视图区（ui-conversation 源码 7077 行前
//      的 blank 早退）——发一条首消息让会话离开 blank 态，tab 环才挂载
const composer = (await page.getByPlaceholder(/describe|描述/i).count()
  ? page.getByPlaceholder(/describe|描述/i)
  : page.locator('textarea, [contenteditable=true]')
).first();
if (await composer.count()) {
  await composer.click();
  await composer.fill('你好，这是一条初始化会话的消息。').catch(async () => {
    await composer.type('你好，这是一条初始化会话的消息。');
  });
  await sleep(400);
  await page.keyboard.press('Enter');
  await sleep(8000); // 模型未配 key 会报错，但会话已非空、视图环已挂载
}

// 3) 找到插件 tab（locale zh=en 都试）
const tabNames = ['写作台', 'Workbench', 'WeWrite', 'wewrite'];
let tab = null;
for (const n of tabNames) {
  const el = page.getByRole('tab', { name: n, exact: false });
  if (await el.count()) { tab = el.first(); break; }
  const btn = page.getByRole('button', { name: n, exact: false });
  if (await btn.count()) { tab = btn.first(); break; }
}
if (!tab) {
  console.error('!! wewrite tab 未找到——截图中止，列出页面可点文本辅助排查：');
  console.error((await page.locator('button, [role=tab], a').allInnerTexts().catch(() => [])).slice(0, 40).join(' | '));
  await shot(page, '00-debug-main');
  await browser.close();
  process.exit(1);
}
await tab.click();
await sleep(4000);
await shot(page, '01-dashboard');

// 4) 面板内 5 个子导航
const goPanel = async (label) => {
  const el = page.getByRole('button', { name: label, exact: false }).first();
  const alt = page.getByText(label, { exact: false }).first();
  const target = (await el.count()) ? el : ((await alt.count()) ? alt : null);
  if (!target) { console.error('panel miss:', label); return false; }
  await target.click().catch(() => {});
  await sleep(3000);
  return true;
};

if (await goPanel('选题中心')) { await sleep(4000); await shot(page, '02-hotspots'); }
if (await goPanel('文章库')) { await sleep(1500); await shot(page, '03-articles'); }

// 编辑器：点进文章（按标题行）
const row = page.getByText('把公众号写作管线装进 DeepSeek Harness', { exact: false }).first();
if (await row.count()) {
  await row.click().catch(() => {});
  await sleep(3500);
  await shot(page, '04-editor');
  // 微信预览 tab
  const preview = page.getByRole('button', { name: '微信预览', exact: false }).first();
  if (await preview.count()) {
    await preview.click().catch(() => {});
    await sleep(2000);
    await shot(page, '05-editor-preview');
  }
}

if (await goPanel('定时任务')) { await sleep(1500); await shot(page, '06-schedule'); }
if (await goPanel('设置')) {
  await sleep(1500);
  await shot(page, '07-settings');
  const imgNav = page.getByText('图片供应商', { exact: false }).first();
  if (await imgNav.count()) { await imgNav.click().catch(() => {}); await sleep(1500); await shot(page, '08-settings-images'); }
}

await browser.close();
console.log('done ->', OUT);
