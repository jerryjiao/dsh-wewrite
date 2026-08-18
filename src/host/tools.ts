/**
 * Agent 交互工具（架构 §3：可选交互面，默认关——settings.agentToolsEnabled）。
 * 注册形状对齐参照插件先例（agent.ctx.tools.register({name, description, parameters, execute})）。
 * 装配全程 try/catch：槽位/服务缺失降级 console 警告，不影响宿主（§9.1）。
 */

import type { AgentScope, HostContext } from './platform';
import type { WeWriteService } from './service';

export interface ToolRegistrationOptions {
  readonly enabled: boolean;
}

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

function buildDefinitions(service: WeWriteService): ToolDefinition[] {
  return [
    {
      name: 'wewrite_run',
      description:
        '运行一次 WeWrite 写作管线（选题到大稿，经质量门禁与排版）。返回 runId，进度与产物经 Web 工作台或 snapshot 查看。',
      parameters: {
        topic: { type: 'string', required: true, description: '文章主题（固定选题模式）' },
        image_count: { type: 'integer', description: '正文配图数量，0-10，默认 0' },
      },
      async execute(args) {
        const topic = String(args.topic ?? '');
        if (!topic) return { ok: false, code: 'topic-required', message: '缺少 topic 参数' };
        const rawCount = Number(args.image_count ?? 0);
        const imageCount = Number.isInteger(rawCount) ? Math.min(10, Math.max(0, rawCount)) : 0;
        const { runId } = service.startRun({ trigger: 'manual', params: { topicMode: 'fixed', topic, imageCount } });
        return { ok: true, runId };
      },
    },
    {
      name: 'wewrite_push_draft',
      description:
        '把一篇已过门禁的文章推送到微信公众号草稿箱（只进草稿箱，不群发）。需要文章已完成渲染且绑定封面。',
      parameters: {
        article_id: { type: 'string', required: true, description: '文章 ID（article/list 可查）' },
      },
      async execute(args) {
        const articleId = String(args.article_id ?? '');
        if (!articleId) return { ok: false, code: 'article-required', message: '缺少 article_id 参数' };
        try {
          const result = await service.pushArticleDraft(articleId);
          return { ok: true, mediaId: result.mediaId, thumbMediaId: result.thumbMediaId };
        } catch (error) {
          return {
            ok: false,
            code: 'push-failed',
            message: error instanceof Error ? error.message : String(error ?? '未知错误'),
          };
        }
      },
    },
  ];
}

/** 向根 Agent 作用域安装工具；返回 disposer 列表（入口 apply 统一回收）。 */
export function registerWewriteTools(ctx: HostContext, service: WeWriteService, options: ToolRegistrationOptions): Array<() => void> {
  if (!options.enabled) return [];
  const disposers: Array<() => void> = [];
  const mount = (agent: AgentScope): void => {
    try {
      for (const definition of buildDefinitions(service)) {
        const stop = agent.ctx.tools.register(definition);
        if (typeof stop === 'function') disposers.push(stop as () => void);
      }
    } catch (error) {
      console.warn(`dsh-wewrite: Agent 工具注册降级（agent ${String(agent.id)}）：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  try {
    for (const agent of ctx.agents?.roots?.() ?? []) mount(agent);
    const stopCreated = ctx.on?.('agent/created', ((event: unknown) => {
      const agent = (event as { agent: AgentScope }).agent;
      mount(agent);
    }) as (...args: unknown[]) => unknown);
    if (typeof stopCreated === 'function') disposers.push(stopCreated);
  } catch (error) {
    console.warn(`dsh-wewrite: Agent 工具装配降级：${error instanceof Error ? error.message : String(error)}`);
  }
  return disposers;
}
