/**
 * 弱模型宽容转换测试（08-24 live 实证：glm-4.5-flash 把 image_count 传成 "3"、
 * outline 传成 JSON 字符串，连撞 4 次参数校验后模型弃用插件改走宿主 write 工具）。
 * 覆盖 coerceInteger / coerceStringArray 与「垃圾值仍结构化拒绝」边界。
 */
import { describe, expect, it } from 'vitest';
import type { WeWriteService } from '@/host/service';
import { registerAgentTools } from '@/host/agent-tools';
import { makeFakeService, makeAgent, makeCtx } from './agent-tools.test';

const SIGNAL = new AbortController().signal;
type ExecFn = (args: unknown, exec: unknown) => Promise<unknown>;

function setupRunTool() {
  const service = makeFakeService() as unknown as WeWriteService;
  const agent = makeAgent('agent_coerce');
  const harness = makeCtx({ agents: [agent] });
  registerAgentTools(harness.ctx, service, { enabled: true });
  const tool = agent.tool('wewrite_run') as unknown as { execute: ExecFn };
  const runArgs = (extra: Record<string, unknown>) => ({ topic: '宽容转换主题', ...extra });
  const invoke = (extra: Record<string, unknown>) => tool.execute(runArgs(extra), { signal: SIGNAL });
  return { service, invoke };
}

describe('弱模型宽容转换（coerceInteger / coerceStringArray）', () => {
  it('image_count 传数字串 "3" → 按 3 接受，startRun 收到整数', async () => {
    const { service, invoke } = setupRunTool();
    await invoke({ image_count: '3' });
    expect(service.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ imageCount: 3 }) }),
    );
  });

  it('outline 传 JSON 字符串 → 解析成字符串数组进 brief', async () => {
    const { service, invoke } = setupRunTool();
    const outlineJson = JSON.stringify(['引言', '正文', '总结']);
    await invoke({ outline: outlineJson });
    expect(service.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ brief: expect.objectContaining({ outline: ['引言', '正文', '总结'] }) }),
      }),
    );
  });

  it('垃圾值仍结构化拒绝：image_count 传非数字串 → image-count-invalid + runId/status 齐全', async () => {
    const { invoke } = setupRunTool();
    const value = (await invoke({ image_count: 'abc' })) as Record<string, unknown>;
    expect(value.ok).toBe(false);
    expect((value.error as { code?: string }).code).toBe('image-count-invalid');
    expect(value.runId).toBe('');
    expect(value.status).toBe('failed');
  });

  it('sources 传 JSON 字符串 → 解析成数组并走 http(s) 校验', async () => {
    const { service, invoke } = setupRunTool();
    const sourcesJson = JSON.stringify(['https://a.test/x', 'https://b.test/y']);
    await invoke({ sources: sourcesJson });
    expect(service.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ brief: expect.objectContaining({ sources: ['https://a.test/x', 'https://b.test/y'] }) }),
      }),
    );
  });
});
