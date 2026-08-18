/**
 * Azure OpenAI Images：deployment 形态（extra.deployment 或 model 名即 deployment）。
 * 鉴权双面：api-key 头 + Bearer（兼容 Azure AI 服务网关两种模式）。
 */

import { declareProvider } from './transport';

const API_VERSION = '2024-10-21';

export function createAzureOpenAiProvider(fetchImpl?: typeof fetch) {
  return declareProvider({
    id: 'azure_openai',
    defaultBaseUrl: 'https://your-resource.openai.azure.com',
    defaultModel: 'gpt-image-2',
    endpoint: (req, cfg) => {
      const deployment = cfg.extra?.deployment ?? cfg.model ?? 'gpt-image-2';
      return { path: `/openai/deployments/${deployment}/images/generations`, query: `?api-version=${API_VERSION}` };
    },
    headers: (cfg) => ({
      'Content-Type': 'application/json',
      'api-key': cfg.apiKey,
      Authorization: `Bearer ${cfg.apiKey}`,
    }),
    body: (req) => ({
      prompt: req.prompt,
      size: req.size,
      n: req.n,
    }),
  }, fetchImpl);
}
