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

/** 启动 brief 的 prompt 投影（v0.5 变密度输入，docs/v0.5-launch-brief.md）。 */
export interface LaunchBriefForPrompt {
  readonly title?: string;
  readonly approach?: string;
  readonly outline?: readonly string[];
  readonly sources?: readonly string[];
}

export function outlineUserPrompt(topic: string, brief?: LaunchBriefForPrompt, retryMissing?: readonly string[]): string {
  const skeleton = brief?.outline?.length ? brief.outline : undefined;
  if (skeleton) {
    // 骨架绑模式：给定节名合同（原样保留、顺序不变），LLM 只做补洞。
    return [
      `主题：${topic}`,
      '',
      '用户已定大纲骨架——以下节名必须原样保留（一字不改）、相对顺序不变：',
      ...skeleton.map((section) => `- ${section}`),
      '',
      '你的任务是补洞：',
      '- 可以在骨架节之间补充必要小节（证据/对比/结尾），每节一句话说明覆盖的具体内容；',
      '- 标注每节计划出现的证据类型（数据/命令/对比/亲历细节）；',
      '- 输出完整大纲（给定节与补充节合并），不得改写、合并、拆分或删除给定节名。',
      ...(retryMissing?.length
        ? ['', `上一次输出遗漏了以下给定节，本次必须原样包含：${retryMissing.map((section) => `「${section}」`).join('、')}`]
        : []),
    ].join('\n');
  }
  return [
    `主题：${topic}`,
    '',
    '请给出一篇文章大纲：',
    '- 5 到 8 个二级标题小节，每节一句话说明要覆盖的具体内容；',
    '- 标注每节计划出现的具体证据类型（数据/命令/对比/亲历细节）；',
    '- 不写引言节与总结节，首节直接切入主体。',
  ].join('\n');
}

export function draftUserPrompt(
  topic: string,
  outline: string,
  brief?: LaunchBriefForPrompt,
  retryMissingOutline?: readonly string[],
  retryInvisibleSources?: readonly string[],
): string {
  const lines: string[] = [`主题：${topic}`];
  if (brief?.title) {
    lines.push(`已定标题：《${brief.title}》——全文围绕这个题目展开；正文仍不出现一级标题（由发布字段承载）。`);
  }
  if (brief?.approach) {
    lines.push('', '总体思路（用户主张，全文必须围绕它展开，不得偏离）：', brief.approach);
  }
  if (brief?.sources?.length) {
    lines.push(
      '',
      '引用来源约束：',
      '- 事实引用优先锚定以下来源；',
      '- 来源以可见 URL 文本呈现（如「（来源：URL）」或括号内裸链接）——不要用 Markdown 链接语法 []()，微信会剥离锚标签导致链接丢失；',
      '- 不得编造未提供的 URL。',
      ...brief.sources.map((url) => `- ${url}`),
    );
  }
  lines.push(
    '',
    '大纲如下：',
    outline,
    '',
    '请成稿：',
    '- Markdown 输出，标题层级从 ## 开始（一级标题由发布字段承载，正文不出现）；',
    '- 每节包含至少一处具体细节（数字、命令、代码或对比结论）；',
    '- 段落长短交替，避免连续同长段；',
    '- 正文配图位置以「![描述](图片待生成)」占位，后续管线会替换。',
  );
  if (retryMissingOutline?.length) {
    lines.push(
      '',
      `上一次成稿遗漏/改写了以下给定节名，本次必须原样保留（节名一字不改）：${retryMissingOutline
        .map((section) => `「${section}」`)
        .join('、')}`,
    );
  }
  if (retryInvisibleSources?.length) {
    lines.push(
      '',
      '上一次成稿把以下来源写成了 Markdown 链接（微信会剥离锚标签，读者看不到 URL）——本次必须以裸 URL 文本引用（如「（来源：URL）」）：',
      ...retryInvisibleSources.map((url) => `- ${url}`),
    );
  }
  return lines.join('\n');
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
