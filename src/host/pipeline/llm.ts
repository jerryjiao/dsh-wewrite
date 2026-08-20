/**
 * 管线文本步的 LLM 访问层（ADR-003：宿主直调 ctx.llm.stream，F22 辅助调用先例）。
 * 2026-08-19 真机校准：宿主 dsh-llm seam 的真实协议是
 * GenerateOptions{provider, model, system, messages[{role, content:[{type:'text',text}]}], purpose}
 * 与 StreamChunk{text-delta | finish(reason.kind)}；旧版按 {type:'text'} 块 + content 传字符串，
 * 在真宿主上产出 0 字空稿（v0.1.4 缺陷），本层按真实协议重写。
 */

export interface LlmStreamOptions {
  /** 辅助调用标注（F22）：wewrite-pipeline。 */
  readonly purpose: string;
  /** 宿主 GenerateOptions.system：系统提示独立字段，不进 messages。 */
  readonly system: string;
  /** 用户轮提示全文（outline/draft 各自组装）。 */
  readonly user: string;
  /** 宿主已注册的供应商路由 id（必填，GenerateOptions.provider）。 */
  readonly provider: string;
  /** 供应商下点名的模型 id（必填，GenerateOptions.model）。 */
  readonly model: string;
  readonly maxTokens?: number;
}

/** 宿主 StreamChunk 的最小依赖面：text-delta 承载增量文本，finish.reason 承载终态。 */
export type PipelineLlmChunk =
  | { readonly type: 'text-delta'; readonly index: number; readonly text: string }
  | {
      readonly type: 'finish';
      readonly reason: {
        readonly kind: 'stop' | 'tool-calls' | 'max-tokens' | 'aborted' | 'error';
        readonly failure?: { readonly code?: string; readonly message: string };
      };
    }
  | { readonly type: string; readonly [field: string]: unknown };

/** 宿主 GenerateOptions 的最小形状依赖（seam 实际读取字段的子集）。 */
export interface PipelineLlm {
  stream(options: Record<string, unknown>): AsyncIterable<PipelineLlmChunk> | Promise<AsyncIterable<PipelineLlmChunk>>;
}

/** 组装宿主 GenerateOptions（只带 seam 会读的字段；source 按 Message 协议最小声明）。 */
function toHostOptions(options: LlmStreamOptions): Record<string, unknown> {
  return {
    purpose: options.purpose,
    provider: options.provider,
    model: options.model,
    system: options.system,
    messages: [
      {
        id: `wewrite-${Date.now().toString(36)}`,
        role: 'user',
        content: [{ type: 'text', text: options.user }],
        source: { kind: 'plugin', plugin: 'dsh-wewrite', form: 'live' },
      },
    ],
    ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
  };
}

/** 把流式 text-delta 组装为完整文本。 */
export class BlockAssembler {
  private readonly parts: string[] = [];

  push(chunk: PipelineLlmChunk): void {
    if (chunk.type !== 'text-delta') return;
    const text = (chunk as { text?: unknown }).text;
    if (typeof text === 'string' && text) this.parts.push(text);
  }

  getText(): string {
    return this.parts.join('').trim();
  }
}

export type LlmStepOutcome =
  | { readonly status: 'ok'; readonly text: string }
  | { readonly status: 'aborted' }
  | { readonly status: 'error'; readonly code: string; readonly message: string };

/** 消费一次 stream 至终端 finish chunk；AbortSignal 中止与供应商错误显式分流。 */
export async function streamLlmText(
  llm: PipelineLlm,
  options: LlmStreamOptions,
  signal: AbortSignal,
): Promise<LlmStepOutcome> {
  const assembler = new BlockAssembler();
  const iterable = await llm.stream(toHostOptions(options));
  for await (const chunk of iterable) {
    if (signal.aborted) return { status: 'aborted' };
    if (chunk.type === 'text-delta') {
      assembler.push(chunk);
      continue;
    }
    if (chunk.type === 'finish') {
      const reason = (chunk as { reason?: { kind?: string; failure?: { code?: string; message?: string } } }).reason;
      if (reason?.kind === 'aborted') return { status: 'aborted' };
      if (reason?.kind === 'error') {
        return {
          status: 'error',
          code: reason.failure?.code || 'llm-error',
          message: reason.failure?.message || '供应商返回错误（无详细信息）',
        };
      }
      return { status: 'ok', text: assembler.getText() };
    }
  }
  return { status: 'ok', text: assembler.getText() };
}

const SYSTEM_STYLE = [
  '你是一位长期给技术类公众号写稿的作者，行文克制、信息密度高。',
  '不写套话与总结腔，不用「总而言之」「值得一提」一类空转词。',
  '面向已具备工程背景的读者，直接进入具体事实与取舍。',
].join('');

export function outlineUserPrompt(topic: string): string {
  return [
    `主题：${topic}`,
    '',
    '请给出一篇文章大纲：',
    '- 5 到 8 个二级标题小节，每节一句话说明要覆盖的具体内容；',
    '- 标注每节计划出现的具体证据类型（数据/命令/对比/亲历细节）；',
    '- 不写引言节与总结节，首节直接切入主体。',
  ].join('\n');
}

export function draftUserPrompt(topic: string, outline: string): string {
  return [
    `主题：${topic}`,
    '',
    '大纲如下：',
    outline,
    '',
    '请成稿：',
    '- Markdown 输出，标题层级从 ## 开始（一级标题由发布字段承载，正文不出现）；',
    '- 每节包含至少一处具体细节（数字、命令、代码或对比结论）；',
    '- 段落长短交替，避免连续同长段；',
    '- 正文配图位置以「![描述](图片待生成)」占位，后续管线会替换。',
  ].join('\n');
}

export function pipelineSystemPrompt(): string {
  return SYSTEM_STYLE;
}

// ── 文章改写提示（uiux v0.3 §3；只输出改写文本，无围栏无前后语）──────────────────

export function rewriteSystemPrompt(): string {
  return [
    '你是一位公众号写作的改稿助手，负责按指令改写作者选中的段落。',
    '只输出改写后的文本：无前言后语、无解释、无代码围栏。',
    '保持 Markdown 结构不变：标题层级、列表、代码块的骨架原样保留。',
    '忠实执行改写指令，不虚构原文没有的事实。',
  ].join('');
}

export function rewriteUserPrompt(input: { readonly text: string; readonly instruction: string; readonly title?: string }): string {
  return [
    ...(input.title ? [`文章题名（语气锚点）：${input.title}`] : []),
    `改写指令：${input.instruction}`,
    '',
    '原文：',
    input.text,
  ].join('\n');
}
