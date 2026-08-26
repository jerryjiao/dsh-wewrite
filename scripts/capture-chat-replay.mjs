#!/usr/bin/env node
/**
 * 演示采集 v3（2026-08-24）：f4ac run 六步全绿后，重开历史会话截图 settled 成稿卡
 * + turnTail 产物行（同时验证 S3 回放：settled 卡从持久化 meta 重建），
 * 再补 /wewrite 命令路径截图。宿主 3080。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'assets', 'screenshots');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:3080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log('captured', name); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(4000);
for (const label of ['Continue', '继续', 'Configure later', '稍后配置', 'Skip', '跳过']) {
  const btn = page.getByRole('button', { name: label, exact: false });
  if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(2000); }
}

// 打开历史会话（第一条消息含「技术博客」）
const sess = page.getByText(/为什么程序员应该写技术博客/).first();
if (await sess.count()) { await sess.click().catch(() => {}); await sleep(5000); }

const runCard = page.locator('.ww-chatcard--run').first();
if (await runCard.count()) {
  const txt = (await runCard.innerText()).replace(/\n/g, ' | ');
  console.log('回放 settled 运行卡 ✅:', txt.slice(0, 220));
} else {
  console.log('回放未见运行卡（选择器/会话没对上？）');
}
const tail = page.locator('.ww-chatcard--tail').first();
console.log('tail 产物行:', (await tail.count()) ? (await tail.innerText()).replace(/\n/g, ' | ').slice(0, 180) : '未出现');
await sleep(2000);
await shot(page, '10-chat-final');

// 点击卡片「打开写作台」按钮验证联动（截浮层定位态）
const openBtn = page.getByRole('button', { name: /打开写作台|在写作台打开/ }).first();
if (await openBtn.count()) {
  await openBtn.click().catch(() => {});
  await sleep(3000);
  if (await page.locator('[data-testid="ww-overlay"]').count()) {
    console.log('卡片→浮层联动 ✅');
    await shot(page, '13-chat-card-to-overlay');
    const esc = page.locator('[data-testid="ww-overlay-close"]').first();
    if (await esc.count()) await esc.click().catch(() => {});
    await sleep(1500);
  }
} else {
  console.log('「打开写作台」按钮未找到');
}

// /wewrite 命令路径
const composer = page.getByPlaceholder(/describe|描述/i).first();
if (await composer.count()) {
  await composer.click();
  await composer.fill('/wewrite 一句话起稿：AI 时代的公众号写作工作流');
  await composer.press('Enter');
  console.log('② /wewrite 已提交');
  await sleep(6000);
  await shot(page, '11-chat-command');
  const t0 = Date.now();
  let tails = 0;
  while (Date.now() - t0 < 420000) {
    tails = await page.locator('.ww-chatcard--tail').count();
    if (tails >= 2) break; // 新产物行出现（原会话 1 条 + 新 1 条）
    await sleep(5000);
  }
  console.log('② tail 总数:', tails);
  await sleep(3000);
  await shot(page, '12-chat-command-final');
} else {
  console.log('composer 不可用，跳过命令路径');
}

console.log('DONE');
await browser.close();
