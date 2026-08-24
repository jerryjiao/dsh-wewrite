#!/usr/bin/env node
/**
 * 一次性诊断探针（2026-08-23）：Jerry 反馈「写作台下面有一条灰色」。
 * 打开 3080 宿主 → 点侧栏入口开浮层 → 对视口底部逐坐标 elementFromPoint
 * 探测归属元素与背景色 + 浮层几何 + 截图。跑法：
 *   node scripts/probe-overlay-bottom.mjs   （宿主须已在 3080）
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = '/tmp/overlay-bottom.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const entry = await page.$('[data-testid="ww-sidebar-entry"]');
if (!entry) {
  console.log('NO-ENTRY: sidebar entry not found. body classes:', await page.evaluate(() => document.body.className));
  await page.screenshot({ path: OUT });
  await browser.close();
  process.exit(0);
}
await entry.click();
await page.waitForSelector('[data-testid="ww-overlay"]', { timeout: 5000 });
await page.waitForTimeout(1000);

const vh = await page.evaluate(() => window.innerHeight);
for (const y of [vh - 6, vh - 20, vh - 48, vh - 80, vh - 116]) {
  const info = await page.evaluate((yy) => {
    const el = document.elementFromPoint(window.innerWidth / 2, yy);
    if (!el) return 'NULL';
    const parts = [];
    let n = el;
    for (let i = 0; n && i < 7; i++, n = n.parentElement) {
      const cs = getComputedStyle(n);
      const cls = n.classList && n.classList.length ? '.' + [...n.classList].slice(0, 3).join('.') : '';
      parts.push(`${n.tagName.toLowerCase()}${cls} bg=${cs.backgroundColor} h=${Math.round(n.getBoundingClientRect().height)}`);
    }
    return parts.join('  <-  ');
  }, y);
  console.log(`y=${y}: ${info}`);
}

const geo = await page.evaluate(() => {
  const ov = document.querySelector('.ww-overlay');
  const body = ov && ov.querySelector('.ww-overlay__body');
  const panel = document.querySelector('.dsh-wewrite-panel');
  const out = {};
  if (ov) { const r = ov.getBoundingClientRect(); out.overlay = { top: r.top, bottom: r.bottom, h: Math.round(r.height) }; }
  if (body) { const r = body.getBoundingClientRect(); out.body = { top: r.top, bottom: r.bottom, h: Math.round(r.height) }; }
  if (panel) { const r = panel.getBoundingClientRect(); out.panel = { top: r.top, bottom: r.bottom, h: Math.round(r.height) }; }
  out.viewport = { h: window.innerHeight, w: window.innerWidth };
  return out;
});
console.log('GEOMETRY:', JSON.stringify(geo, null, 1));

await page.screenshot({ path: OUT });
console.log('screenshot ->', OUT);
await browser.close();
