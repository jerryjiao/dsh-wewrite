/**
 * 图片步装配（F7 / AC-9）：providers fallback 链 + ImageRecord 产线。
 * 从 service 拆出（单文件 <=300 行纪律）；凭据经注入的 resolver 读取（ADR-006）。
 */

import { randomUUID } from 'node:crypto';
import { CREDENTIAL_REFS, DEFAULT_IMAGE_PROVIDER_CHAIN, IMAGE_PROVIDER_IDS, type ImageProviderId } from '../shared/image-provider-ids';
import type { ImageProviderConfig } from '../shared/contract';
import type { ImageRecord, SettingsRecord } from './domain';
import type { ImagesGenerator } from './pipeline/engine';
import { runImageFallback } from './providers/registry';
import type { ImageGenRequest, ImageProvider, ResolvedProviderConfig } from './providers/types';
import { createAzureOpenAiProvider } from './providers/azure-openai';
import { createDoubaoProvider } from './providers/doubao';
import { createDashscopeProvider } from './providers/dashscope';
import { createGeminiProvider } from './providers/gemini';
import { createJimengProvider } from './providers/jimeng';
import { createMinimaxProvider } from './providers/minimax';
import { createOpenAiProvider } from './providers/openai';
import { createOpenrouterProvider } from './providers/openrouter';
import { createReplicateProvider } from './providers/replicate';

export const PROVIDER_FACTORIES: Readonly<Record<ImageProviderId, (fetchImpl?: typeof fetch) => ImageProvider>> = {
  openai: createOpenAiProvider,
  doubao: createDoubaoProvider,
  dashscope: createDashscopeProvider,
  jimeng: createJimengProvider,
  minimax: createMinimaxProvider,
  azure_openai: createAzureOpenAiProvider,
  gemini: createGeminiProvider,
  openrouter: createOpenrouterProvider,
  replicate: createReplicateProvider,
};

export interface ImagesGeneratorDeps {
  readonly getSettings: () => SettingsRecord;
  readonly resolveCredential: (ref: string) => Promise<string | undefined>;
  readonly now: () => Date;
  readonly persist: (records: readonly ImageRecord[]) => Promise<void>;
  /** 传输层注入（测试路由 / 出口代理），缺省走全局 fetch。 */
  readonly fetchImpl?: typeof fetch;
}

export function createImagesGenerator(deps: ImagesGeneratorDeps): ImagesGenerator {
  return {
    generate: async ({ count, articleId }) => {
      const settings = deps.getSettings();
      const chain = settings.imageProviders.length
        ? settings.imageProviders
        : DEFAULT_IMAGE_PROVIDER_CHAIN.map((providerId): ImageProviderConfig => ({
            providerId,
            credentialRef: CREDENTIAL_REFS.image(providerId),
          }));
      const keys = await Promise.all(
        chain.map(async (entry) => String((await deps.resolveCredential(entry.credentialRef)) ?? '')),
      );
      const configs = new Map<ImageProviderId, ResolvedProviderConfig>(
        chain.map((entry, index) => [
          entry.providerId,
          {
            apiKey: keys[index],
            ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
            ...(entry.model ? { model: entry.model } : {}),
          },
        ]),
      );
      const providers = chain
        .filter((entry) => (IMAGE_PROVIDER_IDS as readonly string[]).includes(entry.providerId))
        .map((entry) => PROVIDER_FACTORIES[entry.providerId](deps.fetchImpl));
      const resolveConfig = (providerId: ImageProviderId): ResolvedProviderConfig =>
        configs.get(providerId) ?? { apiKey: '' };

      const make = async (prompt: string): Promise<ImageRecord> => {
        const req: ImageGenRequest = { prompt, size: settings.defaultImageSize, n: 1 };
        const outcome = await runImageFallback(providers, resolveConfig, req);
        const image = outcome.result.images[0];
        return {
          v: 1,
          id: `img_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
          // P0-1：真实文章 id 溯源（render 步落库后回传；无绑定场景兜底占位）
          articleId: articleId ?? 'pending',
          kind: 'body',
          mime: image?.mime ?? 'image/png',
          base64: (image?.buffer ?? Buffer.alloc(0)).toString('base64'),
          provider: outcome.providerId,
          model: outcome.result.model,
          prompt,
          createdAt: deps.now().toISOString(),
        };
      };

      const cover = await make('为文章生成封面图：风格克制、信息密度高，深色纯色背景，无文字水印');
      const bodies: ImageRecord[] = [];
      for (let index = 0; index < count; index += 1) {
        bodies.push(await make(`正文配图 ${index + 1}：克制的信息图风格，单主题，无文字水印`));
      }
      const stored = [{ ...cover, kind: 'cover' as const }, ...bodies];
      await deps.persist(stored);
      return { coverImageId: stored[0].id, bodyImageIds: bodies.map((record) => record.id) };
    },
  };
}
