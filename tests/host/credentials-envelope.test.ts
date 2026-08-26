import { describe, expect, it } from 'vitest';
import { WeWriteService } from '@/host/service';
import { unwrapCredential } from '@/host/platform';
import { ArticleRecordSchema, ImageRecordSchema } from '@/host/domain';
import { MemoryDomain, json, makeCredentials, makeFetch, makeLlm, silentLogger, type Route } from './service-harness';

/**
 * 宿主凭据信封回归（2026-08-26 真机首跑实证）：dsh 宿主 ctx.credentials.resolve
 * 实测返回 {value, source} 信封对象，而非插件旧声明的裸 string——信封被整体当
 * secret 拼进 URL 后成为 "[object Object]"，微信回 40125 invalid appsecret。
 *
 * 本文件钉定：
 * - unwrapCredential 三形状归一（裸串/信封/垃圾）
 * - 全链推送（setCredential → pushArticleDraft → /cgi-bin/token）在信封宿主下
 *   仍把正确 secret 送进 token 请求的 query。
 */

const FIXED_NOW = new Date('2026-08-26T12:00:00.000Z');
const WECHAT_SECRET = 'wechat-secret-9f3a7c';
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');

const MARKDOWN = [
  '# 已渲染稿件', '',
  '这是一篇直接种子成 rendered 状态的稿件，用于验证推送链路的凭据消费面。',
  '门禁已经通过。', '推送只走草稿箱。', '封面随稿上传为永久素材。',
].join('\n');

describe('unwrapCredential：宿主信封形状归一', () => {
  it('裸 string 原样返回；空串归一 undefined（空存值视同未配置）', () => {
    expect(unwrapCredential('sk-abc')).toBe('sk-abc');
    expect(unwrapCredential('')).toBeUndefined();
  });

  it('{value, source} 信封取 value（真宿主 dsh-credentials 实测形状）', () => {
    expect(unwrapCredential({ value: 'sk-abc', source: 'file' })).toBe('sk-abc');
    expect(unwrapCredential({ value: '', source: 'file' })).toBeUndefined();
    expect(unwrapCredential({ source: 'file' })).toBeUndefined();
  });

  it('垃圾形状（null/数字/无字符串 value 的对象）归一 undefined', () => {
    expect(unwrapCredential(null)).toBeUndefined();
    expect(unwrapCredential(undefined)).toBeUndefined();
    expect(unwrapCredential({ value: 42 } as never)).toBeUndefined();
    expect(unwrapCredential({} as never)).toBeUndefined();
  });
});

describe('信封宿主下的真实推送链路', () => {
  it('resolve 返回 {value,source} 时 pushArticleDraft 仍把正确 secret 送进 token query', async () => {
    const routes: Route[] = [
      { match: (u) => u.includes('/cgi-bin/token'), respond: () => json({ access_token: 'T_OK', expires_in: 7200 }) },
      { match: (u) => u.includes('/cgi-bin/material/add_material'), respond: () => json({ media_id: 'THUMB_OK' }) },
      { match: (u) => u.includes('/cgi-bin/draft/add'), respond: () => json({ media_id: 'DRAFT_OK' }) },
    ];

    const base = makeCredentials();
    // 真宿主同款：resolve 出口包成 {value, source} 信封
    const envelopeCredentials = {
      ...base.service,
      resolve: (ref: string) => Promise.resolve(base.service.resolve(ref)).then((v) => ({ value: v as string, source: 'file' })),
    };

    const domain = new MemoryDomain();
    const llm = makeLlm(MARKDOWN);
    const fetch = makeFetch(routes);
    const service = await WeWriteService.open({
      domain,
      credentials: envelopeCredentials,
      llm: { stream: llm.stream },
      fetchImpl: fetch.fetchImpl,
      now: () => FIXED_NOW,
      logger: silentLogger,
    });

    await service.setCredential('WEWRITE_WECHAT_SECRET', WECHAT_SECRET);

    const article = ArticleRecordSchema.parse({
      v: 1, id: 'art_env_push', slug: 'env-push', title: '信封宿主推送验证', digest: '摘要',
      status: 'rendered', markdown: MARKDOWN, theme: 'professional-clean',
      bodyImageIds: [], coverImageId: 'img_env_cover',
      createdAt: FIXED_NOW.toISOString(), updatedAt: FIXED_NOW.toISOString(),
    });
    void domain.table('articles').put(article.id, article);
    const cover = ImageRecordSchema.parse({
      v: 1, id: 'img_env_cover', articleId: article.id, kind: 'cover', mime: 'image/png',
      base64: PNG_B64, provider: 'openai', model: 'gpt-image-2', prompt: '封面',
      createdAt: FIXED_NOW.toISOString(),
    });
    void domain.table('images').put(cover.id, cover);

    const result = await service.pushArticleDraft(article.id);

    expect(result.mediaId).toBe('DRAFT_OK');
    expect(result.thumbMediaId).toBe('THUMB_OK');
    const tokenCall = fetch.log.find((entry) => entry.url.includes('/cgi-bin/token'));
    expect(tokenCall).toBeDefined();
    expect(tokenCall?.url).toContain(`secret=${encodeURIComponent(WECHAT_SECRET)}`);
    expect(tokenCall?.url).not.toContain('object');
  });
});
