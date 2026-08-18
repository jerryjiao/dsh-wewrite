/**
 * 豆包（火山方舟 Ark 图片生成，OpenAI 兼容网关）。
 * 凭据走 WEWRITE_IMG_DOUBAO（Bearer）；可选 baseUrl 指向 Ark 网关或兼容中转。
 */
export declare function createDoubaoProvider(fetchImpl?: typeof fetch): import("./types").ImageProvider;
