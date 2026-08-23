#!/usr/bin/env node
/**
 * qa-hotspot-digest-probe —— QA 诊断探针（只读诊断，不进 runner 用例、不 mock）。
 *
 * 目的：实测「热门榜逐条 AI 速览」真实行为，逐条记录耗时/徽记/速览全文/异常，
 * 并测缓存瞬出、错误重试、多行展开互斥、视觉截图。产物落 tests/e2e/artifacts/qa-digest/。
 * 用法：node tests/e2e/qa-hotspot-digest-probe.mjs [条数=8]
 * 前置：宿主已在跑（node scripts/hostctl.mjs ensure，须从 dsh-sandbox 起）。
 * 不改 src/、不碰 git、不动 storage。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, openPanel, sleep } from './session.mjs';
import { clickTab, pollUntil } from './lib.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(E2E_DIR, 'artifacts/qa-digest');
mkdirSync(OUT_DIR, { recursive: true });

const N_ITEMS = Number.parseInt(process.argv[2] ?? '8', 10) || 8;
const DIGEST_LS = 'dsh-wewrite.hotspot-item-digests';
/** 单条终态预算：抓原文 8s + LLM 45s + 余量。 */
const PER_ITEM_TIMEOUT_MS = 75_000;

const report = { items: [], interactions: {}, consoleErrors: [], pageErrors: [] };
const t0All = Date.now();

// ── 宿主侧同口径 fetch 探测（复刻 hotspot-digest.ts 抓取/抽取启发式，判降级原因）──
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(text) {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isSafeInteger(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isSafeInteger(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}
function extractArticleTextApprox(html) {
  let working = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of ['script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside', 'svg']) {
    working = working.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), ' ');
  }
  const m = (re) => re.exec(working)?.[1];
  const block = m(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i) ?? m(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
  if (block !== null && block !== undefined) working = block;
  const text = decodeEntities(working.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text.length < 300 ? null : text.slice(0, 8000);
}
async function probeHostFetch(url) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, ms: Date.now() - started, contentType };
    if (!contentType.toLowerCase().startsWith('text/html')) {
      return { ok: false, reason: `content-type 非 html：${contentType || '(空)'}`, ms: Date.now() - started };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let text = ''; let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { bytes += value.byteLength; text += decoder.decode(value, { stream: true }); }
      if (bytes >= 2 * 1024 * 1024) { await reader.cancel().catch(() => {}); break; }
    }
    const extracted = extractArticleTextApprox(text);
    return {
      ok: extracted !== null,
      reason: extracted === null ? `正文抽取 <300 字（剥壳后 ${(decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().length)} 字）` : null,
      ms: Date.now() - started,
      bytes,
      extractedChars: extracted?.length ?? 0,
      extractedHead: extracted?.slice(0, 120) ?? '',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `${err.name === 'AbortError' ? '8s 超时' : '网络异常'}：${msg}`, ms: Date.now() - started };
  }
}

// ── 浏览器侧主流程 ───────────────────────────────────────────────────────────
const { browser, page } = await launchBrowser();
page.on('console', (msg) => {
  if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 300));
});
page.on('pageerror', (err) => report.pageErrors.push(String(err).slice(0, 300)));

console.log('[1] 打开面板 ...');
await openPanel(page);
await clickTab(page, 'hotspots', { timeout: 10000 });

console.log('[2] 等热榜终态 ...');
const settled = await pollUntil(async () => {
  const rows = await page.locator('.ww-hotspot-list .ww-hotspot').count();
  const error = await page.locator('.ww-hotspots .ww-error').count();
  return rows > 0 || error > 0 ? { rows, error } : null;
}, { timeout: 20000, msg: '热榜 20s 未就绪' });
if (!settled.rows) throw new Error('热榜拉取失败态，无法测速览');
console.log(`    热榜 ${settled.rows} 条`);

// 清当日逐条缓存（保证每条走真 RPC）
await page.evaluate((k) => window.localStorage.removeItem(k), DIGEST_LS);

const rows = page.locator('.ww-hotspot-list .ww-hotspot');
const total = Math.min(N_ITEMS, settled.rows);
const seenDomains = new Set();

for (let i = 0; i < total; i++) {
  const li = rows.nth(i);
  const rank = (await li.locator('.ww-hotspot__rank').innerText()).trim();
  const title = (await li.locator('.ww-hotspot__title').innerText()).trim();
  const meta = (await li.locator('.ww-hotspot__meta').innerText().catch(() => '')).trim();
  const entry = { idx: i, rank, title, meta };

  console.log(`[3.${i + 1}] 展开 ${rank}：${title.slice(0, 60)} ...`);
  const t0 = Date.now();
  await li.locator('.ww-hotspot__row').click();

  const link = li.locator('.ww-hotspot__expand a.ww-link');
  entry.url = (await link.getAttribute('href').catch(() => null)) ?? '';
  const domain = new URL(entry.url).hostname;
  seenDomains.add(domain);

  // 终态：error 块出现，或骨架消失且正文非空
  const outcome = await pollUntil(async () => {
    const errCount = await li.locator('[data-testid="ww-hotspot-digest"] .ww-error').count();
    if (errCount > 0) return { kind: 'error' };
    const skeleton = await li.locator('[data-testid="ww-hotspot-digest-body"] .ww-skeleton-block').count();
    const text = (await li.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '')).trim();
    if (skeleton === 0 && text.length > 0) return { kind: 'ready', text };
    return null;
  }, { timeout: PER_ITEM_TIMEOUT_MS, interval: 500, msg: `第 ${i + 1} 条 ${PER_ITEM_TIMEOUT_MS}ms 未出终态` }).catch((err) => ({ kind: 'timeout', text: err.message.slice(0, 200) }));

  entry.elapsedMs = Date.now() - t0;
  entry.terminal = outcome.kind;

  if (outcome.kind === 'error') {
    entry.errorText = (await li.locator('[data-testid="ww-hotspot-digest"]').innerText()).trim();
  } else if (outcome.kind === 'ready') {
    entry.digestText = outcome.text;
    entry.badge = (await li.locator('[data-testid="ww-hotspot-digest-source"]').innerText().catch(() => '')).trim();
    entry.timeLabel = (await li.locator('.ww-hotspot__digest-time').innerText().catch(() => '')).trim();
    entry.structure = {
      lead: /这条在讲什么：|标题解读：/.test(outcome.text),
      points: outcome.text.split('\n').filter((l) => l.trim().startsWith('·')).length,
      markdownLeak: /[`#*>]{2,}|^\s*[-*]\s|【|】|\*\*/.test(outcome.text),
      thinkLeak: /<(think|reasoning)>|思考|用户给了|好的，|我来分析/i.test(outcome.text),
    };
  }
  // localStorage 落库条目（含 model）
  entry.cachedEntry = await page.evaluate(
    ({ k, url }) => {
      const raw = window.localStorage.getItem(k);
      if (!raw) return null;
      const v = JSON.parse(raw)[url];
      return v ? { digest: v.digest, source: v.source, model: v.model, generatedAtIso: v.generatedAtIso } : null;
    },
    { k: DIGEST_LS, url: entry.url },
  );
  // 特写截图（展开态该行）
  await li.screenshot({ path: join(OUT_DIR, `item-${String(i + 1).padStart(2, '0')}-${domain.replace(/\W+/g, '_').slice(0, 40)}.png`) }).catch(() => {});

  // 宿主侧同口径 fetch 探测（判降级原因）
  entry.hostFetchProbe = await probeHostFetch(entry.url);

  // 收起（下一条）
  await li.locator('.ww-hotspot__row').click().catch(() => {});
  await sleep(200);
  report.items.push(entry);
  console.log(`    → ${outcome.kind} ${entry.elapsedMs}ms badge=${entry.badge ?? '-'} probe=${entry.hostFetchProbe.ok ? '可抽正文' : entry.hostFetchProbe.reason}`);
}

// ── 交互 A：收起再展开应命中缓存瞬出 ────────────────────────────────────────
{
  const li = rows.nth(0);
  const t0 = Date.now();
  await li.locator('.ww-hotspot__row').click();
  const hit = await pollUntil(async () => {
    const skeleton = await li.locator('[data-testid="ww-hotspot-digest-body"] .ww-skeleton-block').count();
    const text = (await li.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '')).trim();
    return skeleton === 0 && text.length > 0;
  }, { timeout: 5000, interval: 60, msg: '缓存重展开 5s 未出内容' }).then(() => true).catch(() => false);
  report.interactions.cacheReexpand = { instantHit: hit, ms: Date.now() - t0 };
  await page.screenshot({ path: join(OUT_DIR, 'reexpanded-item-01-fullpage.png'), fullPage: true }).catch(() => {});
}

// ── 交互 B：第一条展开时展开第二条（互斥行为 + 第一条 UI 状态）───────────────
{
  const first = rows.nth(0);
  const second = rows.nth(1);
  await second.locator('.ww-hotspot__row').click();
  await sleep(600);
  const firstExpanded = await first.locator('.ww-hotspot__expand').count();
  const secondExpanded = await second.locator('.ww-hotspot__expand').count();
  const secondDigestVisible = await second.locator('[data-testid="ww-hotspot-digest"]').count();
  report.interactions.expandSecondWhileFirstOpen = {
    firstExpandStillInDom: firstExpanded > 0,
    secondExpandInDom: secondExpanded > 0,
    secondDigestMounted: secondDigestVisible > 0,
  };
  await page.screenshot({ path: join(OUT_DIR, 'second-expanded-fullpage.png'), fullPage: true }).catch(() => {});
  // 再回第一条（应仍瞬出缓存）
  await first.locator('.ww-hotspot__row').click();
  const back = await pollUntil(async () => {
    const text = (await first.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '')).trim();
    return text.length > 0;
  }, { timeout: 5000, interval: 60, msg: '切回第一条 5s 未出内容' }).then(() => true).catch(() => false);
  report.interactions.backToFirstAfterCollapse = { contentVisible: back };
  await first.locator('.ww-hotspot__row').click().catch(() => {});
}

// ── 交互 C：错误态重试（只对自然出现错误的条目做；没有错误则记录 untested）────
{
  const errIdx = report.items.findIndex((e) => e.terminal === 'error');
  if (errIdx >= 0) {
    const li = rows.nth(errIdx);
    await li.locator('.ww-hotspot__row').click();
    const retry = li.locator('[data-testid="ww-hotspot-digest-retry"]');
    if (await retry.count()) {
      await retry.click();
      const t0 = Date.now();
      const after = await pollUntil(async () => {
        const errCount = await li.locator('[data-testid="ww-hotspot-digest"] .ww-error').count();
        if (errCount > 0) return 'error';
        const skeleton = await li.locator('[data-testid="ww-hotspot-digest-body"] .ww-skeleton-block').count();
        const text = (await li.locator('[data-testid="ww-hotspot-digest-body"]').innerText().catch(() => '')).trim();
        return skeleton === 0 && text.length > 0 ? 'ready' : null;
      }, { timeout: PER_ITEM_TIMEOUT_MS, interval: 500, msg: '重试后未出终态' }).catch(() => 'timeout');
      report.interactions.errorRetry = { itemIdx: errIdx, result: after, ms: Date.now() - t0 };
      await li.screenshot({ path: join(OUT_DIR, `retry-item-${errIdx + 1}.png`) }).catch(() => {});
      await li.locator('.ww-hotspot__row').click().catch(() => {});
    } else {
      report.interactions.errorRetry = { itemIdx: errIdx, note: '重试按钮未找到' };
    }
  } else {
    report.interactions.errorRetry = { note: '本轮无自然错误条目，未测' };
  }
}

report.totalMs = Date.now() - t0All;
report.distinctDomains = [...seenDomains];
writeFileSync(join(OUT_DIR, 'qa-digest-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\n完成，总耗时 ${(report.totalMs / 1000).toFixed(1)}s，报告落 ${join(OUT_DIR, 'qa-digest-report.json')}`);

await browser.close();
