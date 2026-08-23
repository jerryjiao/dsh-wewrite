#!/usr/bin/env node
/**
 * qa-bluewash-verify —— Bluewash 主题 + digest 修复真机验收探针（只读验证，不进 runner、不 mock）。
 *
 * 默认模式：① 主题 token 生效断言（light+dark 双态：台面蓝灰/分域激活色/页头点/Top3 名次）
 *           ② 双主题整页截图；③ digest 正常路径（生成→徽记底色→缓存瞬出→loading 提示）。
 * error 模式（宿主已配坏模型时使用）：digest 错误路径（人话文案/无 JSON 墙/失败记忆不自动重打）。
 * 用法：node tests/e2e/qa-bluewash-verify.mjs [error]
 * 前置：宿主已在跑且装了新 lib（hostctl ensure，从 dsh-sandbox 起或 hostctl 约定）。
 * 不改 src/、不碰 git、不动 storage。
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPanel, sleep } from './session.mjs';
import { clickTab, pollUntil } from './lib.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'artifacts/bluewash');
mkdirSync(OUT_DIR, { recursive: true });
const ERROR_MODE = process.argv[2] === 'error';
const DIGEST_LS = 'dsh-wewrite.hotspot-item-digests';
const PER_ITEM_TIMEOUT_MS = 75_000;

const results = { checks: [], failCount: 0 };
function check(name, pass, detail = '') {
  results.checks.push({ name, pass, detail });
  if (!pass) results.failCount += 1;
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `（${detail}）` : ''}`);
}

async function tokenOf(page, name) {
  return page.evaluate(
    (n) => getComputedStyle(document.querySelector('.dsh-wewrite-panel')).getPropertyValue(n).trim(),
    name,
  );
}

const { browser, page } = await launchBrowser();
try {
  await openPanel(page);
  await clickTab(page, 'hotspots', { timeout: 10000 });
  await pollUntil(async () => {
    const rows = await page.locator('.ww-hotspot-list .ww-hotspot').count();
    return rows > 0 ? rows : null;
  }, { timeout: 20000, msg: '热榜 20s 未就绪' });

  if (!ERROR_MODE) {
    // ── 1. 主题 token 断言（light）─────────────────────────────────────────
    console.log('[1] Bluewash light 主题断言 ...');
    check('bg-page=蓝灰 #F2F4F8', (await tokenOf(page, '--ww-bg-page')) === '#F2F4F8', await tokenOf(page, '--ww-bg-page'));
    check('view-topics=橙 #C2410C', (await tokenOf(page, '--ww-view-topics')) === '#C2410C', await tokenOf(page, '--ww-view-topics'));
    check('rank-top=橙 #C2410C', (await tokenOf(page, '--ww-rank-top')) === '#C2410C', await tokenOf(page, '--ww-rank-top'));
    const tabColor = await page.evaluate(() => getComputedStyle(document.querySelector(".ww-tab--active[data-view='topics']")).color);
    check('选题激活 Tab 橙 rgb(194,65,12)', tabColor === 'rgb(194, 65, 12)', tabColor);
    const dotColor = await page.evaluate(() => {
      const el = document.querySelector(".ww-pagebar__dot[data-view='topics']");
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    check('页头识别点橙 rgb(194,65,12)', dotColor === 'rgb(194, 65, 12)', String(dotColor));
    const rankColor = await page.evaluate(() => {
      const el = document.querySelector('.ww-hotspot__rank--top');
      return el ? getComputedStyle(el).color : null;
    });
    check('Top3 名次橙 rgb(194,65,12)', rankColor === 'rgb(194, 65, 12)', String(rankColor));

    await page.screenshot({ path: join(OUT_DIR, 'hotspots-light.png'), fullPage: false });

    // ── 2. dark 主题断言 + 截图 ────────────────────────────────────────────
    console.log('[2] Bluewash dark 主题断言 ...');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
    await sleep(150);
    check('dark bg-page=蓝黑 #1A1E26', (await tokenOf(page, '--ww-bg-page')) === '#1A1E26', await tokenOf(page, '--ww-bg-page'));
    check('dark view-topics=亮橙 #FB923C', (await tokenOf(page, '--ww-view-topics')) === '#FB923C', await tokenOf(page, '--ww-view-topics'));
    await page.screenshot({ path: join(OUT_DIR, 'hotspots-dark.png'), fullPage: false });
    await clickTab(page, 'home', { timeout: 8000 });
    await sleep(300);
    await page.screenshot({ path: join(OUT_DIR, 'workbench-dark.png'), fullPage: false });
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await sleep(150);
    await page.screenshot({ path: join(OUT_DIR, 'workbench-light.png'), fullPage: false });

    // ── 3. digest 正常路径 ─────────────────────────────────────────────────
    console.log('[3] digest 正常路径实测 ...');
    await clickTab(page, 'hotspots', { timeout: 8000 });
    await page.evaluate((k) => window.localStorage.removeItem(k), DIGEST_LS);
    const li = page.locator('.ww-hotspot-list .ww-hotspot').nth(1); // 第 2 条（QA 实测 #2 openrouter 稳定可读原文）
    await li.locator('.ww-hotspot__row').click();
    const t0 = Date.now();
    let sawWaitHint = false;
    const hintWatch = (async () => {
      for (let i = 0; i < 120; i++) {
        const txt = await li.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '');
        if (/AI 生成中/.test(txt)) { sawWaitHint = true; return; }
        await sleep(250);
      }
    })();
    const outcome = await pollUntil(async () => {
      const errCount = await li.locator('[data-testid="ww-hotspot-digest"] .ww-error').count();
      if (errCount > 0) return { kind: 'error' };
      const skeleton = await li.locator('[data-testid="ww-hotspot-digest-body"] .ww-skeleton-block').count();
      const text = (await li.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '')).trim();
      if (skeleton === 0 && text.length > 0) return { kind: 'ready', text };
      return null;
    }, { timeout: PER_ITEM_TIMEOUT_MS, interval: 500, msg: 'digest 未出终态' }).catch((err) => ({ kind: 'timeout', text: err.message }));
    await hintWatch;
    const elapsed = Date.now() - t0;
    check(`digest ready（${elapsed}ms）`, outcome.kind === 'ready', outcome.kind === 'ready' ? '' : String(outcome.text).slice(0, 160));
    check('loading 耗时提示出现过', sawWaitHint);
    const badge = li.locator('[data-testid="ww-hotspot-digest-source"]');
    const badgeText = (await badge.innerText().catch(() => '')).trim();
    const badgeBg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
    check('徽记文案（读了原文/仅凭标题）', /读了原文|仅凭标题/.test(badgeText), badgeText);
    check('徽记带底色档', typeof badgeBg === 'string' && badgeBg !== 'rgba(0, 0, 0, 0)', String(badgeBg));
    const bodyText = (await li.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '')).trim();
    if (badgeText.includes('仅凭标题')) {
      check('仅凭标题带参考性 caption', /未读原文/.test(bodyText));
    }
    await li.locator('.ww-hotspot__row').click(); // 收起
    await sleep(200);
    await li.locator('.ww-hotspot__row').click(); // 再展开 → 缓存瞬出
    const tCache = Date.now();
    const cached = await pollUntil(async () => {
      const text = (await li.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '')).trim();
      return text.length > 0 ? text : null;
    }, { timeout: 5000, interval: 100, msg: '缓存 5s 未出' }).catch(() => null);
    check(`缓存瞬出（${Date.now() - tCache}ms < 1500）`, cached !== null && Date.now() - tCache < 1500);
    await li.screenshot({ path: join(OUT_DIR, 'digest-ready.png') }).catch(() => {});
  } else {
    // ── error 模式：坏模型 → 人话错误 + 失败记忆 ──────────────────────────
    console.log('[error] digest 错误路径实测（宿主已配坏模型）...');
    await page.evaluate((k) => window.localStorage.removeItem(k), DIGEST_LS);
    const li = page.locator('.ww-hotspot-list .ww-hotspot').first();
    await li.locator('.ww-hotspot__row').click();
    const outcome = await pollUntil(async () => {
      const errCount = await li.locator('[data-testid="ww-hotspot-digest"] .ww-error').count();
      if (errCount > 0) return 'error';
      const skeleton = await li.locator('[data-testid="ww-hotspot-digest-body"] .ww-skeleton-block').count();
      const text = (await li.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '')).trim();
      return skeleton === 0 && text.length > 0 ? 'ready' : null;
    }, { timeout: PER_ITEM_TIMEOUT_MS, interval: 500, msg: '错误终态未出' }).catch((err) => `timeout:${err.message.slice(0, 80)}`);
    check('错误终态出现', outcome === 'error', String(outcome).slice(0, 100));
    if (outcome === 'error') {
      const errText = (await li.locator('[data-testid="ww-hotspot-digest"]').innerText()).trim();
      check('无 JSON 墙（不含 invalid_union/zod）', !/invalid_union|zod|received/.test(errText));
      check('错误是人话（不以 [ 或 { 开头且 <400 字）', !/^[[{]/.test(errText) && errText.length < 400, `${errText.length} 字：${errText.slice(0, 80)}`);
      await li.screenshot({ path: join(OUT_DIR, 'digest-error-friendly.png') }).catch(() => {});
      await li.locator('.ww-hotspot__row').click(); // 收起
      await sleep(200);
      await li.locator('.ww-hotspot__row').click(); // 再展开 → 失败记忆：应立即错误态，不重新 loading
      await sleep(1200);
      const skeleton = await li.locator('[data-testid="ww-hotspot-digest-body"] .ww-skeleton-block').count();
      const errAgain = await li.locator('[data-testid="ww-hotspot-digest"] .ww-error').count();
      check('失败记忆：再展开不自动重打（无骨架，直接错误态）', skeleton === 0 && errAgain > 0, `skeleton=${skeleton} err=${errAgain}`);
      const retry = await li.locator('[data-testid="ww-hotspot-digest-retry"]').count();
      check('重试按钮存在', retry > 0);
    }
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`\n==== 验收结果：${results.checks.length - results.failCount}/${results.checks.length} 通过 ====`);
if (results.failCount > 0) {
  console.log('FAILED:', results.checks.filter((c) => !c.pass).map((c) => c.name).join(' | '));
  process.exitCode = 1;
}
