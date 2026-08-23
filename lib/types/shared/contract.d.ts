/**
 * RPC 契约（Spec §5 / 架构 §6）：22 端点的 request/response zod schema。
 * client 与 host 之间的唯一契约载体——双端共用，payload/response 全过校验。
 * 端点集合与形状由 tests/shared/contract.test.ts 钉定，禁漂移。
 * 分层：schema-base（基础形状）→ view-schemas（视图投影）→ 本文件（端点表 + 汇总再导出）。
 */
import { z } from 'zod';
export * from './schema-base';
export * from './view-schemas';
export declare const RPC_CHANNEL = "/dsh-wewrite";
export declare const RPC_AUTHORITY = "loopback";
export declare const CONTRACT_VERSION = 1;
export declare const RPC_ENDPOINTS: readonly ["snapshot", "hotspots/fetch", "hotspots/digestItem", "article/list", "article/get", "article/save", "article/delete", "article/preview", "article/rewrite", "run/start", "run/cancel", "schedule/save", "schedule/delete", "schedule/toggle", "schedule/runNow", "config/get", "config/set", "credentials/set", "credentials/describe", "llm/options", "wechat/pushDraft", "wechat/diagnose"];
export type RpcEndpoint = (typeof RPC_ENDPOINTS)[number];
export declare const rpcContract: Record<string, {
    readonly request: z.ZodType;
    readonly response: z.ZodType;
}>;
export type RpcContract = typeof rpcContract;
export type RpcEndpointSchemas = {
    readonly request: z.ZodType;
    readonly response: z.ZodType;
};
