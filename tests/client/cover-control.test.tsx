// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ArticleDetail } from '@/shared/contract';
import type { WewriteRpc } from '@/client/lib/rpc';
import type { ToastApi } from '@/client/components/Toast';
import { CoverControl } from '@/client/components/editor/CoverControl';

/**
 * 封面控件（v0.5.6）：封面是推草稿箱硬门槛。
 * 覆盖：无封面横幅、生成走 generateCover、上传走 bindCover（mock FileReader）、
 * coverPreview 失败落占位块不崩、busy 态禁用按钮。
 */

// 宿主 primitives 导入链带 katex CSS（node 环境 vitest 装不进），换轻量替身——手法同 wechat-optional.test.tsx。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown> & { children?: ReactNode }) => {
    const { icon: _icon, variant: _variant, size: _size, ...rest } = props;
    return <button type="button" {...rest}>{props.children}</button>;
  },
}));

const ARTICLE_BASE = {
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

const NO_COVER = ARTICLE_BASE;
const WITH_COVER = { ...ARTICLE_BASE, coverImageId: 'cover-1' } as ArticleDetail;

/** 按端点路由的 rpc mock：未配置的端点直接 reject，防止测试静默走错路径。 */
function makeRpc(handlers: Record<string, (payload?: unknown) => Promise<unknown>> = {}) {
  return {
    call: vi.fn(async (endpoint: string, payload?: unknown) => {
      const handler = handlers[endpoint];
      if (!handler) throw new Error(`未配置的端点：${endpoint}`);
      return handler(payload);
    }),
  } as unknown as WewriteRpc;
}

function makeToast() {
  const push = vi.fn();
  const api = { push, dismiss: vi.fn() } as unknown as ToastApi;
  return { api, push };
}

/** FileReader 替身：readAsDataURL 产固定 data URL，微任务后回调 onload。 */
class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(file: File): void {
    this.result = `data:${file.type};base64,QUJDRA==`;
    queueMicrotask(() => this.onload?.());
  }
}

const user = userEvent.setup();

/** 状态化父组件替身：onArticleChanged 真正回灌 prop，模拟编辑器父组件的刷新回路（doc.setArticle）。 */
function CoverHarness({ article, rpc, toast }: { article: ArticleDetail; rpc: WewriteRpc; toast: ToastApi }) {
  const [current, setCurrent] = useState(article);
  return <CoverControl article={current} rpc={rpc} toast={toast} onArticleChanged={setCurrent} />;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoverControl：无封面', () => {
  it('显示缺封面横幅与「生成封面」「上传封面」，不请求预览', () => {
    const rpc = makeRpc();
    const { api } = makeToast();
    render(<CoverControl article={NO_COVER} rpc={rpc} toast={api} onArticleChanged={() => {}} />);
    expect(screen.getByTestId('ww-cover-banner').textContent).toContain('缺封面');
    expect(screen.getByRole('button', { name: '生成封面' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '上传封面' })).toBeTruthy();
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('点「生成封面」调用 image/generateCover，成功后回传新详情并弹成功 toast', async () => {
    const next = { ...NO_COVER, coverImageId: 'cover-2' } as ArticleDetail;
    const onArticleChanged = vi.fn();
    const rpc = makeRpc({ 'image/generateCover': async () => next });
    const { api, push } = makeToast();
    render(<CoverControl article={NO_COVER} rpc={rpc} toast={api} onArticleChanged={onArticleChanged} />);
    await user.click(screen.getByRole('button', { name: '生成封面' }));
    await waitFor(() => expect(onArticleChanged).toHaveBeenCalledWith(next));
    expect(rpc.call).toHaveBeenCalledWith('image/generateCover', { articleId: 'a1' });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('生成失败弹错误 toast，不回调详情', async () => {
    const rpc = makeRpc({
      'image/generateCover': async () => {
        throw new Error('模型不可用');
      },
    });
    const onArticleChanged = vi.fn();
    const { api, push } = makeToast();
    render(<CoverControl article={NO_COVER} rpc={rpc} toast={api} onArticleChanged={onArticleChanged} />);
    await user.click(screen.getByRole('button', { name: '生成封面' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })));
    expect(onArticleChanged).not.toHaveBeenCalled();
  });

  it('上传封面读文件转纯 base64 后调用 image/bindCover', async () => {
    vi.stubGlobal('FileReader', FakeFileReader);
    const next = { ...NO_COVER, coverImageId: 'cover-3' } as ArticleDetail;
    const onArticleChanged = vi.fn();
    const rpc = makeRpc({ 'image/bindCover': async () => next });
    const { api, push } = makeToast();
    render(<CoverControl article={NO_COVER} rpc={rpc} toast={api} onArticleChanged={onArticleChanged} />);
    const input = screen.getByTestId('ww-cover-input') as HTMLInputElement;
    const file = new File(['abc'], 'cover.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onArticleChanged).toHaveBeenCalledWith(next));
    // base64 已去掉 data: 前缀，mime 原样透传
    expect(rpc.call).toHaveBeenCalledWith('image/bindCover', { articleId: 'a1', base64: 'QUJDRA==', mime: 'image/png' });
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('非白名单图片类型直接拒绝，不发起上传', async () => {
    vi.stubGlobal('FileReader', FakeFileReader);
    const rpc = makeRpc();
    const { api, push } = makeToast();
    render(<CoverControl article={NO_COVER} rpc={rpc} toast={api} onArticleChanged={() => {}} />);
    const input = screen.getByTestId('ww-cover-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'c.gif', { type: 'image/gif' })] } });
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })));
    expect(rpc.call).not.toHaveBeenCalled();
  });

  it('生成进行中按钮禁用并显示「生成中…」，完成回灌后恢复并变为「重新生成」', async () => {
    let resolveRun!: (value: unknown) => void;
    const rpc = makeRpc({
      'image/generateCover': () =>
        new Promise((resolve) => {
          resolveRun = resolve;
        }),
    });
    const { api } = makeToast();
    render(<CoverHarness article={NO_COVER} rpc={rpc} toast={api} />);
    await user.click(screen.getByRole('button', { name: '生成封面' }));
    const busyButton = screen.getByRole('button', { name: '生成中…' }) as HTMLButtonElement;
    expect(busyButton.disabled).toBe(true);
    resolveRun({ ...NO_COVER, coverImageId: 'cover-4' });
    // 回灌后 hasCover=true：按钮变「重新生成」，且预览随 coverImageId 变化重新请求
    await waitFor(() => expect(screen.getByRole('button', { name: '重新生成' })).toBeTruthy());
    expect(rpc.call).toHaveBeenCalledWith('image/coverPreview', { articleId: 'a1' });
  });
});

describe('CoverControl：有封面', () => {
  it('coverPreview 报错时显示占位块，不崩溃，动作按钮变为「重新生成」「更换」', async () => {
    const rpc = makeRpc(); // coverPreview 未配置 → reject，模拟宿主报错
    render(<CoverControl article={WITH_COVER} rpc={rpc} toast={makeToast().api} onArticleChanged={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('ww-cover-placeholder')).toBeTruthy());
    expect(screen.getByRole('button', { name: '重新生成' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '更换' })).toBeTruthy();
  });

  it('coverPreview 成功时缩略图拿到 data URL', async () => {
    const rpc = makeRpc({
      'image/coverPreview': async () => ({ base64: 'QUJD', mime: 'image/png', bytes: 4 }),
    });
    render(<CoverControl article={WITH_COVER} rpc={rpc} toast={makeToast().api} onArticleChanged={() => {}} />);
    await waitFor(() => {
      const thumb = screen.getByTestId('ww-cover-thumb') as HTMLImageElement;
      expect(thumb.src).toBe('data:image/png;base64,QUJD');
    });
  });
});
