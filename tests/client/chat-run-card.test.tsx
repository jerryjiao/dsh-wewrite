// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunToolCard } from '@/client/chat/run-tool-card';
import { consumeOverlayIntent } from '@/client/chat/overlay-bridge';
import type { GenericResultViewLike } from '@/client/lib/context';
import type { WewriteRpc } from '@/client/lib/rpc';

/**
 * 运行卡组件测试（chat-integration M2，测试先行——模块按 architecture §3 M2/§5.2 实现）。
 *
 * 钉定的公共 API（dev 按此实现）：
 * - `@/client/chat/run-tool-card` 具名导出 `RunToolCard`，props：{ block, rpc, t? }——
 *   block 为 ToolCallBlock（RunningToolCall=运行态 / ToolResultNode=终态）；t 可选（缺省 zh 文案，
 *   坑#dsh-slot-props-t：卡片一律用本插件 ns，不依赖 props.t）。
 * - `@/client/chat/overlay-bridge` 具名导出 `consumeOverlayIntent(): { articleId?: string } | undefined`
 *   （一次性消费，AC-M2-04 卡片点击→写作台定位的唯一桥面）。
 * 断言依据：Spec §9（AC-M2-03 回放 / AC-M2-04 联动 / AC-M2-07 兜底）+ architecture §5.2/§5.3、D6。
 */

// ── 假件 ─────────────────────────────────────────────────────────────────────

const NOW = 1_755_648_000_000;

function makeRpc(respond: (endpoint: string, payload: unknown) => unknown): { rpc: WewriteRpc; call: ReturnType<typeof vi.fn> } {
  const call = vi.fn(async (endpoint: string, payload: unknown) => respond(endpoint, payload));
  return { rpc: { call } as unknown as WewriteRpc, call };
}

const runDetailFixture = () => ({
  id: 'run_1',
  trigger: 'manual' as const,
  status: 'running' as const,
  startedAt: '2026-08-20T04:00:00.000Z',
  topic: 'Cloudflare Workers 冷启动实测',
  steps: [
    { name: 'topic', status: 'succeeded', startedAt: '2026-08-20T04:00:01.000Z', finishedAt: '2026-08-20T04:00:20.000Z' },
    { name: 'outline', status: 'running', startedAt: '2026-08-20T04:00:20.000Z' },
    { name: 'draft', status: 'pending' },
    { name: 'gates', status: 'pending' },
    { name: 'render', status: 'pending' },
    { name: 'images', status: 'pending' },
  ],
});

/** 运行态 block：RunningToolCall（S4 owner props 的 block 面）。 */
const runningBlock = () => ({
  callId: 'call_1',
  name: 'wewrite_run',
  argsRaw: JSON.stringify({ topic: 'Cloudflare Workers 冷启动实测', image_count: 0 }),
  turn: 1,
  step: 1,
  time: NOW,
  callView: { card: 'generic', title: '正在写《Cloudflare Workers 冷启动实测》', kind: 'execute' },
  subCalls: [],
});

/** 终态 block：ToolResultNode（meta 驱动成稿卡，AC-M2-03 回放同形态）。 */
const settledBlock = (meta: unknown) => ({
  kind: 'tool-result' as const,
  seq: 7,
  time: NOW + 60_000,
  callId: 'call_1',
  call: { name: 'wewrite_run', argsRaw: JSON.stringify({ topic: 'Cloudflare Workers 冷启动实测', image_count: 0 }) },
  callTime: NOW,
  content: [{ type: 'text' as const, text: '模型面结果文本' }],
  isError: false,
  meta,
  callView: { card: 'generic', title: '正在写《Cloudflare Workers 冷启动实测》', kind: 'execute' },
  // 类型注记（不改断言语义）：AC-M2-07 用例需把 resultView 从 null 改写成 generic 卡。
  resultView: null as GenericResultViewLike | null,
  subCalls: [],
});

const okMeta = () => ({
  tool: 'wewrite_run',
  topic: 'Cloudflare Workers 冷启动实测',
  ok: true,
  runId: 'run_1',
  status: 'succeeded',
  articleId: 'art_9',
  title: 'Cloudflare Workers 冷启动实测',
  digest: 'p99 冷启动 3ms，重 IO 场景差距更小。',
  gatePassed: true,
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 三态渲染 ─────────────────────────────────────────────────────────────────

describe('运行卡三态（architecture §5.2 / ADR-013）', () => {
  it('running：经 run/detail 轮询消费 steps 数据并渲染六步进度（runId 来源由实现自 block 推导）', async () => {
    vi.useFakeTimers();
    const { rpc, call } = makeRpc(() => runDetailFixture());
    const { container } = render(<RunToolCard block={runningBlock() as never} rpc={rpc} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(call.mock.calls.some(([endpoint]) => endpoint === 'run/detail'), '应经 run/detail RPC 轮询').toBe(true);
    expect(container.textContent).toContain('Cloudflare Workers 冷启动实测');
    // 六步进度渲染（标签中英实现皆可，须呈现步骤面）
    expect(container.textContent).toMatch(/选题|topic/i);
    expect(container.textContent).toMatch(/大纲|outline/i);
  });

  it('D6 降级：run/detail RPC 持续失败 → 保留运行态占位（含「运行中」），不炸卡片', async () => {
    vi.useFakeTimers();
    const { rpc } = makeRpc(() => {
      throw new Error('loopback rpc 不可达');
    });
    const { container } = render(<RunToolCard block={runningBlock() as never} rpc={rpc} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(container.textContent).toContain('运行中');
  });

  it('AC-M2-03 settled ok：meta 驱动成稿卡（标题+摘要）+「打开写作台」动作按钮', () => {
    const { rpc } = makeRpc(() => runDetailFixture());
    render(<RunToolCard block={settledBlock(okMeta()) as never} rpc={rpc} />);

    expect(screen.getAllByText(/Cloudflare Workers 冷启动实测/).length).toBeGreaterThan(0);
    expect(screen.getByText(/p99 冷启动 3ms/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /写作台/ })).toBeTruthy();
  });

  it('AC-M2-07 settled schema 不符：meta 不过 RunToolMetaSchema → 按 resultView 文本兜底，不出富卡动作', () => {
    const { rpc } = makeRpc(() => runDetailFixture());
    const broken = settledBlock({ tool: 'wewrite_run', topic: 'x', ok: 'not-a-boolean', status: 42 });
    broken.resultView = { card: 'generic', content: [{ type: 'text', text: 'resultView 兜底文本：run_1 succeeded' }] };
    const { container } = render(<RunToolCard block={broken as never} rpc={rpc} />);

    expect(container.textContent).toContain('resultView 兜底文本：run_1 succeeded');
    expect(screen.queryByRole('button', { name: /写作台/ })).toBeNull();
  });
});

describe('卡片点击 → overlay 桥（AC-M2-04 / architecture §5.3）', () => {
  it('点击「打开写作台」→ overlayIntent 携带 articleId，一次性消费后清空', async () => {
    expect(consumeOverlayIntent(), '前置：无残留 intent').toBeUndefined();
    const user = userEvent.setup();
    const { rpc } = makeRpc(() => runDetailFixture());
    render(<RunToolCard block={settledBlock(okMeta()) as never} rpc={rpc} />);

    await user.click(screen.getByRole('button', { name: /写作台/ }));

    expect(consumeOverlayIntent()).toEqual({ articleId: 'art_9' });
    expect(consumeOverlayIntent(), 'intent 必须一次性（防重复跳转）').toBeUndefined();
  });
});
