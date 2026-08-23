/**
 * /wewrite 命令注册契约测试（QA 三轮 P1-B 闭环：commands 注册此前零单测，
 * 形状漂移三次撞真宿主才暴露）。测试内嵌一个宿主 normalizeDefinition/
 * normalizeResult 的最小镜像校验器——我们的定义与 handler 返回必须原样通过，
 * 防 fake 与真宿主契约漂移再次漏网。
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { registerWewriteCommand } from '../../src/host/agent-tools/commands';
import type { WeWriteService } from '../../src/host/service';

/** 宿主 dsh-commands/lib/index.js normalizeDefinition 的最小镜像（rc.7）。 */
function mirrorNormalizeDefinition(definition: Record<string, unknown>): void {
  if (typeof definition.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(definition.name)) {
    throw new TypeError('name must match command pattern');
  }
  if (typeof definition.description !== 'string' || definition.description.trim().length === 0) {
    throw new TypeError('description must be a non-empty string');
  }
  if (typeof definition.handler !== 'function') throw new TypeError('handler must be a function');
  const rawInput = definition.input;
  if (rawInput !== undefined) {
    if (typeof rawInput !== 'object' || rawInput === null || !('hint' in rawInput) || typeof (rawInput as { hint?: unknown }).hint !== 'string') {
      throw new TypeError('input hint must be a string');
    }
    if ((rawInput as { hint: string }).hint.trim().length === 0) {
      throw new TypeError('input hint must not be empty');
    }
  }
}

/** 宿主 normalizeResult 的最小镜像：只接受 success/error 两种带 kind 的形状。 */
async function mirrorNormalizeResult(handler: (invocation: unknown) => unknown, invocation: unknown): Promise<void> {
  const value = await handler(invocation);
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new TypeError('handler must return a CommandResult');
  }
  const result = value as { kind: unknown; text?: unknown };
  if (result.kind === 'success') {
    if (result.text !== undefined && typeof result.text !== 'string') throw new TypeError('success text must be a string');
    return;
  }
  if (result.kind === 'error') {
    if (typeof result.text !== 'string' || result.text.trim().length === 0) throw new TypeError('error text must be non-empty');
    return;
  }
  throw new TypeError(`unknown result kind`);
}

interface CapturedDefinition extends Record<string, unknown> {
  handler: (invocation: unknown) => unknown;
}

function makeCtx(capture: { definition?: CapturedDefinition } = {}) {
  return {
    commands: {
      register(definition: CapturedDefinition) {
        capture.definition = definition;
        return () => undefined;
      },
    },
  } as unknown as Parameters<typeof registerWewriteCommand>[0];
}

function makeService(runId = 'run-123') {
  return { startRun: vi.fn(() => ({ runId })) } as unknown as WeWriteService;
}

afterEach(() => vi.restoreAllMocks());

describe('registerWewriteCommand：宿主契约镜像（AC-M3-01）', () => {
  it('注册定义通过宿主 normalizeDefinition 镜像（input 只含非空 hint 字符串）', () => {
    const capture: { definition?: CapturedDefinition } = {};
    registerWewriteCommand(makeCtx(capture), makeService());
    expect(capture.definition).toBeDefined();
    expect(() => mirrorNormalizeDefinition(capture.definition!)).not.toThrow();
    const input = capture.definition!.input as Record<string, unknown>;
    const hint = input.hint as string;
    expect(typeof hint).toBe('string');
    expect(hint.trim().length).toBeGreaterThan(0);
    // 宿主只保留 hint：送 name/placeholder 字段属形状漂移（QA 三轮实锤根因），此处钉死不再犯
    expect(Object.keys(input)).toEqual(['hint']);
  });

  it('空主题 → kind:error 且过宿主 normalizeResult 镜像，不启动管线', async () => {
    const capture: { definition?: CapturedDefinition } = {};
    const service = makeService();
    registerWewriteCommand(makeCtx(capture), service);
    const result = (await capture.definition!.handler({ rawInput: '   ' })) as { kind: string; text: string };
    expect(result.kind).toBe('error');
    expect(result.text).toContain('/wewrite');
    await expect(mirrorNormalizeResult(capture.definition!.handler, { rawInput: '' })).resolves.toBeUndefined();
    expect(service.startRun).not.toHaveBeenCalled();
  });

  it('带主题 → kind:success（text 含 runId）、startRun 收 fixed topic，返回形状过镜像', async () => {
    const capture: { definition?: CapturedDefinition } = {};
    const service = makeService('run-abc-9');
    registerWewriteCommand(makeCtx(capture), service);
    const result = (await capture.definition!.handler({ rawInput: ' Cloudflare Workers 冷启动实测 ' })) as {
      kind: string;
      text: string;
    };
    expect(result.kind).toBe('success');
    expect(result.text).toContain('run-abc-9');
    await expect(mirrorNormalizeResult(capture.definition!.handler, { rawInput: '主题X' })).resolves.toBeUndefined();
    expect(service.startRun).toHaveBeenCalledWith({
      trigger: 'manual',
      params: { topicMode: 'fixed', topic: 'Cloudflare Workers 冷启动实测', imageCount: 0 },
    });
  });

  it('注册抛错 → warn 降级返回 undefined，不炸插件（D8）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ctx = {
      commands: {
        register() {
          throw new Error('commands service unavailable');
        },
      },
    } as unknown as Parameters<typeof registerWewriteCommand>[0];
    expect(registerWewriteCommand(ctx, makeService())).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/wewrite 命令注册降级'));
  });
});
