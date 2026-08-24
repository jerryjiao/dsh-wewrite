// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartupCard } from '@/client/components/StartupCard';

/**
 * 启动卡 v0.5 启动 brief 折叠区（docs/v0.5-launch-brief.md §3 双入口之工作台门）：
 * - 「更多信息」默认收起——快路径一句话零损伤（不罚快路径）
 * - 展开后四框（标题/思路/大纲/来源）→ 组装 brief 进 startGeneration
 * - 空白行过滤、非法来源行丢弃并 toast 提示
 */

const mocks = vi.hoisted(() => ({
  startGeneration: vi.fn(async (_params: Record<string, unknown>, _topic: string) => {}),
  navigate: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/client/store', () => ({
  useStore: () => ({
    snapshot: { status: 'loading' as const },
    navigate: mocks.navigate,
    startGeneration: mocks.startGeneration,
    toast: { push: mocks.push },
  }),
}));

// 宿主 UI primitives 的导入链带 katex CSS（node 环境 vitest 装不进），Button 换轻量替身。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown> & { children?: ReactNode }) => {
    const { icon: _icon, variant: _variant, size: _size, ...rest } = props;
    return <button type="button" {...rest}>{props.children}</button>;
  },
}));

const user = userEvent.setup();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StartupCard：更多信息折叠区（v0.5）', () => {
  it('默认收起：brief 区不渲染，toggle aria-expanded=false', () => {
    render(<StartupCard />);
    expect(screen.queryByTestId('ww-startup-brief')).toBeNull();
    expect(screen.getByTestId('ww-startup-more-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('只填主题 → startGeneration 参数不携带 brief 键（一句话模式）', async () => {
    render(<StartupCard />);
    await user.type(screen.getByTestId('ww-startup-input'), '一句话主题');
    await user.click(screen.getByTestId('ww-startup-submit'));
    expect(mocks.startGeneration).toHaveBeenCalledTimes(1);
    const params = mocks.startGeneration.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('brief' in params).toBe(false);
  });

  it('展开填四框 → brief 组装完整（空白行过滤、非法来源丢弃+toast）', async () => {
    render(<StartupCard />);
    await user.type(screen.getByTestId('ww-startup-input'), 'Workers 冷启动');
    await user.click(screen.getByTestId('ww-startup-more-toggle'));
    expect(screen.getByTestId('ww-startup-brief')).toBeTruthy();
    await user.type(screen.getByTestId('ww-startup-brief-title'), '冷启动的真实数字');
    await user.type(screen.getByTestId('ww-startup-brief-approach'), '冷启动被夸大了');
    await user.type(screen.getByTestId('ww-startup-brief-outline'), '冷启动实测\n\n成本对比');
    await user.type(screen.getByTestId('ww-startup-brief-sources'), 'https://a.test/x\n不是链接');
    await user.click(screen.getByTestId('ww-startup-submit'));

    expect(mocks.startGeneration).toHaveBeenCalledTimes(1);
    const params = mocks.startGeneration.mock.calls[0]?.[0] as { brief?: Record<string, unknown> };
    expect(params.brief).toEqual({
      title: '冷启动的真实数字',
      approach: '冷启动被夸大了',
      outline: ['冷启动实测', '成本对比'],
      sources: ['https://a.test/x'],
    });
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', title: expect.stringContaining('1 条来源') }));
  });

  it('展开但全留空 → 仍不携带 brief（富输入是可选不是门槛）', async () => {
    render(<StartupCard />);
    await user.type(screen.getByTestId('ww-startup-input'), '主题');
    await user.click(screen.getByTestId('ww-startup-more-toggle'));
    await user.click(screen.getByTestId('ww-startup-submit'));
    const params = mocks.startGeneration.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('brief' in params).toBe(false);
  });
});
