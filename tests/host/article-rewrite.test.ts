import { describe, expect, it } from 'vitest';
import { WeWriteService } from '@/host/service';
import { WewriteServiceError } from '@/host/service-errors';
import type { LlmService } from '@/host/platform';
import { MemoryDomain, makeCredentials, silentLogger } from './service-harness';

/**
 * AI 改写选中段 service 层测试（uiux v0.3 §3）。
 *
 * 本文件钉定 src/host/service.ts rewriteText 消费面：
 * - settings.llmDefault 缺 provider/model 时拒绝（llm-not-configured，零 LLM 调用）
 * - 走 streamLlmText（purpose 'wewrite-article-rewrite'、maxTokens=min(4000, text*3+500)、45s AbortController）
 * - 指令与可选题名透传进 user 提示；llm error 分流透传、abort/超时归一 rewrite-timeout、空输出 rewrite-empty
 * LLM 按宿主真实 chunk 协议 mock（text-delta + finish.reason），非 mock streamLlmText 本身。
 */

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');

type StreamFactory = (options: Record<string, unknown>) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;

function makeScriptedLlm(script: () => AsyncGenerator) {
  const calls: Record<string, unknown>[] = [];
  const stream: StreamFactory = (options) => {
    calls.push(options);
    return script();
  };
  return { llm: { stream } as LlmService, calls };
}

const userTextOf = (options: Record<string, unknown>): string => {
  const messages = options.messages as { content: { text: string }[] }[];
  return String(messages[0].content[0].text);
};

async function makeService(llm: LlmService, options?: { rewriteTimeoutMs?: number; skipLlmConfig?: boolean }) {
  const service = await WeWriteService.open({
    domain: new MemoryDomain(),
    credentials: makeCredentials().service,
    llm,
    now: () => FIXED_NOW,
    logger: silentLogger,
    ...(options?.rewriteTimeoutMs !== undefined ? { rewriteTimeoutMs: options.rewriteTimeoutMs } : {}),
  });
  if (!options?.skipLlmConfig) {
    await service.setConfig({ llmDefault: { provider: 'zhipu', model: 'glm-4.5-flash' } });
  }
  return service;
}

async function rejectInfo(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WewriteServiceError) return { code: error.code, message: error.message };
    return { code: `non-coded:${error instanceof Error ? error.message : String(error)}`, message: '' };
  }
  return { code: 'no-error-thrown', message: '' };
}

describe('rewriteText（uiux v0.3 §3）', () => {
  it('成功：text-delta 拼装为改写文本，只返回 text 一键', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'text-delta', index: 0, text: '改写后的第一段。' };
      yield { type: 'text-delta', index: 1, text: '\n改写后的第二段。' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm);

    const result = await service.rewriteText({ text: '原文段落。', instruction: '更口语' });

    expect(result).toEqual({ text: '改写后的第一段。\n改写后的第二段。' });
  });

  it('调用参数：purpose/provider/model/system 契约；指令与原文透传，无题名时不带锚点行', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'text-delta', index: 0, text: '改写稿。' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm);

    await service.rewriteText({ text: '一段需要更口语的原文。', instruction: '更口语' });

    expect(llm.calls.length).toBe(1);
    const options = llm.calls[0];
    expect(options.purpose).toBe('wewrite-article-rewrite');
    expect(options.provider).toBe('zhipu');
    expect(options.model).toBe('glm-4.5-flash');
    expect(String(options.system)).toContain('改稿助手');
    expect(String(options.system)).toContain('无代码围栏');
    const user = userTextOf(options);
    expect(user).toContain('改写指令：更口语');
    expect(user).toContain('一段需要更口语的原文。');
    expect(user).not.toContain('文章题名');
  });

  it('可选 title：提供时进提示作语气锚点', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'text-delta', index: 0, text: '改写稿。' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm);

    await service.rewriteText({ text: '原文。', instruction: '更口语', title: '某引擎开源观察' });

    expect(userTextOf(llm.calls[0])).toContain('文章题名（语气锚点）：某引擎开源观察');
  });

  it('maxTokens 缩放：短文走 text*3+500，长文封顶 4000', async () => {
    const script = async function* () {
      yield { type: 'text-delta', index: 0, text: '改写稿。' };
      yield { type: 'finish', reason: { kind: 'stop' } };
    };
    const short = makeScriptedLlm(script);
    const serviceShort = await makeService(short.llm);
    await serviceShort.rewriteText({ text: 'x'.repeat(100), instruction: '更口语' });
    expect(short.calls[0].maxTokens).toBe(800);

    const long = makeScriptedLlm(script);
    const serviceLong = await makeService(long.llm);
    await serviceLong.rewriteText({ text: 'x'.repeat(3000), instruction: '更口语' });
    expect(long.calls[0].maxTokens).toBe(4000);
  });

  it('llm 错误分流：finish.reason=error 的 code/message 原样透传', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'context-overflow', message: '上下文超限' } } };
    });
    const service = await makeService(llm.llm);

    const info = await rejectInfo(service.rewriteText({ text: '原文。', instruction: '更口语' }));
    expect(info).toEqual({ code: 'context-overflow', message: '上下文超限' });
  });

  it('空输出：finish stop 但零文本时 rewrite-empty 拒', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm);

    const info = await rejectInfo(service.rewriteText({ text: '原文。', instruction: '更口语' }));
    expect(info.code).toBe('rewrite-empty');
  });

  it('超时 abort：注入短超时 + 持续吐 delta 的慢流，到点后中止并 rewrite-timeout', async () => {
    const llm = makeScriptedLlm(async function* () {
      for (let index = 0; ; index += 1) {
        yield { type: 'text-delta', index, text: `段${index}` };
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    });
    const service = await makeService(llm.llm, { rewriteTimeoutMs: 30 });

    const info = await rejectInfo(service.rewriteText({ text: '原文。', instruction: '更口语' }));
    expect(info.code).toBe('rewrite-timeout');
    expect(info.message).toContain('已取消');
  });

  it('未配默认模型：llm-not-configured 中文可读错误，零 LLM 调用', async () => {
    const llm = makeScriptedLlm(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } };
    });
    const service = await makeService(llm.llm, { skipLlmConfig: true });

    const info = await rejectInfo(service.rewriteText({ text: '原文。', instruction: '更口语' }));
    expect(info.code).toBe('llm-not-configured');
    expect(info.message).toContain('设置');
    expect(llm.calls.length).toBe(0);
  });
});
