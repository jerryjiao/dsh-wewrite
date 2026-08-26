#!/usr/bin/env node
/** v9 终采：v8 会话回放（settled 卡+tail+跳写作台） + 等待审批会话的审批面板。 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'assets', 'screenshots');
mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => { await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log('captured', name); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' });
await sleep(6000);
for (const label of ['Continue', '继续', 'Configure later', '稍后配置', 'Skip', '跳过']) {
  const btn = page.getByRole('button', { name: label, exact: false });
  if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(2000); }
}

// ① v8 会话（程序员与写作）
const sess = page.locator('a,button,[role=button]').filter({ hasText: /程序员与写作/ }).first();
console.log('v8 会话条目:', await page.locator('a,button,[role=button]').filter({ hasText: /程序员与写作/ }).count());
if (await sess.count()) { await sess.click().catch(() => {}); await sleep(9000); }
const st = await page.evaluate(() => ({
  runCards: document.querySelectorAll('.ww-chatcard--run').length,
  tails: document.querySelectorAll('.ww-chatcard--tail').length,
  openDesk: [...document.querySelectorAll('button')].filter((b) => /打开写作台|在写作台打开/.test(b.textContent || '')).length,
  runText: (document.querySelector('.ww-chatcard--run')?.textContent || '').slice(0, 160),
  tailText: (document.querySelector('.ww-chatcard--tail')?.textContent || '').slice(0, 120),
}));
console.log('回放状态:', JSON.stringify(st, null, 1));
await sleep(2000);
await shot(page, '10-chat-final');

// ② 卡片「打开写作台」联动
if (st.openDesk > 0) {
  await page.getByRole('button', { name: /打开写作台|在写作台打开/ }).first().click().catch(() => {});
  await sleep(3500);
  if (await page.locator('[data-testid="ww-overlay"]').count()) {
    console.log('卡片→浮层联动 ✅');
    await shot(page, '13-chat-card-to-overlay');
    await page.locator('[data-testid="ww-overlay-close"]').first().click().catch(async () => {
      await page.keyboard.press('Escape');
    });
    await sleep(1500);
  }
}

// ③ 等待审批会话（推送审批面板活演示）
const appr = page.locator('a,button,[role=button]').filter({ hasText: /等待审批/ }).first();
if (await appr.count()) {
  await appr.click().catch(() => {});
  await sleep(7000);
  await shot(page, '14-chat-approval-panel');
  console.log('审批面板已截（未点击，保持 pending 给 Jerry 现场看）');
}
console.log('DONE');
await browser.close();
