import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImageProviderError,
  type ImageGenRequest,
  type ImageGenResult,
  type ImageProvider,
  type ResolvedProviderConfig,
} from '@/host/providers/types';
import {
  ImageFallbackExhaustedError,
  runImageFallback,
  type ImageAttempt,
} from '@/host/providers/registry';
import { DEFAULT_IMAGE_PROVIDER_CHAIN, IMAGE_PROVIDER_IDS } from '@/shared/image-provider-ids';
import { createOpenAiProvider } from '@/host/providers/openai';
import { createDoubaoProvider } from '@/host/providers/doubao';
import { createDashscopeProvider } from '@/host/providers/dashscope';
import { createJimengProvider } from '@/host/providers/jimeng';
import { createMinimaxProvider } from '@/host/providers/minimax';
import { createAzureOpenAiProvider } from '@/host/providers/azure-openai';
import { createGeminiProvider } from '@/host/providers/gemini';
import { createOpenrouterProvider } from '@/host/providers/openrouter';
import { createReplicateProvider } from '@/host/providers/replicate';

/**
 * 图片供应商层测试：fallback 编排（AC-9）、ImageProviderError 分类派生、
 * 9 家 provider 的传输层单测（HTTP 层 mock，不打真网络）。
 *
 * 本文件钉定：
 * - types.ts: ImageProviderError(providerId, code, message) 的 retryable 按 code 派生
 *   AUTH=false; RATE_LIMIT/TIMEOUT/NETWORK/PROVIDER=true
 * - registry.ts: runImageFallback(providers, resolveConfig, req) -> { result, providerId, attempts }
 *   单家 retryable 错误重试恰好一次；非 retryable 立即降级；全失败抛 ImageFallbackExhaustedError(attempts)
 * - 每家 provider 的内部响应解析统一支持 {data:[{b64_json}]} 与 {data:[{url}]} 双形态
 *   （openai 标准形状为 provider 层内部协议；远端形状由各家 adapter 自行归一——对齐源管线 image_gen.mjs 先例）
 */

const PNG_MAGIC = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_B64 = Buffer.from(PNG_MAGIC).toString('base64');
const CDN_URL = 'https://cdn.example.test/generated/img-001.png';

const cfg = (extra: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig => ({
  apiKey: 'test-key-0123456789abcdef',
  baseUrl: 'https://gw.example.test/v1',
  model: 'test-image-model',
  ...extra,
});

const imageReq = (overrides: Partial<ImageGenRequest> = {}): ImageGenRequest => ({
  prompt: '一个克制的深蓝色科技封面',
  size: '1024x1024',
  n: 1,
  ...overrides,
});

const genResult = (): ImageGenResult => ({
  images: [{ buffer: Buffer.from(PNG_MAGIC), mime: 'image/png' }],
  model: 'test-image-model',
});

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string;
  signal: AbortSignal | undefined;
}

function captureFrom(init: RequestInit | undefined, url: string): CapturedRequest {
  const headers: Record<string, string> = {};
  const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
  for (const [key, value] of Object.entries(rawHeaders)) {
    headers[key.toLowerCase()] = String(value);
  }
  const body = init?.body;
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return {
    url: String(url),
    method: String(init?.method ?? 'GET'),
    headers,
    bodyText,
    signal: (init?.signal as AbortSignal | undefined) ?? undefined,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function binaryResponse(bytes: Uint8Array): Response {
  return new Response(Buffer.from(bytes), { status: 200, headers: { 'content-type': 'image/png' } });
}

/** mock 全局 fetch：responses 按调用序出队，末项循环；捕获全部请求。 */
function mockFetch(responses: Array<() => Response | Promise<Response>>) {
  const captured: CapturedRequest[] = [];
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    captured.push(captureFrom(init, String(url)));
    const producer = responses[Math.min(captured.length - 1, responses.length - 1)];
    return producer();
  });
  vi.stubGlobal('fetch', fetchMock);
  return { captured, fetchMock };
}

const PROVIDER_FACTORIES: ReadonlyArray<[string, () => ImageProvider]> = [
  ['openai', createOpenAiProvider],
  ['doubao', createDoubaoProvider],
  ['dashscope', createDashscopeProvider],
  ['jimeng', createJimengProvider],
  ['minimax', createMinimaxProvider],
  ['azure_openai', createAzureOpenAiProvider],
  ['gemini', createGeminiProvider],
  ['openrouter', createOpenrouterProvider],
  ['replicate', createReplicateProvider],
];

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('供应商 ID 常量（架构 §7.1）', () => {
  it('IMAGE_PROVIDER_IDS 精确包含 9 家', () => {
    expect([...IMAGE_PROVIDER_IDS].sort()).toEqual(
      ['azure_openai', 'doubao', 'dashscope', 'gemini', 'jimeng', 'minimax', 'openai', 'openrouter', 'replicate'].sort(),
    );
  });

  it('默认 fallback 链 9 家按序，openai(gpt-image-2) 恒第一（Jerry 指令）', () => {
    expect([...DEFAULT_IMAGE_PROVIDER_CHAIN]).toEqual([
      'openai',
      'doubao',
      'dashscope',
      'jimeng',
      'minimax',
      'azure_openai',
      'gemini',
      'openrouter',
      'replicate',
    ]);
  });
});

describe('ImageProviderError 分类（架构 §7.1 错误约定）', () => {
  it('retryable 由 code 派生：AUTH=false，RATE_LIMIT/TIMEOUT/NETWORK/PROVIDER=true', () => {
    const cases: Array<[ImageProviderError['code'], boolean]> = [
      ['AUTH', false],
      ['RATE_LIMIT', true],
      ['TIMEOUT', true],
      ['NETWORK', true],
      ['PROVIDER', true],
    ];
    for (const [code, retryable] of cases) {
      const error = new ImageProviderError({ providerId: 'openai', code, message: `错误 ${code}` });
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
      expect(error.providerId).toBe('openai');
      expect(error.message).toContain(code);
    }
  });

  it('是 Error 子类（可被上层 catch 统一处理）', () => {
    const error = new ImageProviderError({ providerId: 'gemini', code: 'AUTH', message: '凭据无效' });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ImageProviderError);
  });
});

function scriptedProvider(id: string, steps: Array<() => Promise<ImageGenResult>>): ImageProvider {
  let index = 0;
  return {
    id: id as ImageProvider['id'],
    generate: vi.fn(async () => {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      return step();
    }),
  };
}

const resolveAllWith = (config: ResolvedProviderConfig) => (_providerId: string) => config;

describe('runImageFallback：fallback 编排（AC-9）', () => {
  it('首家成功：仅一次调用，attempts 单条 success', async () => {
    const openai = scriptedProvider('openai', [async () => genResult()]);
    const doubao = scriptedProvider('doubao', [async () => genResult()]);
    const outcome = await runImageFallback([openai, doubao], resolveAllWith(cfg()), imageReq());

    expect(outcome.providerId).toBe('openai');
    expect(outcome.result.images.length).toBe(1);
    expect(outcome.attempts.length).toBe(1);
    expect(outcome.attempts[0]).toMatchObject({ providerId: 'openai', tries: 1, outcome: 'success' });
    expect(doubao.generate).toHaveBeenCalledTimes(0);
  });

  it('retryable 失败后同家重试恰好一次并成功（AC-9 按序降级+单家重试）', async () => {
    const openai = scriptedProvider('openai', [
      async () => {
        throw new ImageProviderError({ providerId: 'openai', code: 'RATE_LIMIT', message: '限流' });
      },
      async () => genResult(),
    ]);
    const outcome = await runImageFallback([openai], resolveAllWith(cfg()), imageReq());

    expect(openai.generate).toHaveBeenCalledTimes(2);
    expect(outcome.providerId).toBe('openai');
    const attempt = outcome.attempts[0] as ImageAttempt;
    expect(attempt.tries).toBe(2);
    expect(attempt.outcome).toBe('success');
    expect(attempt.codes).toEqual(['RATE_LIMIT']);
  });

  it('retryable 连续失败两次后不再第三次，降级下一家（重试上限=1）', async () => {
    const openai = scriptedProvider('openai', [
      async () => {
        throw new ImageProviderError({ providerId: 'openai', code: 'TIMEOUT', message: '超时' });
      },
    ]);
    const doubao = scriptedProvider('doubao', [async () => genResult()]);
    const outcome = await runImageFallback([openai, doubao], resolveAllWith(cfg()), imageReq());

    expect(openai.generate).toHaveBeenCalledTimes(2);
    expect(outcome.providerId).toBe('doubao');
    expect(outcome.attempts.map((a: ImageAttempt) => a.providerId)).toEqual(['openai', 'doubao']);
    expect(outcome.attempts[0]).toMatchObject({ tries: 2, outcome: 'error', codes: ['TIMEOUT', 'TIMEOUT'] });
  });

  it('非 retryable（AUTH）不重试，立即降级下一家', async () => {
    const openai = scriptedProvider('openai', [
      async () => {
        throw new ImageProviderError({ providerId: 'openai', code: 'AUTH', message: 'key 无效' });
      },
    ]);
    const doubao = scriptedProvider('doubao', [async () => genResult()]);
    const outcome = await runImageFallback([openai, doubao], resolveAllWith(cfg()), imageReq());

    expect(openai.generate).toHaveBeenCalledTimes(1);
    expect(outcome.providerId).toBe('doubao');
    expect(outcome.attempts[0]).toMatchObject({ tries: 1, outcome: 'error', codes: ['AUTH'] });
  });

  it('全链失败：抛 ImageFallbackExhaustedError，携带完整尝试史（架构：尝试链入 metrics）', async () => {
    const providers = PROVIDER_FACTORIES.map(([id]) =>
      scriptedProvider(
        id,
        [
          async () => {
            throw new ImageProviderError({ providerId: id, code: 'AUTH', message: '凭据无效' });
          },
        ],
      ),
    );
    const attempt = runImageFallback(providers, resolveAllWith(cfg()), imageReq());

    await expect(attempt).rejects.toBeInstanceOf(ImageFallbackExhaustedError);
    const error = await attempt.catch((thrown: unknown) => thrown as ImageFallbackExhaustedError);
    expect(error.attempts.length).toBe(9);
    expect(error.attempts.every((a: ImageAttempt) => a.outcome === 'error' && a.tries === 1)).toBe(true);
    expect(error.attempts.map((a: ImageAttempt) => a.providerId)).toEqual([...DEFAULT_IMAGE_PROVIDER_CHAIN]);
  });

  it('空链：拒绝并携带空尝试史', async () => {
    const attempt = runImageFallback([], resolveAllWith(cfg()), imageReq());
    await expect(attempt).rejects.toBeInstanceOf(ImageFallbackExhaustedError);
    const error = await attempt.catch((thrown: unknown) => thrown as ImageFallbackExhaustedError);
    expect(error.attempts.length).toBe(0);
  });

  it('req.signal 已中止：不发起任何调用直接拒绝', async () => {
    const controller = new AbortController();
    controller.abort();
    const openai = scriptedProvider('openai', [async () => genResult()]);
    await expect(
      runImageFallback([openai], resolveAllWith(cfg()), imageReq({ signal: controller.signal })),
    ).rejects.toThrow();
    expect(openai.generate).toHaveBeenCalledTimes(0);
  });

  it('ImageFallbackExhaustedError 是 Error 子类', () => {
    expect(new ImageFallbackExhaustedError([])).toBeInstanceOf(Error);
  });
});

describe('9 家 provider 传输层单测（HTTP mock，双形态解析）', () => {
  for (const [providerId, factory] of PROVIDER_FACTORIES) {
    describe(`${providerId}`, () => {
      it('b64_json 形态：解析出精确 PNG 字节', async () => {
        const { captured } = mockFetch([() => jsonResponse({ data: [{ b64_json: PNG_B64 }] })]);
        const provider = factory();
        const result = await provider.generate(imageReq(), cfg());

        expect(result.images.length).toBe(1);
        expect(Buffer.compare(result.images[0].buffer, Buffer.from(PNG_MAGIC))).toBe(0);
        expect(result.images[0].mime.startsWith('image/')).toBe(true);
        expect(result.model).toBe('test-image-model');
        expect(captured.length).toBe(1);
      });

      it('url 形态：二次拉取 URL 拿到二进制', async () => {
        const { captured } = mockFetch([
          () => jsonResponse({ data: [{ url: CDN_URL }] }),
          () => binaryResponse(PNG_MAGIC),
        ]);
        const provider = factory();
        const result = await provider.generate(imageReq(), cfg());

        expect(result.images.length).toBe(1);
        expect(Buffer.compare(result.images[0].buffer, Buffer.from(PNG_MAGIC))).toBe(0);
        expect(captured.length).toBe(2);
        expect(captured[1].url).toBe(CDN_URL);
        expect(captured[1].method).toBe('GET');
      });

      it('请求不变量：baseUrl 前缀 + POST + prompt 传递 + 凭据携带 + signal 透传', async () => {
        const controller = new AbortController();
        const { captured } = mockFetch([() => jsonResponse({ data: [{ b64_json: PNG_B64 }] })]);
        const provider = factory();
        await provider.generate(imageReq({ signal: controller.signal }), cfg());

        const request = captured[0];
        expect(request.url.startsWith('https://gw.example.test/v1'), `URL: ${request.url}`).toBe(true);
        expect(request.method).toBe('POST');
        expect(request.bodyText.includes('一个克制的深蓝色科技封面')).toBe(true);
        const authSurface = `${request.url} ${JSON.stringify(request.headers)} ${request.bodyText}`;
        expect(authSurface.includes('test-key-0123456789abcdef')).toBe(true);
        expect(request.signal).toBe(controller.signal);
      });

      it('错误分类：401 拒为 AUTH 且不可重试', async () => {
        mockFetch([() => jsonResponse({ error: { message: 'invalid api key' } }, 401)]);
        const provider = factory();
        const outcome = provider.generate(imageReq(), cfg());
        await expect(outcome).rejects.toBeInstanceOf(ImageProviderError);
        const error = await outcome.catch((thrown: unknown) => thrown as ImageProviderError);
        expect(error.code).toBe('AUTH');
        expect(error.retryable).toBe(false);
        expect(error.providerId).toBe(providerId);
      });

      it('错误分类：429 拒为 RATE_LIMIT 且可重试', async () => {
        mockFetch([() => jsonResponse({ error: { message: 'rate limited' } }, 429)]);
        const provider = factory();
        const outcome = provider.generate(imageReq(), cfg());
        await expect(outcome).rejects.toBeInstanceOf(ImageProviderError);
        const error = await outcome.catch((thrown: unknown) => thrown as ImageProviderError);
        expect(error.code).toBe('RATE_LIMIT');
        expect(error.retryable).toBe(true);
      });

      it('错误分类：5xx 拒为 PROVIDER 且可重试', async () => {
        mockFetch([() => jsonResponse({ error: { message: 'upstream down' } }, 503)]);
        const provider = factory();
        const outcome = provider.generate(imageReq(), cfg());
        await expect(outcome).rejects.toBeInstanceOf(ImageProviderError);
        const error = await outcome.catch((thrown: unknown) => thrown as ImageProviderError);
        expect(error.code).toBe('PROVIDER');
        expect(error.retryable).toBe(true);
      });

      it('错误分类：网络异常（fetch reject）拒为 NETWORK 且可重试', async () => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => {
            throw new TypeError('fetch failed');
          }),
        );
        const provider = factory();
        const outcome = provider.generate(imageReq(), cfg());
        await expect(outcome).rejects.toBeInstanceOf(ImageProviderError);
        const error = await outcome.catch((thrown: unknown) => thrown as ImageProviderError);
        expect(error.code).toBe('NETWORK');
        expect(error.retryable).toBe(true);
      });
    });
  }
});

describe('openai 家专锁（源管线 image_gen.mjs 先例 + gpt-image-2 第一供应商）', () => {
  it('请求打到 /images/generations，Bearer 鉴权，model 默认 gpt-image-2，size/n 传递', async () => {
    const { captured } = mockFetch([() => jsonResponse({ data: [{ b64_json: PNG_B64 }] })]);
    const provider = createOpenAiProvider();
    await provider.generate(imageReq({ size: '1024x1536', n: 2 }), cfg());

    const request = captured[0];
    expect(request.url.includes('/images/generations')).toBe(true);
    expect(request.headers['authorization']).toBe('Bearer test-key-0123456789abcdef');
    const body = JSON.parse(request.bodyText) as { model: string; prompt: string; size: string; n: number };
    expect(body.model).toBe('gpt-image-2');
    expect(body.prompt).toBe('一个克制的深蓝色科技封面');
    expect(body.size).toBe('1024x1536');
    expect(body.n).toBe(2);
  });

  it('b64_json 与 url 双形态在同一家内均可解析（源脚本行为对齐）', async () => {
    const { captured } = mockFetch([
      () => jsonResponse({ data: [{ b64_json: PNG_B64 }] }),
      () => jsonResponse({ data: [{ url: CDN_URL }] }),
      () => binaryResponse(PNG_MAGIC),
    ]);
    const provider = createOpenAiProvider();

    const fromB64 = await provider.generate(imageReq(), cfg());
    expect(Buffer.compare(fromB64.images[0].buffer, Buffer.from(PNG_MAGIC))).toBe(0);

    const fromUrl = await provider.generate(imageReq(), cfg());
    expect(Buffer.compare(fromUrl.images[0].buffer, Buffer.from(PNG_MAGIC))).toBe(0);
    expect(captured.length).toBe(3);
  });
});
