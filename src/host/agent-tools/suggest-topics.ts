/**
 * wewrite_suggest_topics（M3 / Spec §5 增补第 5 工具，AC-M3-04）：热榜 top-N + 逐条 AI 速览。
 * Spec 裁决：选题交互走「工具 + agent 原生问答」——agent 拿到候选后用自己的问答能力呈现，
 * 用户选定主题再以 wewrite_run 进入管线（不直接调 ctx.userQuestions）。
 */

import type { ToolRunContext, WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
import { asArgsRecord, callView, jsonSchema, resultView, textBlocks, toolError } from './output-helpers';

const COUNT_DEFAULT = 3;
const COUNT_MAX = 5;

interface TopicCandidate {
  readonly title: string;
  readonly source: string;
  readonly digest: string;
}

export function buildSuggestTopicsTool(service: WeWriteService): WewriteToolDefinition {
  return {
    name: 'wewrite_suggest_topics',
    description:
      '从热榜抓取候选选题（默认 3 条，上限 5 条）并逐条生成一句话 AI 速览，供用户挑一个再启动写作管线。'
      + '仅在用户表达「不知道写什么 / 给我推荐选题」类意图时调用；呈现候选后等用户选定，不要擅自直接开跑管线。',
    timeoutMs: 60000,
    parameters: {
      count: { type: 'integer', description: `候选数量 1-${COUNT_MAX}，默认 ${COUNT_DEFAULT}` },
    },
    output: {
      schema: jsonSchema({ ok: { type: 'boolean' }, topics: { type: 'array' }, error: { type: 'object' } }, ['ok', 'topics']),
      render: (_args, value) => {
        const record = asArgsRecord(value);
        if (record.ok === false) {
          const error = record.error as { message?: unknown } | undefined;
          return textBlocks(`获取选题候选失败：${typeof error?.message === 'string' ? error.message : '未知错误'}`);
        }
        return textBlocks(topicsToText(Array.isArray(record.topics) ? record.topics : []).join('\n'));
      },
      presentationMeta: (_args, value) => ({
        tool: 'wewrite_suggest_topics',
        topics: Array.isArray(asArgsRecord(value).topics)
          ? (asArgsRecord(value).topics as unknown[]).map((item) => {
              const record = asArgsRecord(item);
              return {
                title: String(record.title ?? ''),
                source: String(record.source ?? ''),
                digest: String(record.digest ?? ''),
              };
            })
          : [],
      }),
    },
    async execute(args: unknown, _exec: ToolRunContext) {
      const rawCount = asArgsRecord(args).count ?? COUNT_DEFAULT;
      if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount < 1 || rawCount > COUNT_MAX) {
        return toolError('count-invalid', `count 必须是 1-${COUNT_MAX} 的整数（缺省 ${COUNT_DEFAULT}）`);
      }
      let hotspots: unknown[];
      try {
        hotspots = [...(await service.fetchHotspots(rawCount))];
      } catch (error) {
        return toolError('hotspots-failed', `热榜拉取失败：${error instanceof Error ? error.message : String(error)}`);
      }
      const topics: TopicCandidate[] = [];
      for (const item of hotspots.slice(0, rawCount)) {
        const record = asArgsRecord(item);
        topics.push({
          title: String(record.title ?? ''),
          source: String(record.source ?? ''),
          digest: await safeDigest(service, item),
        });
      }
      return { ok: true, topics };
    },
    presentCall: () => callView('execute', '获取热榜选题候选'),
    presentResult: (_args, result) => {
      const meta = asArgsRecord(result.meta);
      const topics = Array.isArray(meta.topics) ? meta.topics : [];
      const lines = topics.length > 0 ? topicsToText(topics) : ['暂无候选，稍后再试或直接指定主题。'];
      return resultView('选题候选', textBlocks(...lines));
    },
  };
}

async function safeDigest(service: WeWriteService, item: unknown): Promise<string> {
  try {
    const record = asArgsRecord(item);
    // 热榜条目即 HotspotDigestItem 所需三键（rank/title/url）——宽收窄后透传
    const digestInput = { rank: Number(record.rank ?? 1), title: String(record.title ?? ''), url: String(record.url ?? '') };
    const digest = await service.digestHotspotItem(digestInput);
    const text = asArgsRecord(digest).digest;
    if (typeof text === 'string' && text) return text;
  } catch {
    // 单条速览失败降级为占位文案——不阻断整批候选（AC-9 同款降级取向）
  }
  return '速览暂不可用，可点击来源自行判断。';
}

function topicsToText(topics: readonly unknown[]): string[] {
  return topics.map((item) => {
    const record = asArgsRecord(item);
    return `【${String(record.source ?? '')}】${String(record.title ?? '')}——${String(record.digest ?? '')}`;
  });
}
