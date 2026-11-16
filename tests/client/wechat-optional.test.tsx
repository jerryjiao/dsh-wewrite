// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ArticleDetail, ConfigView } from '@/shared/contract';
import type { WewriteRpc } from '@/client/lib/rpc';
import { EditorHeadActions } from '@/client/components/editor/EditorHeadActions';
import { WechatSection } from '@/client/panels/settings-sections';

/**
 * 公众号从「缺陷」改「正式可选路径」（本轮目标：激活 = 出成品）：
 * - 设置页公众号组标可选，并给出「配好公众号就能一键发」引导落点
 * - 编辑器无凭据时选推送项 → 走配置引导（跳设置），不发起推送、不进报错路径
 * - 有凭据时推送路径完全不变（回归保护）
 */

// 宿主 UI primitives 的导入链带 katex CSS（node 环境 vitest 装不进），换轻量替身。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown> & { children?: ReactNode }) => {
    const { icon: _icon, variant: _variant, size: _size, ...rest } = props;
    return <button type="button" {...rest}>{props.children}</button>;
  },
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Pill: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Menu: ({
    open,
    anchor,
    items,
    onSelect,
  }: {
    open: boolean;
    anchor: ReactNode;
    items: ReadonlyArray<{ id: string; label: ReactNode }>;
    onSelect: (id: string) => void;
  }) => (
    <div>
      {anchor}
      {open ? (
        <div role="menu">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => onSelect(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  ),
}));

// ⋯ 管理菜单吃 store（rpc/refreshSnapshot/toast），本文件只测页头推送分支。
vi.mock('@/client/components/editor/ArticleManage', () => ({ ArticleManage: () => null }));

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

const RPC = { call: vi.fn(async () => undefined) } as unknown as WewriteRpc;

const ARTICLE = {
  id: 'a1',
  slug: 'a1',
  title: '测试稿',
  digest: '',
  status: 'editing',
  updatedAt: '2026-01-01T00:00:00.000Z',
  v: 1,
  markdown: '# 测试稿',
  theme: 'default',
  bodyImageIds: [],
} as unknown as ArticleDetail;

const user = userEvent.setup();

beforeEach(() => {
  vi.clearAllMocks();
});

function renderHead(wechatReady: boolean) {
  const onPush = vi.fn();
  const onSchedule = vi.fn();
  const onConfigureWechat = vi.fn();
  render(
    <EditorHeadActions
      view="split"
      onViewChange={() => {}}
      article={ARTICLE}
      onArticleChanged={() => {}}
      onDeleted={() => {}}
      pushing={false}
      pushLabel="推草稿箱"
      pushingLabel="推送中…"
      onPush={onPush}
      onSchedule={onSchedule}
      wechatReady={wechatReady}
      onConfigureWechat={onConfigureWechat}
    />,
  );
  return { onPush, onSchedule, onConfigureWechat };
}

describe('设置页：公众号接入是可选项', () => {
  it('标题标注可选，说明写明不配不影响出稿', () => {
    render(<WechatSection config={CONFIG} rpc={RPC} onSaved={() => {}} />);
    expect(screen.getByRole('heading', { name: '公众号接入（可选）' })).toBeTruthy();
    const guide = screen.getByTestId('ww-wechat-guide');
    expect(guide.textContent).toContain('只有要推到公众号草稿箱才需要');
    expect(guide.textContent).toContain('不配不影响出稿');
  });
});

describe('编辑器页头：无凭据时推送改走配置引导', () => {
  it('未配置 → 推送项变成配置引导，点了跳设置、不触发推送', async () => {
    const { onPush, onConfigureWechat } = renderHead(false);
    await user.click(screen.getAllByRole('button', { name: '推草稿箱' })[0] as HTMLElement);
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('button', { name: '推草稿箱' })).toBeNull();
    await user.click(within(menu).getByRole('button', { name: '配好公众号就能一键发' }));
    expect(onConfigureWechat).toHaveBeenCalledTimes(1);
    expect(onPush).not.toHaveBeenCalled();
  });

  it('已配置 → 推送项文案与行为不变', async () => {
    const { onPush, onConfigureWechat } = renderHead(true);
    await user.click(screen.getAllByRole('button', { name: '推草稿箱' })[0] as HTMLElement);
    const menu = screen.getByRole('menu');
    await user.click(within(menu).getByRole('button', { name: '推草稿箱' }));
    expect(onPush).toHaveBeenCalledTimes(1);
    expect(onConfigureWechat).not.toHaveBeenCalled();
  });
});

describe('编辑器页头：无凭据时定时推送同样改走配置引导', () => {
  it('未配置 → 定时项变成配置引导，点了跳设置、不建定时任务', async () => {
    const { onSchedule, onConfigureWechat } = renderHead(false);
    await user.click(screen.getAllByRole('button', { name: '推草稿箱' })[0] as HTMLElement);
    const menu = screen.getByRole('menu');
    await user.click(within(menu).getByRole('button', { name: '配好公众号才能定时发' }));
    expect(onConfigureWechat).toHaveBeenCalledTimes(1);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('已配置 → 定时项文案与行为不变', async () => {
    const { onSchedule, onConfigureWechat } = renderHead(true);
    await user.click(screen.getAllByRole('button', { name: '推草稿箱' })[0] as HTMLElement);
    const menu = screen.getByRole('menu');
    await user.click(within(menu).getByRole('button', { name: '推草稿箱并定时…' }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(onConfigureWechat).not.toHaveBeenCalled();
  });
});
