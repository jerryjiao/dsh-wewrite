/**
 * 微信 API 错误分类与诊断文案（AC-6：errcode 40164 特判 + 两条出路指引）。
 * 分类枚举的唯一真源是 shared 的 WECHAT_FAILURE_CLASSES——这里只做
 * 「errcode → 分类 → 文案」的映射，不私自扩枚举值：类型直接从常量推导，
 * 值集合编译期对齐，host 算出的分类才可能被 client 文案层（describePushFailure）认领。
 */
import { WECHAT_FAILURE_CLASSES } from '../../shared/schema-base';

/** 分类类型从 shared 常量推导（IP_WHITELIST/AUTH/PERMISSION/RATE_LIMIT/SYSTEM/TIMEOUT/NETWORK/UNKNOWN）。 */
export type WeChatClassification = (typeof WECHAT_FAILURE_CLASSES)[number];

/** 微信 API 错误：errcode + 分类 + 出路文案随异常一起走完 RPC，到界面才不丢。 */
export class WeChatApiError extends Error {
  readonly errcode: number;
  readonly classification: WeChatClassification;
  readonly hint?: string;

  constructor(errcode: number, classification: WeChatClassification, hint?: string, message?: string) {
    super(message ?? `微信 API 错误 ${errcode}`);
    this.name = 'WeChatApiError';
    this.errcode = errcode;
    this.classification = classification;
    this.hint = hint;
  }
}

const AUTH_ERRCODES = new Set([40001, 40002, 40013, 40125, 41001, 41002, 41004, 42001]);
/** 48001（api unauthorized）是权限问题不是限频：未认证订阅号/测试号没有草稿箱等 API 权限。 */
const PERMISSION_ERRCODES = new Set([48001]);
const RATE_LIMIT_ERRCODES = new Set([45009, 45011]);

export function classifyErrcode(errcode: number): WeChatClassification {
  if (errcode === 40164) return 'IP_WHITELIST';
  if (PERMISSION_ERRCODES.has(errcode)) return 'PERMISSION';
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
export const PERMISSION_HINT =
  '你的公众号类型没有草稿箱权限：未认证的订阅号/测试号没有草稿箱 API 权限。去 mp.weixin.qq.com 认证，或换已认证的号再推。';
export const RATE_LIMIT_HINT = '触发微信接口调用频率限制：请稍后重试，或降低自动推送频率。';
export const SYSTEM_HINT = '微信服务端繁忙（errcode 属系统类）：稍后重试；持续出现请到微信开放社区核实服务状态。';
export const TIMEOUT_HINT = '微信接口响应超时：请检查本机网络与代理（wechatApiBaseUrl）是否可达，稍后重试。';
export const NETWORK_HINT = '无法连接微信服务器：请检查本机网络，以及设置里的 wechatApiBaseUrl（自定义代理地址）是否可达。';
export const UNKNOWN_HINT = '微信返回未分类错误码：请把 errcode 与 errmsg 提交给插件 issue 排查。';

/**
 * errcode 专属文案，优先于分类文案：42001（access_token 过期）会被 client
 * 清缓存换 token 自动重试一次，重试也救不回来才落到用户眼前——文案要说清这件事，
 * 免得用户拿着「凭据错误」的旧话术去重填一个没坏的 Secret。
 */
const ERRCODE_HINTS = new Map<number, string>([[42001, '登录态过期，已自动重试；仍失败请重新连接测试。']]);

export function hintForErrcode(errcode: number): string | undefined {
  return ERRCODE_HINTS.get(errcode);
}

export function hintForClassification(classification: WeChatClassification, exitIp?: string): string {
  switch (classification) {
    case 'IP_WHITELIST':
      return ipWhitelistHint(exitIp);
    case 'AUTH':
      return AUTH_HINT;
    case 'PERMISSION':
      return PERMISSION_HINT;
    case 'RATE_LIMIT':
      return RATE_LIMIT_HINT;
    case 'SYSTEM':
      return SYSTEM_HINT;
    case 'TIMEOUT':
      return TIMEOUT_HINT;
    case 'NETWORK':
      return NETWORK_HINT;
    default:
      return UNKNOWN_HINT;
  }
}
