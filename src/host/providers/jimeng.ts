/**
 * 即梦（火山方舟上的 SeedEdit/即梦系列）。双凭据形态（access_key_id+secret_key）在
 * ResolvedProviderConfig.extra 携带；单一 Bearer 为主鉴权面。
 */

import { declareProvider } from './transport';

export function createJimengProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'jimeng',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'jimeng-2.1-latest',
    endpoint: () => ({ path: '/images/generations' }),
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(cfg.extra?.accessKeyId ? { 'X-Ark-Access-Key-Id': cfg.extra.accessKeyId } : {}),
    }),
    body: (req, model) => ({
      model,
      prompt: req.prompt,
      size: req.size,
      req_key: 'jimeng_high_aes_general_v21',
      watermark: false,
    }),
  }, fetchImpl);
}
