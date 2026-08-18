/**
 * 供应商共享传输层：POST + 统一响应解析 + 错误分类 + 魔数嗅探。
 * 响应协议统一支持 {data:[{b64_json}]} 与 {data:[{url}]} 双形态（源脚本 image_gen.mjs 先例，
 * QA 契约 §7.2-8）；各家远端形状差异由 adapter 归一到本层。
 * signal 原样透传给 fetch（身份相等，不包装超时控制器）。
 */

import { truncateMessage } from '../redaction';
import { ImageProviderError, type ImageGenRequest, type ImageGenResult, type ImageProvider, type ResolvedProviderConfig } from './types';
import type { ImageProviderId } from '../../shared/image-provider-ids';

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function sniffMime(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return 'image/png';
}

function classifyStatus(status: number): { code: 'AUTH' | 'RATE_LIMIT' | 'PROVIDER'; retryable: boolean } {
  if (status === 401 || status === 403) return { code: 'AUTH', retryable: false };
  if (status === 429) return { code: 'RATE_LIMIT', retryable: true };
  return { code: 'PROVIDER', retryable: true };
}

interface TransportInput {
  readonly providerId: ImageProviderId;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly req: ImageGenRequest;
  /** 响应里的 images[].url 形态需要二次拉取时走 GET。 */
  readonly resultModel: string;
  readonly fetchImpl?: typeof fetch;
}

interface NormalizedItem {
  readonly b64_json?: string;
  readonly url?: string;
}

async function readImageBytes(
  providerId: ImageProviderId,
  url: string,
  req: ImageGenRequest,
  fetchImpl: typeof fetch,
): Promise<{ buffer: Buffer; mime: string }> {
  const response = await fetchImpl(url, { method: 'GET', signal: req.signal });
  if (!response.ok) {
    const { code, retryable } = classifyStatus(response.status);
    throw new ImageProviderError({
      providerId,
      code,
      retryable,
      message: `图片下载返回 HTTP ${response.status}`,
    });
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mime: response.headers.get('content-type')?.split(';')[0] || sniffMime(buffer) };
}

export async function postJsonImages(input: TransportInput): Promise<ImageGenResult> {
  const { providerId, req } = input;
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(input.url, {
      method: 'POST',
      headers: { ...input.headers },
      body: JSON.stringify(input.body),
      signal: req.signal,
    });
  } catch (error) {
    if (req.signal?.aborted) {
      throw new ImageProviderError({ providerId, code: 'TIMEOUT', message: '请求已中止' });
    }
    throw new ImageProviderError({
      providerId,
      code: 'NETWORK',
      message: truncateMessage(error instanceof Error ? error.message : String(error ?? '网络异常')),
    });
  }
  if (!response.ok) {
    const { code, retryable } = classifyStatus(response.status);
    let detail = '';
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      detail = payload?.error?.message ?? '';
    } catch {
      detail = '';
    }
    throw new ImageProviderError({
      providerId,
      code,
      retryable,
      message: truncateMessage(`HTTP ${response.status}${detail ? ` ${detail}` : ''}`),
    });
  }
  const payload = (await response.json()) as { data?: NormalizedItem[] };
  const items = payload?.data;
  if (!Array.isArray(items) || items.length === 0) {
    throw new ImageProviderError({ providerId, code: 'PROVIDER', message: '响应缺少 data 数组或为空' });
  }
  const images = [];
  for (const item of items.slice(0, Math.max(1, req.n))) {
    if (item.b64_json) {
      const buffer = Buffer.from(item.b64_json, 'base64');
      images.push({ buffer, mime: sniffMime(buffer) });
    } else if (item.url) {
      const downloaded = await readImageBytes(providerId, item.url, req, fetchImpl).catch((error) => {
        if (error instanceof ImageProviderError) throw error;
        throw new ImageProviderError({ providerId, code: 'NETWORK', message: String(error) });
      });
      images.push({ buffer: downloaded.buffer, mime: downloaded.mime });
    }
  }
  if (!images.length) {
    throw new ImageProviderError({ providerId, code: 'PROVIDER', message: '响应图片条目既无 b64_json 也无 url' });
  }
  return { images, model: input.resultModel };
}

/** 单家 provider 的声明式定义——9 家实现共用本工厂，差异只在 endpoint/headers/body。 */
export interface ProviderDeclaration {
  readonly id: ImageProviderId;
  readonly defaultBaseUrl: string;
  readonly defaultModel: string;
  endpoint(req: ImageGenRequest, cfg: ResolvedProviderConfig): { path: string; query?: string };
  headers(cfg: ResolvedProviderConfig): Record<string, string>;
  body(req: ImageGenRequest, model: string): Record<string, unknown>;
}

export function declareProvider(declaration: ProviderDeclaration, fetchImpl?: typeof fetch): ImageProvider {
  return {
    id: declaration.id,
    async generate(req, cfg) {
      const model = cfg.model ?? declaration.defaultModel;
      const { path, query } = declaration.endpoint(req, cfg);
      const url = `${joinUrl(cfg.baseUrl ?? declaration.defaultBaseUrl, path)}${query ?? ''}`;
      return postJsonImages({
        providerId: declaration.id,
        url,
        headers: declaration.headers(cfg),
        body: declaration.body(req, model),
        req,
        resultModel: model,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    },
  };
}
