#!/usr/bin/env node
/** 最小推送重试（干净单实例后）：打开写作台 → 编辑器最新文 → 推草稿箱 → batchget 复核。 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))));
const BASE = 'http://127.0.0.1:3080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const c = YAML.parse(readFileSync(join(ROOT, '..', '..', 'workspace-writer', 'config.yaml'), 'utf8'));
const RELAY_BASE = 'http://127.0.0.1:39176/' + readFileSync('/tmp/wxrelay/token', 'utf8').trim();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  for (const label of ['Continue', '继续', 'Configure later', '稍后配置', 'Skip', '跳过']) {
    const btn = page.getByRole('button', { name: label, exact: false });
    if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(1500); }
  }
  let entered = false;
  for (const n of ['写作台', 'Workbench']) {
    const t = page.getByRole('tab', { name: n, exact: false });
    if (await t.count()) { await t.first().click().catch(() => {}); await sleep(2500); if (await page.locator('[data-testid="ww-workbench"]').count()) entered = true; break; }
  }
  if (!entered) {
    const b = page.getByRole('button', { name: /打开写作台/ });
    if (await b.count()) { await b.first().click(); await sleep(2500); }
  }
  await page.locator('[data-testid="ww-workbench"]').first().waitFor({ timeout: 15000 });

  const cta = page.getByRole('button', { name: /推草稿箱/ }).first();
  await cta.waitFor({ timeout: 10000 });
  await cta.click();
  await sleep(800);
  const menuItem = page.getByRole('menuitem', { name: /^推草稿箱$/ }).first();
  if (await menuItem.count()) await menuItem.click();
  await sleep(1200);
  const forceBtn = page.getByRole('button', { name: '仍然推送' });
  if (await forceBtn.count()) { console.log('gate modal → 仍然推送'); await forceBtn.click(); }
  const toast = page.locator('.ww-toast--success, .ww-toast--error, .ww-toast--info').first();
  await toast.waitFor({ timeout: 60000 });
  await page.screenshot({ path: join(ROOT, 'tests', 'e2e', 'artifacts', 'e2e-real-push-retry.png') });
  const ok = await page.locator('.ww-toast--success').count();
  const toastText = ok ? await page.locator('.ww-toast--success').first().innerText() : await toast.innerText();
  console.log('push:', ok ? 'SUCCESS' : 'FAIL', '|', toastText.replace(/\n/g, ' ').slice(0, 120));

  const tr = await (await fetch(`${RELAY_BASE}/cgi-bin/token?grant_type=client_credential&appid=${c.wechat.appid}&secret=${c.wechat.secret}`)).json();
  if (tr.access_token) {
    const list = await (await fetch(`${RELAY_BASE}/cgi-bin/draft/batchget?access_token=${tr.access_token}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ offset: 0, count: 8, no_content: 1 }),
    })).json();
    const hit = (list.item ?? []).find((it) => (it.content?.news_item ?? []).some((n) => n.title === 'dsh-wewrite 真机推送链路验证'));
    console.log('batchget:', hit ? `✅ media_id=${hit.media_id}` : `❌ 未找到（total=${list.total_count ?? '?'}）`);
  } else {
    console.log('batchget token 失败 errcode', tr.errcode);
  }
} finally {
  await browser.close();
}
