#!/usr/bin/env node
/**
 * 对话深度结合演示采集 v2（2026-08-24）：v1 教训——关浏览器=exec.signal 取消管线
 * （两条 run interrupted）。v2 全程保持浏览器打开直到 turn 真正完成（tail 行出现），
 * 单会话两条链路串行：① agent 工具路径 ② /wewrite 命令路径。429 速率限制=智谱免费层
 * 瞬时限流，脚本对单条失败容忍（截图现状并继续）。
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
const shot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('captured', name);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(4000);
for (const label of ['Continue', '继续', 'Configure later', '稍后配置', 'Skip', '跳过']) {
  const btn = page.getByRole('button', { name: label, exact: false });
  if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(2000); }
}
const newBtn = page.getByRole('button', { name: /new session|新建会话|新会话/i });
if (await newBtn.count()) { await newBtn.first().click().catch(() => {}); await sleep(2500); }

const getComposer = () => page.getByPlaceholder(/describe|描述/i).first();
if (!(await getComposer().count())) {
  console.log('NO-COMPOSER'); await shot(page, '09-chat-debug-nocomposer'); await browser.close(); process.exit(0);
}

async function waitForTail(timeoutMs) {
  const tail = page.locator('.ww-chatcard--tail').first();
  const t0 = Date.now();
  let count = 0;
  while (Date.now() - t0 < timeoutMs) {
    if (await tail.count()) {
      const prev = count; count = await page.locator('.ww-chatcard--tail').count();
      if (count > 0 && count === prev && count > 0) { await sleep(4000); if (await page.locator('.ww-chatcard--tail').count() === count) return count; }
    }
    await sleep(5000);
  }
  return await page.locator('.ww-chatcard--tail').count();
}

// ---------- ① agent 工具路径 ----------
const c1 = getComposer();
await c1.click();
await c1.fill('用 wewrite 写一篇题为《为什么程序员应该写技术博客》的公众号短文');
await c1.press('Enter');
console.log('① 消息已发送');
const runCard = page.locator('.ww-chatcard--run').first();
if (await runCard.waitFor({ state: 'visible', timeout: 300000 }).catch(() => null)) {
  console.log('① 运行卡出现 ✅');
  await sleep(20000);
  await shot(page, '09-chat-run-progress');
  const tails = await waitForTail(420000);
  console.log('① tail 行数:', tails);
  await sleep(3000);
  await shot(page, '10-chat-final');
} else {
  console.log('① 运行卡未出现（模型未调工具或 429），截现状');
  await shot(page, '09-chat-debug-notool');
}

// ---------- ② /wewrite 命令路径 ----------
await sleep(2000);
const c2 = getComposer();
if (await c2.count()) {
  await c2.click();
  await c2.fill('/wewrite 一句话起稿：AI 时代的公众号写作工作流');
  await c2.press('Enter');
  console.log('② /wewrite 已提交');
  await sleep(6000);
  await shot(page, '11-chat-command');
  const tails2 = await waitForTail(420000);
  console.log('② tail 行数:', tails2);
  await sleep(3000);
  await shot(page, '12-chat-command-final');
}

console.log('DONE（浏览器关闭）');
await browser.close();
