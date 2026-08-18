/**
 * 管线文本步的 LLM 访问层（ADR-003：宿主直调 ctx.llm.stream，F22 辅助调用先例）。
 * BlockAssembler 组装 text chunk；终端 finish chunk 承载 error/aborted 而非异常。
 * 对 ctx.llm 只做最小接口形状依赖（PipelineLlm），宿主类型与业务逻辑解耦。
 */

export interface LlmStreamMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface LlmStreamOptions {
  /** 辅助调用标注（F22）：wewrite-pipeline。 */
  readonly purpose: string;
  readonly messages: readonly LlmStreamMessage[];
  readonly provider?: string;
  readonly model?: string;
}

export type PipelineLlmChunk =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'finish'; readonly error?: { readonly code: string; readonly message: string }; readonly aborted?: boolean };

export interface PipelineLlm {
  stream(options: LlmStreamOptions): AsyncIterable<PipelineLlmChunk> | Promise<AsyncIterable<PipelineLlmChunk>>;
}

/** 把流式 text chunk 组装为完整文本。 */
export class BlockAssembler {
  private readonly parts: string[] = [];

  push(chunk: PipelineLlmChunk): void {
    if (chunk.type === 'text' && chunk.text) this.parts.push(chunk.text);
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
  const iterable = await llm.stream(options);
  for await (const chunk of iterable) {
    if (signal.aborted) return { status: 'aborted' };
    if (chunk.type === 'text') {
      assembler.push(chunk);
      continue;
    }
    if (chunk.aborted) return { status: 'aborted' };
    if (chunk.error) {
      return { status: 'error', code: chunk.error.code || 'llm-error', message: chunk.error.message };
    }
    return { status: 'ok', text: assembler.getText() };
  }
  return { status: 'ok', text: assembler.getText() };
}

const SYSTEM_STYLE = [
  '你是一位长期给技术类公众号写稿的作者，行文克制、信息密度高。',
  '不写套话与总结腔，不用「总而言之」「值得一提」一类空转词。',
  '面向已具备工程背景的读者，直接进入具体事实与取舍。',
].join('');

export function buildOutlineMessages(topic: string): LlmStreamMessage[] {
  return [
    { role: 'system', content: SYSTEM_STYLE },
    {
      role: 'user',
      content: [
        `主题：${topic}`,
        '',
        '请给出一篇文章大纲：',
        '- 5 到 8 个二级标题小节，每节一句话说明要覆盖的具体内容；',
        '- 标注每节计划出现的具体证据类型（数据/命令/对比/亲历细节）；',
        '- 不写引言节与总结节，首节直接切入主体。',
      ].join('\n'),
    },
  ];
}

export function buildDraftMessages(topic: string, outline: string): LlmStreamMessage[] {
  return [
    { role: 'system', content: SYSTEM_STYLE },
    {
      role: 'user',
      content: [
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
      ].join('\n'),
    },
  ];
}
