#!/usr/bin/env node
/**
 * 真实凭据端到端验证（2026-08-26）：种子一篇文章+封面 → 设置面板真填
 * AppID/Secret/中继地址（vm relay + ssh 隧道）→「测试连接」诊断 → 编辑器
 * 「推草稿箱」→ draft/batchget 复核草稿箱真收到。
 *
 * 凭据纪律：appid/secret 运行时从 workspace-writer/config.yaml 读取、中继令牌
 * 从 /tmp/wxrelay/token 读取；只注入 UI 输入与内存变量，绝不写入本 repo 任何
 * 文件、不打印到输出。前置：隧道已建（ssh -f -N -L 39176:127.0.0.1:39176 …）。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { startHost, stopHost } from './hostctl.mjs';

const ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))));
const UNIT_PATH = join(homedir(), '.dsh/storages/dsh_wewrite.json');
const ART_SHOT_DIR = join(ROOT, 'tests', 'e2e', 'artifacts');
mkdirSync(ART_SHOT_DIR, { recursive: true });
const BASE = 'http://127.0.0.1:3080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { await page.screenshot({ path: join(ART_SHOT_DIR, `${name}.png`) }); console.log('shot:', name); };

// ── 1. 凭据与中继（内存 only）──────────────────────────────────────────────
const writerConfig = YAML.parse(readFileSync(join(ROOT, '..', '..', 'workspace-writer', 'config.yaml'), 'utf8'));
const APPID = writerConfig.wechat.appid;
const SECRET = writerConfig.wechat.secret;
const RELAY_TOKEN = readFileSync('/tmp/wxrelay/token', 'utf8').trim();
const RELAY_BASE = `http://127.0.0.1:39176/${RELAY_TOKEN}`;
if (!APPID || !SECRET || !RELAY_TOKEN) { console.error('缺少凭据/令牌'); process.exit(1); }

// ── 2. 种子：一篇文章 + 一张封面（宿主停机态直写 storage）──────────────────
await stopHost();
const unit = JSON.parse(readFileSync(UNIT_PATH, 'utf8'));
const nowIso = new Date().toISOString();
const ARTICLE_ID = 'art_e2e_real_push_20260826';
const COVER_ID = 'img_e2e_real_cover_20260826';
const coverBase64 = readFileSync('/tmp/wxrelay/e2e-cover.png').toString('base64');
unit.tables.articles = unit.tables.articles ?? {};
unit.tables.images = unit.tables.images ?? {};
unit.tables.articles[ARTICLE_ID] = {
  v: 1, id: ARTICLE_ID, slug: 'e2e-real-push-20260826',
  title: 'dsh-wewrite 真机推送链路验证',
  digest: '端到端验证稿：本文由真实凭据链路推送至草稿箱，可用于核对排版与封面。',
  status: 'rendered',
  markdown: [
    '# dsh-wewrite 真机推送链路验证', '',
    '这篇文章由 dsh-wewrite 插件的编辑器「推草稿箱」按钮推送，出口经云主机中继（固定白名单 IP）。',
    '', '## 验证点', '',
    '- 封面图随稿上传为永久素材（thumb_media_id 回填）',
    '- 正文 HTML 经渲染管线转换（微信兼容内联样式）',
    '- 草稿箱 batchget 可复核（media_id 一致）', '',
    '这是一篇链路验证用的短文，收到后可直接删除。', '',
  ].join('\n'),
  theme: 'default', bodyImageIds: [], coverImageId: COVER_ID,
  createdAt: nowIso, updatedAt: nowIso,
};
unit.tables.images[COVER_ID] = {
  v: 1, id: COVER_ID, articleId: ARTICLE_ID, kind: 'cover', mime: 'image/png',
  base64: coverBase64, provider: 'e2e-manual', model: 'local-png', prompt: 'e2e cover',
  createdAt: nowIso,
};
writeFileSync(UNIT_PATH, JSON.stringify(unit, null, 2), 'utf8');
console.log('seeded article + cover');

// ── 3. 起宿主 → 浏览器驱动 ────────────────────────────────────────────────
await startHost();
await sleep(2500);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  for (const label of ['Continue', '继续', 'Configure later', '稍后配置', 'Skip', '跳过']) {
    const btn = page.getByRole('button', { name: label, exact: false });
    if (await btn.count()) { await btn.first().click().catch(() => {}); await sleep(1500); }
  }
  // 打开写作台（会话 tab 或侧边栏直进，两者都试）
  let entered = false;
  for (const n of ['写作台', 'Workbench']) {
    const t = page.getByRole('tab', { name: n, exact: false });
    if (await t.count()) { await t.first().click().catch(() => {}); await sleep(2500); if (await page.locator('[data-testid="ww-workbench"]').count()) entered = true; break; }
  }
  if (!entered) {
    const overlayBtn = page.getByRole('button', { name: /打开写作台/ });
    if (await overlayBtn.count()) { await overlayBtn.first().click(); await sleep(2500); }
  }
  await page.locator('[data-testid="ww-workbench"]').first().waitFor({ timeout: 15000 });
  console.log('workbench open');

  // 设置面板：填 AppID / Secret / 中继地址，保存后测试连接（保存按钮按分区锚定）
  await page.locator('[data-testid="ww-topbar-settings"]').first().click();
  await sleep(1500);
  const sectionOf = (heading) => page.locator('.ww-settings__section', { has: page.locator('h3', { hasText: heading }) }).first();
  const wechatSection = sectionOf('公众号接入');
  await wechatSection.getByLabel('公众号 AppID').fill(APPID);
  await wechatSection.getByLabel('公众号 AppSecret').fill(SECRET);
  await wechatSection.getByRole('button', { name: '保存', exact: true }).click();
  await sleep(1200);
  await page.locator('.ww-settings__nav button', { hasText: 'API 代理' }).first().click();
  await sleep(1000);
  const proxySection = sectionOf('API 代理');
  await proxySection.getByLabel('API 代理地址').fill(RELAY_BASE);
  await proxySection.getByRole('button', { name: '保存', exact: true }).click();
  await sleep(1200);
  await proxySection.getByRole('button', { name: '测试连接' }).click();
  await page.locator('.ww-callout--ok, .ww-callout--fail').first().waitFor({ timeout: 30000 });
  const calloutOk = await page.locator('.ww-callout--ok').count();
  await shot(page, 'e2e-real-settings');
  console.log('diagnose:', calloutOk ? 'OK（草稿箱 API 可达）' : 'FAIL');
  if (!calloutOk) throw new Error('诊断失败：' + (await page.locator('.ww-callout--fail').innerText().catch(() => '?')));

  // 回编辑页（顶栏导航首项标签=「编辑」），编辑器载入最新文章（种子文 updatedAt 最新），推送
  await page.locator('.ww-topbar__nav button', { hasText: '编辑' }).first().click().catch(async () => {
    await page.locator('.ww-topbar__nav button').first().click();
  });
  await sleep(2000);
  await shot(page, 'e2e-real-editor');
  const cta = page.getByRole('button', { name: /推草稿箱/ }).first();
  await cta.waitFor({ timeout: 10000 });
  await cta.click();
  await sleep(800);
  const menuItem = page.getByRole('menuitem', { name: /^推草稿箱$/ }).first();
  if (await menuItem.count()) { await menuItem.click(); }
  // 门禁拦截兜底：若弹出确认弹窗（种子文无 run 记录时可能出现），点「仍然推送」
  await sleep(1200);
  const forceBtn = page.getByRole('button', { name: '仍然推送' });
  if (await forceBtn.count()) { console.log('gate modal appeared → 仍然推送'); await forceBtn.click(); }
  const toast = page.locator('.ww-toast--success, .ww-toast--error, .ww-toast--info').first();
  await toast.waitFor({ timeout: 60000 });
  await shot(page, 'e2e-real-push-result');
  const success = await page.locator('.ww-toast--success').count();
  console.log('push toast:', success ? 'SUCCESS' : 'NOT-SUCCESS（见截图）');

  // ── 4. batchget 复核（凭据内存使用，走同一中继）─────────────────────────
  const tokenResp = await (await fetch(`${RELAY_BASE}/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`)).json();
  if (!tokenResp.access_token) throw new Error('batchget 取 token 失败：' + JSON.stringify({ errcode: tokenResp.errcode }));
  const listResp = await (await fetch(`${RELAY_BASE}/cgi-bin/draft/batchget?access_token=${tokenResp.access_token}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ offset: 0, count: 5, no_content: 1 }),
  })).json();
  const found = (listResp.item ?? []).some((it) => (it.content?.news_item ?? []).some((n) => n.title === 'dsh-wewrite 真机推送链路验证'));
  console.log('batchget 复核:', found ? '✅ 草稿箱已收到该文章' : '❌ 未找到（total=' + (listResp.total_count ?? '?') + '）');
  console.log(found && success ? 'E2E-REAL-PUSH: ALL GREEN' : 'E2E-REAL-PUSH: INCOMPLETE');
} finally {
  await browser.close();
}
