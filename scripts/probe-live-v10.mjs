#!/usr/bin/env node
/** v10 傻瓜收割：逐个开前几个会话，见到 settled 卡/tail 截之，见审批面板截之。 */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(ROOT, 'assets', 'screenshots');
const shot = async (page, name) => { await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log('captured', name); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'zh-CN' });
await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' });
await sleep(6000);
for (const label of ['Continue', '继续', 'Configure later', '稍后配置', 'Skip', '跳过']) {
  const btn = page.getByRole('button', { name: label, exact: false });
  if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(2000); }
}

const items = page.locator('aside a, aside button, [role=button], [class*=session]');
const n = Math.min(await items.count(), 6);
console.log('候选条目数:', n);
let gotFinal = false;
let gotApproval = false;
for (let i = 0; i < n && !(gotFinal && gotApproval); i++) {
  const el = items.nth(i);
  const label = ((await el.textContent().catch(() => '')) || '').trim().slice(0, 30);
  if (!label || label === '新会话') continue;
  await el.click().catch(() => {});
  await sleep(8000);
  const st = await page.evaluate(() => {
    const approval = /allow|refuse|允许|拒绝|批准/.test(document.body.innerText.slice(0, 6000));
    return {
      run: document.querySelectorAll('.ww-chatcard--run').length,
      tail: document.querySelectorAll('.ww-chatcard--tail').length,
      openDesk: [...document.querySelectorAll('button')].filter((b) => /打开写作台|在写作台打开/.test(b.textContent || '')).length,
      approval,
      runText: (document.querySelector('.ww-chatcard--run')?.textContent || '').replace(/\s+/g, ' ').slice(0, 140),
      tailText: (document.querySelector('.ww-chatcard--tail')?.textContent || '').replace(/\s+/g, ' ').slice(0, 120),
    };
  });
  console.log(`[${i}] ${label} →`, JSON.stringify(st));
  if (!gotFinal && st.run > 0) {
    gotFinal = true;
    await sleep(1500);
    await shot(page, '10-chat-final');
    if (st.openDesk > 0) {
      await page.getByRole('button', { name: /打开写作台|在写作台打开/ }).first().click().catch(() => {});
      await sleep(3500);
      if (await page.locator('[data-testid="ww-overlay"]').count()) {
        await shot(page, '13-chat-card-to-overlay');
        console.log('卡片→浮层联动 ✅');
        await page.locator('[data-testid="ww-overlay-close"]').first().click().catch(async () => page.keyboard.press('Escape'));
        await sleep(1500);
      }
    }
  }
  if (!gotApproval && st.approval) {
    gotApproval = true;
    await shot(page, '14-chat-approval-panel');
  }
}
console.log('DONE final=', gotFinal, 'approval=', gotApproval);
await browser.close();
