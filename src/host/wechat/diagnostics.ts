/**
 * 微信 API 错误分类与诊断文案（AC-6：errcode 40164 特判 + 两条出路指引）。
 * 分类面：IP_WHITELIST / AUTH / RATE_LIMIT / SYSTEM / NETWORK / UNKNOWN。
 */

export type WeChatClassification = 'IP_WHITELIST' | 'AUTH' | 'RATE_LIMIT' | 'SYSTEM' | 'NETWORK' | 'UNKNOWN';

const AUTH_ERRCODES = new Set([40001, 40002, 40013, 40125, 41001, 41002, 41004, 42001]);
const RATE_LIMIT_ERRCODES = new Set([45009, 45011, 48001]);

export function classifyErrcode(errcode: number): WeChatClassification {
  if (errcode === 40164) return 'IP_WHITELIST';
  if (AUTH_ERRCODES.has(errcode)) return 'AUTH';
  if (RATE_LIMIT_ERRCODES.has(errcode)) return 'RATE_LIMIT';
  if (errcode === -1 || errcode >= 500) return 'SYSTEM';
  return 'UNKNOWN';
}

/** 从 errmsg 中提取微信回显的出口 IP（'invalid ip 203.0.113.7 ipv6 ...' 形态）。 */
export function extractExitIp(errmsg: string): string | undefined {
  const match = errmsg.match(/invalid ip ([0-9a-fA-F.]+)/);
  return match?.[1];
}

/** 40164 两条出路文案（AC-6：出口 IP + 白名单 + 代理 必须可检索）。 */
export function ipWhitelistHint(exitIp: string | undefined): string {
  const ip = exitIp ?? '（见 errmsg 回显）';
  return [
    `出口 IP ${ip} 不在公众号白名单。`,
    '两条出路任选其一：',
    '一、登录公众号后台，在「设置与开发-基本配置-IP 白名单」中加入该出口 IP；',
    '二、配置代理：把设置里的 wechatApiBaseUrl 指向自建 relay（固定出口 IP 的反代），并把 relay 服务器 IP 加入白名单。',
  ].join('');
}

export const AUTH_HINT = '微信拒绝了凭据：请核对设置页的 AppID 与 Secret（Secret 只写本地 credentials，保存后回显掩码）。';
export const RATE_LIMIT_HINT = '触发微信接口调用频率限制：请稍后重试，或降低自动推送频率。';
export const SYSTEM_HINT = '微信服务端繁忙（errcode 属系统类）：稍后重试；持续出现请到微信开放社区核实服务状态。';
export const NETWORK_HINT = '无法连接微信服务器：请检查本机网络，以及设置里的 wechatApiBaseUrl（自定义代理地址）是否可达。';
export const UNKNOWN_HINT = '微信返回未分类错误码：请把 errcode 与 errmsg 提交给插件 issue 排查。';

export function hintForClassification(classification: WeChatClassification, exitIp?: string): string {
  switch (classification) {
    case 'IP_WHITELIST':
      return ipWhitelistHint(exitIp);
    case 'AUTH':
      return AUTH_HINT;
    case 'RATE_LIMIT':
      return RATE_LIMIT_HINT;
    case 'SYSTEM':
      return SYSTEM_HINT;
    case 'NETWORK':
      return NETWORK_HINT;
    default:
      return UNKNOWN_HINT;
  }
}
