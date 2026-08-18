/**
 * Azure OpenAI Images：deployment 形态（extra.deployment 或 model 名即 deployment）。
 * 鉴权双面：api-key 头 + Bearer（兼容 Azure AI 服务网关两种模式）。
 */
export declare function createAzureOpenAiProvider(fetchImpl?: typeof fetch): import("./types").ImageProvider;
