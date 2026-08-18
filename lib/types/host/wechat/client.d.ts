/**
 * 微信公众平台 API 客户端（F30 端点族）：
 * token / media/uploadimg / material/add_material / draft add。
 * apiBaseUrl 从 getSettings() 注入并贯穿全部请求（AC-2 无混合路径）；
 * 推送编排原子化（AC-1：draft/add 失败抛错，绝不返回半成品 mediaId）；
 * errcode 分类诊断在 diagnostics.ts（AC-6：40164 特判）。
 */
import { type WeChatClassification } from './diagnostics';
export declare class WeChatApiError extends Error {
    readonly errcode: number;
    readonly classification: WeChatClassification;
    readonly hint?: string;
    constructor(errcode: number, classification: WeChatClassification, hint?: string, message?: string);
}
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
/**
 * 成功结果的联合访问面（tests 契约先例）：调用方 `promise.catch(() => error)` 取
 * 成功类型 | WeChatApiError 联合后直接访问 errcode/classification/message。
 * 这些可选字段在运行时恒不出现，纯类型面。
 */
type SuccessAccess = {
    readonly errcode?: undefined;
    readonly classification?: undefined;
    readonly message?: undefined;
};
export type WeChatToken = string & SuccessAccess;
export type PushDraftResult = {
    readonly mediaId: string;
    readonly thumbMediaId: string;
} & SuccessAccess;
export declare function createWeChatClient(deps: WeChatClientDeps): {
    fetchAccessToken: () => Promise<WeChatToken>;
    uploadContentImage: (image: WeChatBinary) => Promise<string>;
    uploadThumbMaterial: (image: WeChatBinary) => Promise<string>;
    addDraft: (input: {
        title: string;
        digest: string;
        author: string;
        contentHtml: string;
        thumbMediaId: string;
        contentImageUrls?: readonly string[];
    }) => Promise<string>;
    pushDraft: (input: PushDraftInput) => Promise<PushDraftResult>;
    diagnose: () => Promise<DiagnoseResult>;
};
export {};
