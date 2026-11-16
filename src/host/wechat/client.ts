/**
 * 微信公众平台 API 客户端（F30 端点族）：
 * token / media/uploadimg / material/add_material / draft add。
 * apiBaseUrl 从 getSettings() 注入并贯穿全部请求（AC-2 无混合路径）；
 * 推送编排原子化（AC-1：draft/add 失败抛错，绝不返回半成品 mediaId）；
 * errcode 分类诊断在 diagnostics.ts（AC-6：40164 特判），超时闸与 token 失效判定在 retry.ts。
 */

import { truncateMessage } from '../redaction';
import {
  classifyErrcode,
  extractExitIp,
  hintForClassification,
  hintForErrcode,
  NETWORK_HINT,
  SYSTEM_HINT,
  TIMEOUT_HINT,
  WeChatApiError,
  type WeChatClassification,
} from './diagnostics';
import { resolveApiBaseUrl } from './egress';
import { DEFAULT_TIMEOUT_MS, fetchWithTimeout, isTokenExpiredError } from './retry';

// WeChatApiError 类本体在 diagnostics.ts（与分类/文案同源，retry.ts 也要用）；
// 这里 re-export 保住 wechat-flow 与 tests 的历史导入面。
export { WeChatApiError };
export type { WeChatClassification };

export interface WeChatCredentials {
  readonly appId: string;
  readonly secret: string;
}

export interface WeChatSettings {
  readonly apiBaseUrl: string;
  readonly author: string;
}

export interface WeChatClientDeps {
  readonly fetchImpl?: typeof fetch;
  readonly getCredentials: () => WeChatCredentials;
  readonly getSettings: () => WeChatSettings;
  readonly now?: () => number;
  /** 单请求超时毫秒数（默认 20s）；测试注入短值避免真等待。 */
  readonly timeoutMs?: number;
}

export interface WeChatBinary {
  readonly buffer: Buffer;
  readonly mime: string;
  readonly filename?: string;
}

export interface PushDraftInput {
  readonly title: string;
  readonly digest: string;
  readonly contentHtml: string;
  readonly thumbImage: WeChatBinary;
  readonly contentImages: readonly WeChatBinary[];
  readonly author?: string;
}

export interface DiagnoseResult {
  readonly reachable: boolean;
  readonly ipWhitelisted?: boolean;
  readonly errcode?: number;
  readonly hint: string;
}

const IMAGE_SRC_RE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)(\2)/gis;

/**
 * 成功结果的联合访问面（tests 契约先例）：调用方 `promise.catch(() => error)` 取
 * 成功类型 | WeChatApiError 联合后直接访问 errcode/classification/message。
 * 这些可选字段在运行时恒不出现，纯类型面。
 */
type SuccessAccess = { readonly errcode?: undefined; readonly classification?: undefined; readonly message?: undefined };
export type WeChatToken = string & SuccessAccess;
export type PushDraftResult = { readonly mediaId: string; readonly thumbMediaId: string } & SuccessAccess;

export function createWeChatClient(deps: WeChatClientDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutSeconds = Math.max(1, Math.round(timeoutMs / 1000));
  let cachedToken: { token: string; expiresAt: number } | null = null;

  function toApiError(errcode: number, errmsg: string | undefined): WeChatApiError {
    const classification = classifyErrcode(errcode);
    const exitIp = classification === 'IP_WHITELIST' ? extractExitIp(errmsg ?? '') : undefined;
    // errcode 专属文案优先（如 42001 的「已自动重试」），没有再落分类通用文案。
    const hint = hintForErrcode(errcode) ?? hintForClassification(classification, exitIp);
    return new WeChatApiError(
      errcode,
      classification,
      hint,
      truncateMessage(`微信 API 错误 ${errcode}：${errmsg ?? '未知错误'}`),
    );
  }

  async function callJson(path: string, query: Record<string, string>, init?: RequestInit): Promise<Record<string, unknown>> {
    const base = resolveApiBaseUrl(deps.getSettings().apiBaseUrl);
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await fetchWithTimeout(fetchImpl, url.toString(), init ?? {}, timeoutMs);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new WeChatApiError(-1, 'TIMEOUT', TIMEOUT_HINT, `微信接口 ${timeoutSeconds} 秒无响应，已中止`);
      }
      throw new WeChatApiError(
        -2,
        'NETWORK',
        NETWORK_HINT,
        `微信 API 网络请求失败：${error instanceof Error ? error.message : String(error ?? '未知错误')}`,
      );
    }
    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // 微信直连恒回 JSON；解析炸了多半是代理/网关把响应换成了 HTML——
      // 裸抛会给用户看 "Unexpected token '<'"，这里转成可读的系统类错误。
      throw new WeChatApiError(-1, 'SYSTEM', SYSTEM_HINT, '微信返回了非 JSON 响应（可能被代理/网关拦截）');
    }
    const errcode = typeof data.errcode === 'number' ? data.errcode : 0;
    if (errcode !== 0) throw toApiError(errcode, typeof data.errmsg === 'string' ? data.errmsg : undefined);
    return data;
  }

  async function fetchAccessToken(): Promise<WeChatToken> {
    if (cachedToken && now() < cachedToken.expiresAt) return cachedToken.token;
    const { appId, secret } = deps.getCredentials();
    const data = await callJson('/cgi-bin/token', {
      grant_type: 'client_credential',
      appid: appId,
      secret,
    });
    const token = data.access_token;
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 0;
    if (typeof token !== 'string' || !token) {
      throw new WeChatApiError(-1, 'SYSTEM', 'token 响应未包含 access_token', '微信 token 响应未包含 access_token');
    }
    cachedToken = { token, expiresAt: now() + expiresIn * 1000 };
    return token;
  }

  function multipart(image: WeChatBinary, field = 'media'): FormData {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(image.buffer)], { type: image.mime });
    form.append(field, blob, image.filename ?? `wewrite-${field}.${image.mime.split('/')[1] ?? 'png'}`);
    return form;
  }

  /**
   * token 失效自救：端点回 42001/40001 时清缓存、重新取 token、原请求重发一次，仍失败才上抛。
   * token 本身获取失败不进这个闸（快速失败）——凭据真错时重试只是白打一次网络。
   */
  async function withFreshTokenRetry<T>(attempt: (token: string) => Promise<T>): Promise<T> {
    const token = await fetchAccessToken();
    try {
      return await attempt(token);
    } catch (error) {
      if (!isTokenExpiredError(error)) throw error;
      cachedToken = null;
      return attempt(await fetchAccessToken());
    }
  }

  async function uploadContentImage(image: WeChatBinary): Promise<string> {
    return withFreshTokenRetry(async (token) => {
      const data = await callJson('/cgi-bin/media/uploadimg', { access_token: token }, {
        method: 'POST',
        body: multipart(image),
      });
      if (typeof data.url !== 'string' || !data.url) {
        throw new WeChatApiError(-1, 'SYSTEM', 'uploadimg 响应未包含 CDN URL', '微信 uploadimg 响应未包含 CDN URL');
      }
      return data.url;
    });
  }

  async function uploadThumbMaterial(image: WeChatBinary): Promise<string> {
    return withFreshTokenRetry(async (token) => {
      const data = await callJson('/cgi-bin/material/add_material', { access_token: token, type: 'image' }, {
        method: 'POST',
        body: multipart(image),
      });
      if (typeof data.media_id !== 'string' || !data.media_id) {
        throw new WeChatApiError(-1, 'SYSTEM', 'add_material 响应未包含 media_id', '微信 add_material 响应未包含 media_id');
      }
      return data.media_id;
    });
  }

  async function addDraft(input: {
    title: string;
    digest: string;
    author: string;
    contentHtml: string;
    thumbMediaId: string;
    contentImageUrls?: readonly string[];
  }): Promise<string> {
    return withFreshTokenRetry(async (token) => {
      const data = await callJson('/cgi-bin/draft/add', { access_token: token }, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          articles: [
            {
              title: input.title,
              author: input.author,
              digest: input.digest,
              content: input.contentHtml,
              thumb_media_id: input.thumbMediaId,
              show_cover_pic: 0,
            },
          ],
        }),
      });
      if (typeof data.media_id !== 'string' || !data.media_id) {
        throw new WeChatApiError(-1, 'SYSTEM', 'draft/add 响应未包含 media_id', '微信 draft/add 响应未包含 media_id');
      }
      return data.media_id;
    });
  }

  function replaceImageSources(html: string, uploadedUrls: readonly string[]): string {
    let index = 0;
    return html.replace(IMAGE_SRC_RE, (whole, prefix: string, quote: string, _source: string) => {
      if (index >= uploadedUrls.length) return whole;
      const replacement = uploadedUrls[index];
      index += 1;
      return `${prefix}${quote}${replacement}${quote}`;
    });
  }

  async function pushDraft(input: PushDraftInput): Promise<PushDraftResult> {
    // 正文图先传 CDN 拿微信 URL（token 失效重试由 uploadContentImage 自理），
    // 再把本地 src 换成微信 URL；封面素材与草稿创建同链路，任一步失败即中止（AC-1）。
    const uploadedUrls: string[] = [];
    for (const image of input.contentImages) {
      uploadedUrls.push(await uploadContentImage(image));
    }
    const thumbMediaId = await uploadThumbMaterial(input.thumbImage);
    const finalHtml = replaceImageSources(input.contentHtml, uploadedUrls);
    const mediaId = await addDraft({
      title: input.title,
      digest: input.digest,
      author: input.author ?? deps.getSettings().author,
      contentHtml: finalHtml,
      thumbMediaId,
      contentImageUrls: uploadedUrls,
    });
    return { mediaId, thumbMediaId };
  }

  async function diagnose(): Promise<DiagnoseResult> {
    try {
      await fetchAccessToken();
      return { reachable: true, ipWhitelisted: true, hint: '微信 API 连接正常，当前出口 IP 已在白名单。' };
    } catch (error) {
      if (error instanceof WeChatApiError) {
        if (error.classification === 'NETWORK') {
          return { reachable: false, hint: error.hint ?? NETWORK_HINT };
        }
        if (error.classification === 'IP_WHITELIST') {
          return {
            reachable: true,
            ipWhitelisted: false,
            errcode: error.errcode,
            hint: hintForClassification('IP_WHITELIST', extractExitIp(error.message)),
          };
        }
        return {
          reachable: true,
          errcode: error.errcode,
          hint: error.hint ?? hintForClassification(error.classification),
        };
      }
      return { reachable: false, hint: NETWORK_HINT };
    }
  }

  return {
    fetchAccessToken,
    uploadContentImage,
    uploadThumbMaterial,
    addDraft,
    pushDraft,
    diagnose,
  };
}
