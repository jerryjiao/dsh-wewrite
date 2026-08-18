/**
 * 阿里云百炼（DashScope 文生图）。同步模式：X-DashScope-Synchronous 头。
 * 凭据走 WEWRITE_IMG_DASHSCOPE（Bearer，DashScope 同时接受该形态）。
 */
export declare function createDashscopeProvider(fetchImpl?: typeof fetch): import("./types").ImageProvider;
