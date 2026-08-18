/**
 * MiniMax 海螺图片生成。凭据走 WEWRITE_IMG_MINIMAX（Bearer）。
 */

import { declareProvider } from './transport';

export function createMinimaxProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'minimax',
    defaultBaseUrl: 'https://api.minimax.chat',
    defaultModel: 'image-01',
    endpoint: () => ({ path: '/v1/image/generation' }),
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    }),
    body: (req, model) => ({
      model,
      prompt: req.prompt,
      aspect_ratio: req.size,
      response_format: 'b64_json',
    }),
  }, fetchImpl);
}
