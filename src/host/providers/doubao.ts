/**
 * 豆包（火山方舟 Ark 图片生成，OpenAI 兼容网关）。
 * 凭据走 WEWRITE_IMG_DOUBAO（Bearer）；可选 baseUrl 指向 Ark 网关或兼容中转。
 */

import { declareProvider } from './transport';

export function createDoubaoProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'doubao',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seedream-4-0-250828',
    endpoint: () => ({ path: '/images/generations' }),
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    }),
    body: (req, model) => ({
      model,
      prompt: req.prompt,
      size: req.size,
      response_format: 'b64_json',
      watermark: false,
    }),
  }, fetchImpl);
}
