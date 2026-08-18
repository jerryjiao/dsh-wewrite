/**
 * OpenAI Images（gpt-image-2，Jerry 指令第一供应商）。
 * 请求形状按源管线 image_gen.mjs 先例锁定：POST {base}/images/generations、Bearer、
 * model 恒 gpt-image-2（v0.1 锁定；用户配置的 model 只进审计回执不进请求）。
 */

import { declareProvider } from './transport';

export const OPENAI_DEFAULT_MODEL = 'gpt-image-2';

export function createOpenAiProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: OPENAI_DEFAULT_MODEL,
    endpoint: () => ({ path: '/images/generations' }),
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    }),
    body: (req) => ({
      model: OPENAI_DEFAULT_MODEL,
      prompt: req.prompt,
      size: req.size,
      n: req.n,
    }),
  }, fetchImpl);
}
