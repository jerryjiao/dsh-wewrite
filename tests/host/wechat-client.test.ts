import { describe, expect, it, vi } from 'vitest';
import { WeChatApiError, createWeChatClient } from '@/host/wechat/client';

/**
 * 微信 API 客户端测试：token/uploadimg/material/draft 四端点形状（F30）、
 * AC-2（apiBaseUrl 全链路统一无混合路径）、AC-6（errcode 40164 分类诊断）、
 * AC-1（推送失败原子化无半成品）、media_id 回填。
 *
 * 本文件钉定 src/host/wechat/client.ts 消费面：
 * - createWeChatClient({ fetchImpl, getCredentials, getSettings, now? })
 * - WeChatApiError{ errcode, classification, hint? }
 *   classification: 'IP_WHITELIST' | 'AUTH' | 'RATE_LIMIT' | 'SYSTEM' | 'UNKNOWN'
 * - access_token 有效期内缓存（expires_in），过期按注入 now 重取
 */

const DIRECT_BASE = 'https://api.weixin.qq.com';
const RELAY_BASE = 'https://relay.example.cn';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Captured {
  url: string;
  method: string;
  body: unknown;
  bodyText: string;
}

type Route = { match: (url: string) => boolean; respond: () => Response };

function makeClient(options: {
  routes: Route[];
  apiBaseUrl?: string;
  appId?: string;
  secret?: string;
  author?: string;
  now?: () => number;
}) {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const urlText = String(url);
    captured.push({
      url: urlText,
      method: String(init?.method ?? 'GET'),
      body: init?.body,
      bodyText: typeof init?.body === 'string' ? init.body : '[non-string-body]',
    });
    for (const route of options.routes) {
      if (route.match(urlText)) return route.respond();
    }
    return new Response(JSON.stringify({ errcode: -99, errmsg: `no route for ${urlText}` }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  const client = createWeChatClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getCredentials: () => ({ appId: options.appId ?? 'wx_app_id_1', secret: options.secret ?? 'secret_value_1' }),
    getSettings: () => ({ apiBaseUrl: options.apiBaseUrl ?? DIRECT_BASE, author: options.author ?? 'Jerry' }),
    now: options.now ?? (() => 1_700_000_000_000),
  });
  return { client, captured, fetchImpl };
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

const tokenRoute = (base: string, payload: unknown | (() => unknown)): Route => ({
  match: (url) => url.startsWith(`${base}/cgi-bin/token`),
  respond: () => json(typeof payload === 'function' ? (payload as () => unknown)() : payload),
});

describe('token 端点形状（F30）', () => {
  it('GET /cgi-bin/token，query 带 grant_type=client_credential 与 appid/secret', async () => {
    const { client, captured } = makeClient({
      routes: [tokenRoute(DIRECT_BASE, { access_token: 'TOKEN_1', expires_in: 7200 })],
    });

    await expect(client.fetchAccessToken()).resolves.toBe('TOKEN_1');

    expect(captured.length).toBe(1);
    const parsed = new URL(captured[0].url);
    expect(parsed.origin).toBe(DIRECT_BASE);
    expect(parsed.pathname).toBe('/cgi-bin/token');
    expect(captured[0].method).toBe('GET');
    expect(parsed.searchParams.get('grant_type')).toBe('client_credential');
    expect(parsed.searchParams.get('appid')).toBe('wx_app_id_1');
    expect(parsed.searchParams.get('secret')).toBe('secret_value_1');
  });

  it('token 有效期内缓存复用，过期（按注入 now 越过 expires_in）后重取', async () => {
    let clock = 1_700_000_000_000;
    let tokenSerial = 0;
    const { client, captured } = makeClient({
      now: () => clock,
      routes: [
        tokenRoute(DIRECT_BASE, () => {
          tokenSerial += 1;
          return { access_token: `TOKEN_${tokenSerial}`, expires_in: 7200 };
        }),
      ],
    });

    await expect(client.fetchAccessToken()).resolves.toBe('TOKEN_1');
    await expect(client.fetchAccessToken()).resolves.toBe('TOKEN_1');
    expect(captured.filter((c) => c.url.includes('/token')).length).toBe(1);

    clock += 7201 * 1000;
    await expect(client.fetchAccessToken()).resolves.toBe('TOKEN_2');
    expect(captured.filter((c) => c.url.includes('/token')).length).toBe(2);
  });
});

describe('uploadimg / add_material / draft 端点形状（F30）', () => {
  it('uploadContentImage：POST multipart 到 /cgi-bin/media/uploadimg，返回微信 CDN URL', async () => {
    const { client, captured } = makeClient({
      routes: [
        tokenRoute(DIRECT_BASE, { access_token: 'TOKEN_1', expires_in: 7200 }),
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/media/uploadimg`),
          respond: () => json({ url: 'https://mmbiz.qpic.cn/mmbiz_png/abc123/0?wx_fmt=png' }),
        },
      ],
    });

    const url = await client.uploadContentImage({ buffer: PNG, filename: 'body-1.png', mime: 'image/png' });

    expect(url).toBe('https://mmbiz.qpic.cn/mmbiz_png/abc123/0?wx_fmt=png');
    const upload = captured.find((c) => c.url.includes('/media/uploadimg'));
    expect(upload).toBeDefined();
    expect(upload?.method).toBe('POST');
    expect(new URL(upload?.url ?? '').searchParams.get('access_token')).toBe('TOKEN_1');
    expect(upload?.body).toBeInstanceOf(FormData);
    expect((upload?.body as FormData).get('media')).not.toBeNull();
  });

  it('uploadThumbMaterial：POST multipart 到 /cgi-bin/material/add_material?type=image，返回 thumb media_id', async () => {
    const { client, captured } = makeClient({
      routes: [
        tokenRoute(DIRECT_BASE, { access_token: 'TOKEN_1', expires_in: 7200 }),
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/material/add_material`),
          respond: () => json({ media_id: 'THUMB_MEDIA_1' }),
        },
      ],
    });

    const thumbMediaId = await client.uploadThumbMaterial({ buffer: PNG, filename: 'cover.png', mime: 'image/png' });

    expect(thumbMediaId).toBe('THUMB_MEDIA_1');
    const material = captured.find((c) => c.url.includes('/material/add_material'));
    expect(material?.method).toBe('POST');
    expect(new URL(material?.url ?? '').searchParams.get('type')).toBe('image');
    expect(material?.body).toBeInstanceOf(FormData);
  });

  it('addDraft：POST JSON 到 /cgi-bin/draft/add，articles[0] 五要素齐全，返回 media_id', async () => {
    const { client, captured } = makeClient({
      routes: [
        tokenRoute(DIRECT_BASE, { access_token: 'TOKEN_1', expires_in: 7200 }),
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/draft/add`),
          respond: () => json({ media_id: 'DRAFT_MEDIA_1' }),
        },
      ],
    });

    const mediaId = await client.addDraft({
      title: '文章标题',
      digest: '文章摘要',
      author: 'Jerry',
      contentHtml: '<section style="color:#0F1115">正文</section>',
      thumbMediaId: 'THUMB_MEDIA_1',
      contentImageUrls: ['https://mmbiz.qpic.cn/mmbiz_png/abc123/0?wx_fmt=png'],
    });

    expect(mediaId).toBe('DRAFT_MEDIA_1');
    const draft = captured.find((c) => c.url.includes('/draft/add'));
    expect(draft?.method).toBe('POST');
    expect(new URL(draft?.url ?? '').searchParams.get('access_token')).toBe('TOKEN_1');
    const body = JSON.parse(draft?.bodyText ?? '{}') as { articles: Array<Record<string, unknown>> };
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles.length).toBe(1);
    expect(body.articles[0]).toMatchObject({
      title: '文章标题',
      digest: '文章摘要',
      author: 'Jerry',
      thumb_media_id: 'THUMB_MEDIA_1',
    });
    expect(String(body.articles[0].content)).toContain('<section');
  });
});

describe('pushDraft 编排与 media_id 回填（AC-3 成功流）', () => {
  const pushRoutes = (base: string): Route[] => [
    tokenRoute(base, { access_token: 'TOKEN_1', expires_in: 7200 }),
    {
      match: (url) => url.startsWith(`${base}/cgi-bin/media/uploadimg`),
      respond: () => json({ url: 'https://mmbiz.qpic.cn/mmbiz_png/body/0?wx_fmt=png' }),
    },
    {
      match: (url) => url.startsWith(`${base}/cgi-bin/material/add_material`),
      respond: () => json({ media_id: 'THUMB_MEDIA_1' }),
    },
    {
      match: (url) => url.startsWith(`${base}/cgi-bin/draft/add`),
      respond: () => json({ media_id: 'DRAFT_MEDIA_9' }),
    },
  ];

  it('成功流：返回 { mediaId, thumbMediaId } 双回填', async () => {
    const { client } = makeClient({ routes: pushRoutes(DIRECT_BASE) });
    const result = await client.pushDraft({
      title: '标题',
      digest: '摘要',
      contentHtml: '<section style="margin:0">html</section>',
      thumbImage: { buffer: PNG, mime: 'image/png' },
      contentImages: [{ buffer: PNG, mime: 'image/png' }],
    });
    expect(result).toEqual({ mediaId: 'DRAFT_MEDIA_9', thumbMediaId: 'THUMB_MEDIA_1' });
  });

  it('编排顺序：token -> uploadimg(正文图) -> add_material(封面) -> draft/add', async () => {
    const { client, captured } = makeClient({ routes: pushRoutes(DIRECT_BASE) });
    await client.pushDraft({
      title: '标题',
      digest: '摘要',
      contentHtml: '<section>html</section>',
      thumbImage: { buffer: PNG, mime: 'image/png' },
      contentImages: [{ buffer: PNG, mime: 'image/png' }, { buffer: PNG, mime: 'image/png' }],
    });

    const paths = captured.map((c) => new URL(c.url).pathname);
    expect(paths[0]).toBe('/cgi-bin/token');
    expect(paths[1]).toBe('/cgi-bin/media/uploadimg');
    expect(paths[2]).toBe('/cgi-bin/media/uploadimg');
    expect(paths[3]).toBe('/cgi-bin/material/add_material');
    expect(paths[4]).toBe('/cgi-bin/draft/add');
    expect(paths.length).toBe(5);
  });
});

describe('AC-2：apiBaseUrl 全链路统一（无混合路径）', () => {
  it('自定义 relay base：全部请求以 relay 前缀发出，无一处直连 api.weixin.qq.com', async () => {
    const routes: Route[] = [
      tokenRoute(RELAY_BASE, { access_token: 'TOKEN_R', expires_in: 7200 }),
      {
        match: (url) => url.startsWith(`${RELAY_BASE}/cgi-bin/media/uploadimg`),
        respond: () => json({ url: 'https://mmbiz.qpic.cn/mmbiz_png/body/0?wx_fmt=png' }),
      },
      {
        match: (url) => url.startsWith(`${RELAY_BASE}/cgi-bin/material/add_material`),
        respond: () => json({ media_id: 'THUMB_R' }),
      },
      {
        match: (url) => url.startsWith(`${RELAY_BASE}/cgi-bin/draft/add`),
        respond: () => json({ media_id: 'DRAFT_R' }),
      },
    ];
    const { client, captured } = makeClient({ apiBaseUrl: RELAY_BASE, routes });

    const result = await client.pushDraft({
      title: '标题',
      digest: '摘要',
      contentHtml: '<section>html</section>',
      thumbImage: { buffer: PNG, mime: 'image/png' },
      contentImages: [{ buffer: PNG, mime: 'image/png' }],
    });

    expect(result).toEqual({ mediaId: 'DRAFT_R', thumbMediaId: 'THUMB_R' });
    expect(captured.length).toBe(4);
    for (const request of captured) {
      expect(request.url.startsWith(RELAY_BASE), `混合路径泄漏: ${request.url}`).toBe(true);
    }
    expect(captured.some((c) => c.url.includes('api.weixin.qq.com'))).toBe(false);
  });
});

describe('AC-1：推送失败原子化（无半成品）', () => {
  it('draft/add 返回 errcode：pushDraft 抛 WeChatApiError，不返回任何 mediaId', async () => {
    const { client } = makeClient({
      routes: [
        tokenRoute(DIRECT_BASE, { access_token: 'TOKEN_1', expires_in: 7200 }),
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/media/uploadimg`),
          respond: () => json({ url: 'https://mmbiz.qpic.cn/mmbiz_png/body/0?wx_fmt=png' }),
        },
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/material/add_material`),
          respond: () => json({ media_id: 'THUMB_MEDIA_1' }),
        },
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/draft/add`),
          respond: () => json({ errcode: -1, errmsg: 'system error' }),
        },
      ],
    });

    const outcome = client.pushDraft({
      title: '标题',
      digest: '摘要',
      contentHtml: '<section>html</section>',
      thumbImage: { buffer: PNG, mime: 'image/png' },
      contentImages: [],
    });

    await expect(outcome).rejects.toBeInstanceOf(WeChatApiError);
    const error = await outcome.catch((thrown: unknown) => thrown as WeChatApiError);
    expect(error.errcode).toBe(-1);
  });

  it('token 获取失败：快速失败，后续 uploadimg/material/draft 零调用', async () => {
    const { client, captured } = makeClient({
      routes: [tokenRoute(DIRECT_BASE, { errcode: 40001, errmsg: 'invalid credential' })],
    });

    await expect(client.pushDraft({
      title: '标题',
      digest: '摘要',
      contentHtml: '<section>html</section>',
      thumbImage: { buffer: PNG, mime: 'image/png' },
      contentImages: [],
    })).rejects.toBeInstanceOf(WeChatApiError);

    expect(captured.length).toBe(1);
    expect(captured[0].url.includes('/token')).toBe(true);
  });
});

describe('AC-6：errcode 分类诊断', () => {
  it('40164：classification=IP_WHITELIST，错误信息含微信回显的出口 IP', async () => {
    const { client } = makeClient({
      routes: [
        tokenRoute(DIRECT_BASE, {
          errcode: 40164,
          errmsg: 'invalid ip 203.0.113.7 ipv6 ::ffff:203.0.113.7, not in whitelist',
        }),
      ],
    });

    const outcome = client.fetchAccessToken();
    await expect(outcome).rejects.toBeInstanceOf(WeChatApiError);
    const error = await outcome.catch((thrown: unknown) => thrown as WeChatApiError);
    expect(error.errcode).toBe(40164);
    expect(error.classification).toBe('IP_WHITELIST');
    expect(error.message).toContain('203.0.113.7');
  });

  it('40001：classification=AUTH（凭据错误流）', async () => {
    const { client } = makeClient({
      routes: [tokenRoute(DIRECT_BASE, { errcode: 40001, errmsg: 'invalid credential' })],
    });
    const outcome = client.fetchAccessToken();
    const error = await outcome.catch((thrown: unknown) => thrown as WeChatApiError);
    expect(error.errcode).toBe(40001);
    expect(error.classification).toBe('AUTH');
  });

  it('WeChatApiError 是 Error 子类', () => {
    expect(new WeChatApiError(40164, 'IP_WHITELIST', '提示')).toBeInstanceOf(Error);
  });
});

describe('wechat/diagnose 端点行为（Spec §5 末行）', () => {
  it('40164 场景：reachable=true, ipWhitelisted=false, hint 含出口 IP 与两条出路（白名单+代理）', async () => {
    const { client } = makeClient({
      routes: [
        tokenRoute(DIRECT_BASE, {
          errcode: 40164,
          errmsg: 'invalid ip 203.0.113.7, not in whitelist',
        }),
      ],
    });

    const result = await client.diagnose();

    expect(result.reachable).toBe(true);
    expect(result.ipWhitelisted).toBe(false);
    expect(result.errcode).toBe(40164);
    expect(result.hint).toContain('203.0.113.7');
    expect(result.hint).toContain('白名单');
    expect(result.hint).toContain('代理');
    expect(result.hint.length).toBeGreaterThan(10);
  });

  it('网络不通：reachable=false 且 hint 非空', async () => {
    const { client } = makeClient({
      routes: [
        {
          match: () => true,
          respond: () => {
            throw new TypeError('fetch failed');
          },
        },
      ],
    });

    const result = await client.diagnose();
    expect(result.reachable).toBe(false);
    expect(typeof result.hint).toBe('string');
    expect(result.hint.length).toBeGreaterThan(0);
  });

  it('token 成功：reachable=true 且 ipWhitelisted=true', async () => {
    const { client } = makeClient({
      routes: [tokenRoute(DIRECT_BASE, { access_token: 'TOKEN_1', expires_in: 7200 })],
    });
    const result = await client.diagnose();
    expect(result.reachable).toBe(true);
    expect(result.ipWhitelisted).toBe(true);
  });
});
