/**
 * 微信 API 错误分类与诊断文案（AC-6：errcode 40164 特判 + 两条出路指引）。
 * 分类面：IP_WHITELIST / AUTH / RATE_LIMIT / SYSTEM / NETWORK / UNKNOWN。
 */
export type WeChatClassification = 'IP_WHITELIST' | 'AUTH' | 'RATE_LIMIT' | 'SYSTEM' | 'NETWORK' | 'UNKNOWN';
export declare function classifyErrcode(errcode: number): WeChatClassification;
/** 从 errmsg 中提取微信回显的出口 IP（'invalid ip 203.0.113.7 ipv6 ...' 形态）。 */
export declare function extractExitIp(errmsg: string): string | undefined;
/** 40164 两条出路文案（AC-6：出口 IP + 白名单 + 代理 必须可检索）。 */
export declare function ipWhitelistHint(exitIp: string | undefined): string;
export declare const AUTH_HINT = "\u5FAE\u4FE1\u62D2\u7EDD\u4E86\u51ED\u636E\uFF1A\u8BF7\u6838\u5BF9\u8BBE\u7F6E\u9875\u7684 AppID \u4E0E Secret\uFF08Secret \u53EA\u5199\u672C\u5730 credentials\uFF0C\u4FDD\u5B58\u540E\u56DE\u663E\u63A9\u7801\uFF09\u3002";
export declare const RATE_LIMIT_HINT = "\u89E6\u53D1\u5FAE\u4FE1\u63A5\u53E3\u8C03\u7528\u9891\u7387\u9650\u5236\uFF1A\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF0C\u6216\u964D\u4F4E\u81EA\u52A8\u63A8\u9001\u9891\u7387\u3002";
export declare const SYSTEM_HINT = "\u5FAE\u4FE1\u670D\u52A1\u7AEF\u7E41\u5FD9\uFF08errcode \u5C5E\u7CFB\u7EDF\u7C7B\uFF09\uFF1A\u7A0D\u540E\u91CD\u8BD5\uFF1B\u6301\u7EED\u51FA\u73B0\u8BF7\u5230\u5FAE\u4FE1\u5F00\u653E\u793E\u533A\u6838\u5B9E\u670D\u52A1\u72B6\u6001\u3002";
export declare const NETWORK_HINT = "\u65E0\u6CD5\u8FDE\u63A5\u5FAE\u4FE1\u670D\u52A1\u5668\uFF1A\u8BF7\u68C0\u67E5\u672C\u673A\u7F51\u7EDC\uFF0C\u4EE5\u53CA\u8BBE\u7F6E\u91CC\u7684 wechatApiBaseUrl\uFF08\u81EA\u5B9A\u4E49\u4EE3\u7406\u5730\u5740\uFF09\u662F\u5426\u53EF\u8FBE\u3002";
export declare const UNKNOWN_HINT = "\u5FAE\u4FE1\u8FD4\u56DE\u672A\u5206\u7C7B\u9519\u8BEF\u7801\uFF1A\u8BF7\u628A errcode \u4E0E errmsg \u63D0\u4EA4\u7ED9\u63D2\u4EF6 issue \u6392\u67E5\u3002";
export declare function hintForClassification(classification: WeChatClassification, exitIp?: string): string;
