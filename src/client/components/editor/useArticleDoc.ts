import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArticleDetail } from '@/shared/contract';
import type { WewriteRpc } from '../../lib/rpc';

/**
 * 文章文档 hook（编辑器数据面，自 editor-panel 拆出）：
 * 加载（article/get，可重试）→ 本地编辑态 → 自动保存（1.2s 停顿节流）
 * → 预览（300ms 防抖 + 中止上次请求）。
 * 标题/主题元数据变更（重命名）由调用方经 applyDetail 回填。
 */

const PREVIEW_DEBOUNCE_MS = 300;
const AUTOSAVE_DEBOUNCE_MS = 1200;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function useArticleDoc(rpc: WewriteRpc, articleId: string) {
  const [article, setArticle] = useState<ArticleDetail | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [retryCount, setRetryCount] = useState(0);
  const [markdown, setMarkdown] = useState('');
  const [theme, setTheme] = useState('professional-clean');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [previewHtml, setPreviewHtml] = useState<string | undefined>();
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let alive = true;
    setArticle(undefined);
    setLoadError(undefined);
    setPreviewHtml(undefined);
    rpc.call<ArticleDetail>('article/get', { id: articleId }).then((detail) => {
      if (!alive) return;
      setArticle(detail);
      setMarkdown(detail.markdown);
      setTheme(detail.theme);
    }).catch((error: unknown) => {
      if (alive) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      alive = false;
    };
  }, [rpc, articleId, retryCount]);

  const dirtyRef = useRef(false);
  const handleMarkdownChange = useCallback((next: string) => {
    dirtyRef.current = true;
    setMarkdown(next);
  }, []);

  // 自动保存（失焦停顿节流）：article/save 回填详情（仅本地存储）。
  useEffect(() => {
    if (!article || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      setSaveState('saving');
      rpc
        .call<ArticleDetail>('article/save', {
          id: article.id,
          slug: article.slug,
          title: article.title,
          digest: article.digest,
          markdown,
          theme,
        })
        .then((saved) => {
          dirtyRef.current = false;
          setArticle(saved);
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [markdown, theme, article, rpc]);

  // 预览：300ms 防抖 + 上一次请求中止（<1s 本地刷新口径不变）。
  useEffect(() => {
    if (!article) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreviewing(true);
      rpc
        .call<{ html: string }>('article/preview', { markdown, theme }, controller.signal)
        .then((result) => setPreviewHtml(result.html))
        .catch(() => undefined)
        .finally(() => setPreviewing(false));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [article, markdown, theme, rpc]);

  return {
    article,
    setArticle,
    loadError,
    retryLoad: () => setRetryCount((count) => count + 1),
    markdown,
    handleMarkdownChange,
    theme,
    setTheme,
    saveState,
    setSaveState,
    previewHtml,
    previewing,
  };
}
