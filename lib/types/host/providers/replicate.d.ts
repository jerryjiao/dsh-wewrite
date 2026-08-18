/**
 * Replicate 模型推理（models/{owner}/{name}/predictions 形态）。
 * cfg.model 即 owner/name 路径（如 black-forest-labs/flux-schnell）。
 */
export declare function createReplicateProvider(fetchImpl?: typeof fetch): import("./types").ImageProvider;
