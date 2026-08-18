/**
 * 阿里云百炼（DashScope 文生图）。同步模式：X-DashScope-Synchronous 头。
 * 凭据走 WEWRITE_IMG_DASHSCOPE（Bearer，DashScope 同时接受该形态）。
 */

import { declareProvider } from './transport';

export function createDashscopeProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'dashscope',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com',
    defaultModel: 'wanx2.1-t2i-turbo',
    endpoint: () => ({ path: '/services/aigc/text2image/image-synthesis', query: '?action=generate' }),
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      'X-DashScope-Synchronous': 'true',
    }),
    body: (req, model) => ({
      model,
      input: { prompt: req.prompt },
      parameters: { size: `${req.size.split('x')[0]}*${req.size.split('x')[1]}`, n: req.n },
    }),
  }, fetchImpl);
}
