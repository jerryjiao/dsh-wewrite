#!/usr/bin/env node
/** v8 蛮力事实：新会话全链 + 全量 console（含 warn）+ 每步断言。 */
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e).slice(0, 250)));

await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' });
await sleep(6000);
for (const label of ['Continue', '继续', 'Configure later', '稍后配置', 'Skip', '跳过']) {
  const btn = page.getByRole('button', { name: label, exact: false });
  if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(2000); }
}
console.log('STEP1 sidebar entry:', await page.locator('[data-testid="ww-sidebar-entry"]').count());

const newBtn = page.getByRole('button', { name: /new session|新建会话|新会话/i }).first();
console.log('STEP2 新会话按钮:', await newBtn.count());
if (await newBtn.count()) { await newBtn.click().catch(() => {}); await sleep(3000); }

const composer = page.getByPlaceholder(/describe|描述/i).first();
console.log('STEP3 composer:', await composer.count());
if (!(await composer.count())) {
  console.log('全文 console:', logs.slice(0, 25));
  await page.screenshot({ path: '/tmp/v8-nocomposer.png' });
  await browser.close(); process.exit(0);
}
await composer.click();
await composer.fill('用 wewrite 写一篇题为《程序员与写作》的短文');
await composer.press('Enter');
console.log('STEP4 已发送', new Date().toISOString());

// 等运行卡，同时每 20s 报一次页面状态
const t0 = Date.now();
let card = 0;
while (Date.now() - t0 < 300000) {
  card = await page.locator('.ww-chatcard--run').count();
  if (card) break;
  await sleep(20000);
  const st = await page.evaluate(() => ({
    anyChatcard: document.querySelectorAll('[class*="ww-chatcard"]').length,
    wewriteText: [...document.querySelectorAll('main')].some((m) => /wewrite/i.test(m.textContent || '')),
    msgs: document.querySelectorAll('[class*=message], [class*=turn]').length,
  }));
  console.log(`  +${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(st));
}
console.log('STEP5 运行卡:', card);
if (card) {
  await sleep(20000);
  await page.screenshot({ path: '/tmp/v8-running.png' });
  const t1 = Date.now();
  while (Date.now() - t1 < 360000) {
    if (await page.locator('.ww-chatcard--tail').count()) break;
    await sleep(10000);
  }
  await sleep(3000);
  await page.screenshot({ path: '/tmp/v8-final.png' });
  console.log('STEP6 tail:', await page.locator('.ww-chatcard--tail').count());
}
console.log('全程 console（wewrite/注册/warn 相关）:');
for (const l of logs) if (/wewrite|slot|regist|warn|chat|tool/i.test(l)) console.log(' ', l);
console.log('console 总数:', logs.length);
await browser.close();
