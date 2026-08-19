import { describe, expect, it } from 'vitest';
import { WeWriteService } from '@/host/service';
import { WewriteServiceError } from '@/host/service-errors';
import { ArticleRecordSchema, ImageRecordSchema } from '@/host/domain';
import type { ArticleRecord, ImageRecord } from '@/host/domain';
import { MemoryDomain, json, makeCredentials, makeFetch, makeLlm, silentLogger, type Route } from './service-harness';

/**
 * AC-7 推送闸门 service 层回归（qa-test-plan §10-2 补齐）：
 * Where 门禁未过（article.status=editing/failed），pushArticleDraft 阻断且零网络调用；
 * 门禁真实通过（走真管线 + 真门禁，非 mock）后的 rendered 产物可推、状态原子转 pushed。
 * 兼收 AC-1 service 层遗留：draft/add 失败时文章不误标 pushed（qa-test-plan §5 AC-1 行登记项）。
 *
 * 本文件钉定 src/host/service.ts + wechat-flow.ts 的消费面：
 * - WeWriteService.open({domain, credentials, llm, fetchImpl?, now?})
 * - service.saveArticle / startRun / pushArticleDraft / getArticle / listRuns
 * - 拒绝错误码：'gates-not-passed'（闸门）与 'cover-missing'（封面缺失）
 *
 * 反作弊声明：门禁用真实 qualityGatesRunner（未注入 mock），LLM/HTTP 按 tests 先例 mock。
 */

const FIXED_NOW = new Date('2026-08-18T12:00:00.000Z');
const WECHAT_SECRET = 'wechat-secret-9f3a7c';
const OPENAI_KEY = 'sk-image-test-key';
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');

/** 真门禁（runQualityGates）可过的成稿：≥300 字、句长方差≥0.3、无禁用词、无有序列表、无图引用。 */
const PASSING_DRAFT = [
  '管线把一次写作拆成六个步骤，topic 选题、outline 搭骨架、draft 出成稿、gates 做门禁、render 渲染、images 配图。',
  '每一步只做一件事。',
  '失败了就停在原地，半成品绝不往下传，已完成的部分原样保留，重跑时从这里继续。',
  '门禁是硬闸。',
  '禁用词、内部标记、句长方差、信息密度、编号连续性，任何一项不过，默认推送路径就被拦下。',
  '这条规矩救过我们很多次。',
  '有一次成稿里混进了待补标记，门禁当场拦下，改完再推，草稿箱里从没出现过半成品。',
  '编辑器支持 `npm test` 一键回归。',
  '整条链路跑完约 40 秒。',
  '配图失败也无所谓。',
  '正文照常推进，图片位标注实际供应商，缺图不影响发稿节奏。',
].join('\n');

const wechatOkRoutes: Route[] = [
  { match: (u) => u.startsWith('https://api.openai.com/v1/images/generations'), respond: () => json({ data: [{ b64_json: PNG_B64 }] }) },
  { match: (u) => u.startsWith('https://api.weixin.qq.com/cgi-bin/token'), respond: () => json({ access_token: 'T_OK', expires_in: 7200 }) },
  { match: (u) => u.startsWith('https://api.weixin.qq.com/cgi-bin/material/add_material'), respond: () => json({ media_id: 'THUMB_OK' }) },
  { match: (u) => u.startsWith('https://api.weixin.qq.com/cgi-bin/media/uploadimg'), respond: () => json({ url: 'https://mmbiz.qpic.cn/body-1' }) },
  { match: (u) => u.startsWith('https://api.weixin.qq.com/cgi-bin/draft/add'), respond: () => json({ media_id: 'DRAFT_OK' }) },
];

const draftFailRoutes: Route[] = wechatOkRoutes.slice(0, 4).concat([
  { match: (u) => u.startsWith('https://api.weixin.qq.com/cgi-bin/draft/add'), respond: () => json({ errcode: 40001, errmsg: 'invalid credential' }) },
]);

async function makeService(routes: Route[], domain = new MemoryDomain()) {
  const credentials = makeCredentials({ WEWRITE_IMG_OPENAI: OPENAI_KEY });
  const llm = makeLlm(PASSING_DRAFT);
  const fetch = makeFetch(routes);
  const service = await WeWriteService.open({
    domain,
    credentials: credentials.service,
    llm: { stream: llm.stream },
    fetchImpl: fetch.fetchImpl,
    now: () => FIXED_NOW,
    logger: silentLogger,
  });
  return { service, domain, credentials, llm, fetch };
}

function seedArticle(domain: MemoryDomain, record: Partial<ArticleRecord> & { id: string; status: ArticleRecord['status'] }) {
  const article = ArticleRecordSchema.parse({
    v: 1,
    slug: 'seed-article',
    title: '已渲染稿件',
    digest: '种子稿件摘要',
    markdown: PASSING_DRAFT,
    theme: 'professional-clean',
    bodyImageIds: [],
    createdAt: '2026-08-18T04:00:00.000Z',
    updatedAt: '2026-08-18T04:00:00.000Z',
    ...record,
  });
  void domain.table('articles').put(article.id, article);
  return article;
}

function seedCover(domain: MemoryDomain, articleId: string, imageId = 'img_seed_cover'): ImageRecord {
  const image = ImageRecordSchema.parse({
    v: 1,
    id: imageId,
    articleId,
    kind: 'cover',
    mime: 'image/png',
    base64: PNG_B64,
    provider: 'openai',
    model: 'gpt-image-2',
    prompt: '封面',
    createdAt: '2026-08-18T04:00:00.000Z',
  });
  void domain.table('images').put(imageId, image);
  return image;
}

async function waitForTerminal(service: WeWriteService, runId: string, deadlineMs = 5000): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    const run = service.listRuns().find((entry) => entry.id === runId);
    if (run && ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(run.status)) return;
    if (Date.now() - startedAt > deadlineMs) throw new Error(`run ${runId} 未在 ${deadlineMs}ms 内到终态`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function rejectCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WewriteServiceError) return error.code;
    if (error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }
    return `non-coded-error:${error instanceof Error ? error.message : String(error)}`;
  }
  return 'no-error-thrown';
}

describe('AC-7 推送闸门：service 层（qa-test-plan §10-2 补齐）', () => {
  it('editing 状态（门禁未过）：pushArticleDraft 拒绝 gates-not-passed，零微信网络调用', async () => {
    const { service, fetch } = await makeService(wechatOkRoutes);
    const saved = await service.saveArticle({
      slug: 'gate-editing',
      title: '未过门禁的稿',
      digest: '摘要',
      markdown: '# 未过门禁',
      theme: 'professional-clean',
    });

    const code = await rejectCode(service.pushArticleDraft(saved.id));

    expect(code).toBe('gates-not-passed');
    expect(fetch.log.length).toBe(0);
  });

  it('failed 状态（管线门禁失败后的稿）：同样拒绝 gates-not-passed，零微信网络调用', async () => {
    const domain = new MemoryDomain();
    const article = seedArticle(domain, { id: 'art_gate_failed', status: 'failed' });
    const { service, fetch } = await makeService(wechatOkRoutes, domain);

    const code = await rejectCode(service.pushArticleDraft(article.id));

    expect(code).toBe('gates-not-passed');
    expect(fetch.log.length).toBe(0);
  });

  it('闸门正向分支（独立于管线绑定）：rendered+封面在库 → 推送成功、状态原子转 pushed、mediaId/thumbMediaId 回填', async () => {
    const domain = new MemoryDomain();
    seedCover(domain, 'art_gate_ok');
    seedArticle(domain, { id: 'art_gate_ok', status: 'rendered', coverImageId: 'img_seed_cover' });
    const { service } = await makeService(wechatOkRoutes, domain);

    const result = await service.pushArticleDraft('art_gate_ok');

    expect(result).toEqual({ mediaId: 'DRAFT_OK', thumbMediaId: 'THUMB_OK' });
    const detail = service.getArticle('art_gate_ok');
    expect(detail.status).toBe('pushed');
    expect(detail.wechatMediaId).toBe('DRAFT_OK');
    expect(detail.thumbMediaId).toBe('THUMB_OK');
  });

  it('真实管线全绿（真门禁通过）→ rendered 文章可推送（门禁过后可推的端到端链路）', async () => {
    const { service, domain } = await makeService(wechatOkRoutes);
    await service.setConfig({ wechatAppId: 'wx_test_appid' });
    await service.setCredential('WEWRITE_WECHAT_SECRET', WECHAT_SECRET);

    const { runId } = service.startRun({
      trigger: 'manual',
      params: { topicMode: 'fixed', topic: '管线门禁与推送', theme: 'professional-clean', imageCount: 1, llm: { provider: 'zhipu', model: 'glm-4.5-flash' } },
    });
    await waitForTerminal(service, runId);

    const run = service.listRuns().find((entry) => entry.id === runId);
    expect(run?.status).toBe('succeeded');
    const gatesStep = (domain.table('runs').get(runId) as { steps: { name: string; status: string }[] }).steps.find(
      (step) => step.name === 'gates',
    );
    expect(gatesStep?.status).toBe('succeeded');

    const articles = service.listArticles();
    expect(articles.length).toBe(1);
    expect(articles[0].status).toBe('rendered');
    const detail = service.getArticle(articles[0].id);

    // 管线产出封面后（imageCount=1，images 步产 cover+正文图），文章应绑定封面并推送成功。
    expect(detail.coverImageId).toBeDefined();
    const pushed = await service.pushArticleDraft(articles[0].id);
    expect(pushed.mediaId).toBe('DRAFT_OK');
    expect(service.getArticle(articles[0].id).status).toBe('pushed');
  });
});

describe('AC-1 service 层补齐：推送失败不误标 pushed（qa-test-plan §5 AC-1 行登记项）', () => {
  it('draft/add 返回 errcode：推送抛错，文章保持 rendered、无 mediaId 残留', async () => {
    const domain = new MemoryDomain();
    seedCover(domain, 'art_push_fail');
    seedArticle(domain, { id: 'art_push_fail', status: 'rendered', coverImageId: 'img_seed_cover' });
    const { service } = await makeService(draftFailRoutes, domain);

    const code = await rejectCode(service.pushArticleDraft('art_push_fail'));
    expect(code).not.toBe('no-error-thrown');

    const detail = service.getArticle('art_push_fail');
    expect(detail.status).toBe('rendered');
    expect(detail.wechatMediaId).toBeUndefined();
    expect(detail.thumbMediaId).toBeUndefined();
  });
});
