import { describe, expect, it, vi } from 'vitest';
import { WeChatApiError, createWeChatClient } from '@/host/wechat/client';

/**
 * v0.5.6 错误可视化的 client 行为面（拆自 wechat-client.test.ts，避免单文件膨胀）：
 * - 42001/40001 token 失效：清缓存换新 token 重发一次（仍失败才抛，且 hint 说清「已自动重试」）
 * - fetch 超时：timeoutMs 注入（默认 20s），超时抛 TIMEOUT 而非永久挂起
 * - 非 JSON 响应：转可读 SYSTEM 错误，不透出 "Unexpected token '<'" 语法墙
 */

const DIRECT_BASE = 'https://api.weixin.qq.com';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Captured {
  url: string;
  method: string;
}

type Route = { match: (url: string) => boolean; respond: () => Response };

function makeClient(options: { routes: Route[]; timeoutMs?: number }) {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const urlText = String(url);
    captured.push({ url: urlText, method: String(init?.method ?? 'GET') });
    for (const route of options.routes) {
      if (route.match(urlText)) return route.respond();
    }
    return new Response(JSON.stringify({ errcode: -99, errmsg: `no route for ${urlText}` }), { status: 200 });
  });
  const client = createWeChatClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getCredentials: () => ({ appId: 'wx_app_id_1', secret: 'secret_value_1' }),
    getSettings: () => ({ apiBaseUrl: DIRECT_BASE, author: 'Jerry' }),
    now: () => 1_700_000_000_000,
    timeoutMs: options.timeoutMs,
  });
  return { client, captured };
}

const json = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });

const tokenRoute = (payload: unknown | (() => unknown)): Route => ({
  match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/token`),
  respond: () => json(typeof payload === 'function' ? (payload as () => unknown)() : payload),
});

describe('42001/40001 token 失效重试（v0.5.6）', () => {
  it('uploadimg 第一遍 42001：清缓存换新 token 重发一次后成功', async () => {
    let uploadCalls = 0;
    let tokenSerial = 0;
    const { client, captured } = makeClient({
      routes: [
        tokenRoute(() => {
          tokenSerial += 1;
          return { access_token: `TOKEN_${tokenSerial}`, expires_in: 7200 };
        }),
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/media/uploadimg`),
          respond: () => {
            uploadCalls += 1;
            if (uploadCalls === 1) return json({ errcode: 42001, errmsg: 'access_token expired' });
            return json({ url: 'https://mmbiz.qpic.cn/mmbiz_png/abc123/0?wx_fmt=png' });
          },
        },
      ],
    });

    const url = await client.uploadContentImage({ buffer: PNG, filename: 'body-1.png', mime: 'image/png' });

    expect(url).toContain('mmbiz.qpic.cn');
    // 恰好一次重试：uploadimg 两次、token 重取一次（共两次），不是无限风暴。
    expect(uploadCalls).toBe(2);
    expect(captured.filter((c) => c.url.includes('/cgi-bin/token')).length).toBe(2);
    // 第二次 uploadimg 用的是重取的新 token，不是缓存的旧值。
    const uploadRequests = captured.filter((c) => c.url.includes('/uploadimg'));
    expect(new URL(uploadRequests[0]?.url ?? '').searchParams.get('access_token')).toBe('TOKEN_1');
    expect(new URL(uploadRequests[1]?.url ?? '').searchParams.get('access_token')).toBe('TOKEN_2');
  });

  it('pushDraft 链路 draft/add 第一遍 42001：换 token 重发后整链成功回填', async () => {
    let draftCalls = 0;
    let tokenSerial = 0;
    const { client } = makeClient({
      routes: [
        tokenRoute(() => {
          tokenSerial += 1;
          return { access_token: `TOKEN_${tokenSerial}`, expires_in: 7200 };
        }),
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
          respond: () => {
            draftCalls += 1;
            if (draftCalls === 1) return json({ errcode: 42001, errmsg: 'access_token expired' });
            return json({ media_id: 'DRAFT_MEDIA_OK' });
          },
        },
      ],
    });

    const result = await client.pushDraft({
      title: '标题',
      digest: '摘要',
      contentHtml: '<section>html</section>',
      thumbImage: { buffer: PNG, mime: 'image/png' },
      contentImages: [],
    });
    expect(result).toEqual({ mediaId: 'DRAFT_MEDIA_OK', thumbMediaId: 'THUMB_MEDIA_1' });
    expect(draftCalls).toBe(2);
  });

  it('重试后仍 42001：抛错，hint 说清「已自动重试」，且只重试一次', async () => {
    const { client, captured } = makeClient({
      routes: [
        tokenRoute({ access_token: 'TOKEN_1', expires_in: 7200 }),
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/material/add_material`),
          respond: () => json({ errcode: 42001, errmsg: 'access_token expired' }),
        },
      ],
    });

    const outcome = client.uploadThumbMaterial({ buffer: PNG, mime: 'image/png' });
    await expect(outcome).rejects.toBeInstanceOf(WeChatApiError);
    const error = (await outcome.catch((thrown: unknown) => thrown)) as WeChatApiError;
    expect(error.errcode).toBe(42001);
    expect(error.classification).toBe('AUTH');
    expect(error.hint).toContain('已自动重试');
    expect(captured.filter((c) => c.url.includes('/token')).length).toBe(2);
    expect(captured.filter((c) => c.url.includes('/add_material')).length).toBe(2);
  });

  it('token 获取本身 40001（凭据真错）：不重试，快速失败', async () => {
    const { client, captured } = makeClient({
      routes: [tokenRoute({ errcode: 40001, errmsg: 'invalid credential' })],
    });

    const outcome = client.pushDraft({
      title: '标题',
      digest: '摘要',
      contentHtml: '<section>html</section>',
      thumbImage: { buffer: PNG, mime: 'image/png' },
      contentImages: [],
    });
    await expect(outcome).rejects.toBeInstanceOf(WeChatApiError);
    // 只有首跳 /token 一次：凭据错误重试只是白打网络。
    expect(captured.length).toBe(1);
    expect(captured[0]?.url.includes('/token')).toBe(true);
  });

  it('非 token 失效错误（-1 SYSTEM）不触发重试：原样上抛一次', async () => {
    let materialCalls = 0;
    const { client, captured } = makeClient({
      routes: [
        tokenRoute({ access_token: 'TOKEN_1', expires_in: 7200 }),
        {
          match: (url) => url.startsWith(`${DIRECT_BASE}/cgi-bin/material/add_material`),
          respond: () => {
            materialCalls += 1;
            return json({ errcode: -1, errmsg: 'system error' });
          },
        },
      ],
    });

    const outcome = client.uploadThumbMaterial({ buffer: PNG, mime: 'image/png' });
    await expect(outcome).rejects.toBeInstanceOf(WeChatApiError);
    expect(materialCalls).toBe(1);
    expect(captured.filter((c) => c.url.includes('/token')).length).toBe(1);
  });
});

describe('fetch 超时（TIMEOUT 分类，v0.5.6）', () => {
  it('timeoutMs=1 + 永不 resolve 的 fetch：抛 TIMEOUT（errcode -1），不永久挂起', async () => {
    const client = createWeChatClient({
      // 永不 resolve 也永不 reject、不理会 signal——模拟网络黑洞；race 闸必须在时限到点后逃出。
      fetchImpl: (() => new Promise<Response>(() => {})) as unknown as typeof fetch,
      getCredentials: () => ({ appId: 'wx_1', secret: 's' }),
      getSettings: () => ({ apiBaseUrl: DIRECT_BASE, author: 'J' }),
      timeoutMs: 1,
    });

    const outcome = client.fetchAccessToken();
    await expect(outcome).rejects.toBeInstanceOf(WeChatApiError);
    const error = (await outcome.catch((thrown: unknown) => thrown)) as WeChatApiError;
    expect(error.errcode).toBe(-1);
    expect(error.classification).toBe('TIMEOUT');
    expect(error.message).toContain('秒无响应');
    expect(error.message).toContain('已中止');
    expect(error.hint).toContain('超时');
  });

  it('理会 signal 的 fetch 在时限后被中止：同样落 TIMEOUT（真实 fetch 行为）', async () => {
    const client = createWeChatClient({
      fetchImpl: ((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })) as unknown as typeof fetch,
      getCredentials: () => ({ appId: 'wx_1', secret: 's' }),
      getSettings: () => ({ apiBaseUrl: DIRECT_BASE, author: 'J' }),
      timeoutMs: 1,
    });

    const outcome = client.fetchAccessToken();
    const error = (await outcome.catch((thrown: unknown) => thrown)) as WeChatApiError;
    expect(error.classification).toBe('TIMEOUT');
    expect(error.errcode).toBe(-1);
  });
});

describe('非 JSON 响应（SYSTEM 分类，v0.5.6）', () => {
  it('响应体是 HTML：抛可读 SYSTEM 错误，而非 SyntaxError 墙', async () => {
    const { client } = makeClient({
      routes: [
        {
          match: () => true,
          respond: () => new Response('<html><body>Blocked by gateway</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        },
      ],
    });

    const outcome = client.fetchAccessToken();
    await expect(outcome).rejects.toBeInstanceOf(WeChatApiError);
    const error = (await outcome.catch((thrown: unknown) => thrown)) as WeChatApiError;
    expect(error.classification).toBe('SYSTEM');
    expect(error.message).toContain('非 JSON');
    expect(error.message).toContain('代理/网关');
    expect(error.message).not.toContain('Unexpected token');
  });
});
