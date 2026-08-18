/**
 * 微信出口模式（ADR-007）：direct（用户 IP 已在白名单）| proxy（自托管 relay base URL）。
 * apiBaseUrl 是唯一出口缝——AC-2 要求全部微信调用统一走该 URL，无混合直连路径。
 */

export const DIRECT_WECHAT_API_BASE = 'https://api.weixin.qq.com';

export type EgressMode = 'direct' | 'proxy';

/** 归一化 base URL：剥尾斜线；空值回落官方直连；非 http(s) 拒收。 */
export function resolveApiBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return DIRECT_WECHAT_API_BASE;
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`微信 API base URL 必须是 http(s) 地址：${trimmed}`);
  }
  return trimmed;
}

export function egressMode(baseUrl: string): EgressMode {
  const normalized = baseUrl.replace(/\/+$/, '').toLowerCase();
  return normalized === DIRECT_WECHAT_API_BASE ? 'direct' : 'proxy';
}

export interface EgressInfo {
  readonly mode: EgressMode;
  readonly baseUrl: string;
}

export function describeEgress(raw: string | undefined): EgressInfo {
  const baseUrl = resolveApiBaseUrl(raw);
  return { mode: egressMode(baseUrl), baseUrl };
}
