#!/usr/bin/env node
/** v7：进 12 分钟前的会话（v5①，含成功 run）→ 显式切「对话」tab → dump 卡片。 */
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') logs.push('ERR: ' + m.text().slice(0, 150)); });

await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' });
await sleep(6000);
for (const label of ['Continue', '继续', 'Configure later', '稍后配置', 'Skip', '跳过']) {
  const btn = page.getByRole('button', { name: label, exact: false });
  if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(2000); }
}

// 点「程序员写技术博客12分钟」会话（不含「等待审批」前缀的那个）
const sess = page.locator('a,button,[role=button]').filter({ hasText: /^程序员写技术博客\d+分钟$/ }).first();
if (await sess.count()) { await sess.click(); await sleep(8000); }

// 找视图 tab 环，切「对话/Chat」
const tabs = await page.evaluate(() => [...document.querySelectorAll('[role=tab], [class*=view] button, [class*=tab] button')]
  .map((el) => (el.textContent || '').trim()).filter(Boolean));
console.log('视图 tabs:', JSON.stringify(tabs));
for (const name of ['对话', 'Chat']) {
  const tab = page.getByRole('tab', { name }).first();
  if (await tab.count()) { await tab.click().catch(() => {}); await sleep(4000); break; }
  const btn = page.locator('button').filter({ hasText: name }).first();
  if (await btn.count()) { await btn.click().catch(() => {}); await sleep(4000); break; }
}

const report = await page.evaluate(() => ({
  chatcards: document.querySelectorAll('[class*="ww-chatcard"]').length,
  runCards: document.querySelectorAll('.ww-chatcard--run').length,
  tails: document.querySelectorAll('.ww-chatcard--tail').length,
  openDeskBtns: [...document.querySelectorAll('button')].filter((b) => /打开写作台|在写作台打开/.test(b.textContent || '')).length,
  timelineSnippet: (document.querySelector('[class*=conversation], main')?.textContent || '').slice(0, 300),
}));
console.log(JSON.stringify(report, null, 1));
await page.screenshot({ path: '/tmp/v7-chatview.png' });
console.log('页面错误:', logs.length ? logs.slice(0, 8) : '无');
await browser.close();
