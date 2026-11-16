// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConfigView, ScheduleViewModel, SnapshotResponse } from '@/shared/contract';
import type { WewriteStore } from '@/client/store';
import { SchedulePanel } from '@/client/panels/schedule-panel';

/**
 * 定时面板空状态文案契约（本任务修的「骗人文案」之二）：
 * - 引导必须与页头真实菜单对得上：「推草稿箱 ▾」按钮 +「定时跑稿（不自动推送）」菜单项；
 * - 必须明说推送要手动，不许再暗示「到点自动推进草稿箱」；
 * - 卡片目标行同口径：到点自动跑稿，推送草稿箱需手动。
 */

// 宿主 UI primitives 带katex CSS 导入链，轻量替身（同 wechat-optional.test.tsx 手法）。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown> & { children?: ReactNode }) => {
    const { icon: _icon, variant: _variant, size: _size, className: _className, ...rest } = props;
    return <button type="button" {...rest}>{props.children}</button>;
  },
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Pill: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  StateDot: () => <span data-state="mock" />,
  Modal: ({ open, children }: { open: boolean; children?: ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
  Menu: ({
    anchor,
    items,
  }: {
    anchor: ReactNode;
    items: ReadonlyArray<{ id: string; label: ReactNode }>;
    onSelect: (id: string) => void;
  }) => (
    <div>
      {anchor}
      {items.map((item) => (
        <button key={item.id} type="button">
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

const CONFIG: ConfigView = {
  settings: {
    wechatAppId: '',
    wechatApiBaseUrl: '',
    wechatAuthor: '作者',
    defaultTheme: 'default',
    defaultImageSize: '1024x1024',
    llmDefault: {},
    agentToolsEnabled: false,
    runHistoryLimit: 20,
  },
  credentials: {},
  imageProviders: [],
};

const EMPTY_SNAPSHOT: SnapshotResponse = {
  articles: [],
  runs: [],
  schedules: [],
  config: CONFIG,
  serverNow: '2026-01-01T00:00:00.000Z',
  capabilities: { contractVersion: 1, features: [] },
};

const SCHEDULE: ScheduleViewModel = {
  id: 's1',
  revision: 1,
  name: '每日晨稿',
  rrule: 'DTSTART;TZID=Asia/Shanghai:20260101T093000\nRRULE:FREQ=DAILY',
  timeZone: 'Asia/Shanghai',
  params: { topicMode: 'hotspots' },
  enabled: true,
  publishTarget: 'draft',
  nextRunAt: '2026-01-02T01:30:00.000Z',
};

function renderPanel(schedules: ScheduleViewModel[] = []) {
  const store = {
    rpc: { call: vi.fn() },
    t: (key: string) => key,
    navigate: vi.fn(),
    snapshot: { status: 'ready', data: { ...EMPTY_SNAPSHOT, schedules } },
    refreshSnapshot: vi.fn(async () => undefined),
    toast: { push: vi.fn(), dismiss: vi.fn() },
    toastMessages: [],
    dismissToast: vi.fn(),
    generation: null,
    narrow: false,
  } as unknown as WewriteStore;
  vi.mocked(useStoreMock).mockReturnValue(store);
  return render(<SchedulePanel />);
}
// store 模块整体替身：SchedulePanel 经 useStore 取快照，测试不建真 Provider。
const useStoreMock = vi.fn();
vi.mock('@/client/store', () => ({
  useStore: () => useStoreMock(),
}));

const user = userEvent.setup();

beforeEach(() => {
  useStoreMock.mockReset();
});

describe('定时面板：空状态引导与真实菜单一致', () => {
  it('引导点名「推草稿箱 ▾ → 定时跑稿（不自动推送）」，并说明推送要手动', () => {
    renderPanel();
    const empty = document.querySelector('.ww-empty__title');
    expect(empty).not.toBeNull();
    const title = empty!.textContent ?? '';
    expect(title).toContain('推草稿箱 ▾');
    expect(title).toContain('定时跑稿（不自动推送）');
    expect(title).toContain('到点自动跑稿');
    expect(title).toContain('推送草稿箱要手动执行');
    // 旧文案（菜单里根本没有「定时」这一项）不许回来。
    expect(title).not.toContain('推草稿箱 ▾ → 定时');
  });

  it('空状态下方仍给「新建定时」直达入口', async () => {
    renderPanel();
    // 页头与空态各有一个「新建定时」；取空态里的那个（DOM 序最后一个）。
    const buttons = screen.getAllByRole('button', { name: '新建定时' });
    expect(buttons.length).toBe(2);
    await user.click(buttons[buttons.length - 1] as HTMLElement);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('定时面板：卡片目标行按真实行为描述', () => {
  it('有排期时卡片写「到点自动跑稿；推送草稿箱需手动执行」，不再宣称发布目标', () => {
    renderPanel([SCHEDULE]);
    const list = screen.getByRole('list');
    expect(within(list).getByText('《每日晨稿》')).toBeTruthy();
    expect(within(list).getByText('到点自动跑稿；推送草稿箱需手动执行')).toBeTruthy();
    expect(document.body.textContent).not.toContain('发布目标：草稿箱');
  });
});
