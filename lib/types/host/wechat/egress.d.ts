/**
 * 微信出口模式（ADR-007）：direct（用户 IP 已在白名单）| proxy（自托管 relay base URL）。
 * apiBaseUrl 是唯一出口缝——AC-2 要求全部微信调用统一走该 URL，无混合直连路径。
 */
export declare const DIRECT_WECHAT_API_BASE = "https://api.weixin.qq.com";
export type EgressMode = 'direct' | 'proxy';
/** 归一化 base URL：剥尾斜线；空值回落官方直连；非 http(s) 拒收。 */
export declare function resolveApiBaseUrl(raw: string | undefined): string;
export declare function egressMode(baseUrl: string): EgressMode;
export interface EgressInfo {
    readonly mode: EgressMode;
    readonly baseUrl: string;
}
export declare function describeEgress(raw: string | undefined): EgressInfo;
