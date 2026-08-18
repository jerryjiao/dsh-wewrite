/**
 * Replicate 模型推理（models/{owner}/{name}/predictions 形态）。
 * cfg.model 即 owner/name 路径（如 black-forest-labs/flux-schnell）。
 */

import { declareProvider } from './transport';

export function createReplicateProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'replicate',
    defaultBaseUrl: 'https://api.replicate.com',
    defaultModel: 'black-forest-labs/flux-schnell',
    endpoint: (req, cfg) => {
      const modelPath = (cfg.model ?? 'black-forest-labs/flux-schnell').replace(/^\/+/, '');
      return { path: `/v1/models/${modelPath}/predictions` };
    },
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      Prefer: 'wait',
    }),
    body: (req) => ({
      input: { prompt: req.prompt, image_size: req.size },
    }),
  }, fetchImpl);
}
