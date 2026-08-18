/**
 * Google Gemini 图像生成（predict 形态）。鉴权走 x-goog-api-key 头。
 */

import { declareProvider } from './transport';

export function createGeminiProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-flash-image',
    endpoint: (req, cfg) => {
      const model = cfg.model ?? 'gemini-2.5-flash-image';
      return { path: `/v1beta/models/${model}:predict` };
    },
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': cfg.apiKey,
      Authorization: `Bearer ${cfg.apiKey}`,
    }),
    body: (req) => ({
      instances: [{ prompt: req.prompt }],
      parameters: { sampleCount: req.n, imageConfig: { imageSize: req.size } },
    }),
  }, fetchImpl);
}
