/**
 * OpenRouter 图片生成（OpenAI 兼容网关聚合）。凭据走 WEWRITE_IMG_OPENROUTER。
 */

import { declareProvider } from './transport';

export function createOpenrouterProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'openrouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-image-2',
    endpoint: () => ({ path: '/images/generations' }),
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    }),
    body: (req, model) => ({
      model,
      prompt: req.prompt,
      size: req.size,
      n: req.n,
    }),
  }, fetchImpl);
}
