/**
 * service 层错误类型：带 code，供 RPC/tools 归一化为结构化失败。
 */
export declare class WewriteServiceError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function toServiceError(error: unknown): WewriteServiceError;
