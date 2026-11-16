import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ArticleDetail } from '@/shared/contract';
import type { WewriteRpc } from '../../lib/rpc';
import type { ToastApi } from '../Toast';
import { Icon } from '../Icon';

/**
 * 封面控件（v0.5.6）：微信草稿必须带封面（thumb_media_id），推送是硬门槛，
 * 没有封面时用户必须在应用内看到这一点并就地补上。
 * 有封面 → 缩略图 + 「重新生成」「更换」；无封面 → 缺封面横幅 + 「生成封面」「上传封面」。
 * 生成/上传成功后把宿主返回的新详情经 onArticleChanged 回传父组件（coverImageId 变化驱动预览重载）。
 * 文案是字面量，不走 i18n——封面线的增量文案归口另行处理，避免在此改动公共 i18n 文件。
 */

/** 上传白名单与契约 image/bindCover 的 mime 正则保持一致（png/jpeg/webp）。 */
const ACCEPTED_MIME = /^image\/(png|jpeg|jpg|webp)$/;

export function CoverControl({
  article,
  rpc,
  toast,
  onArticleChanged,
}: {
  article: ArticleDetail;
  rpc: WewriteRpc;
  toast: ToastApi;
  onArticleChanged: (next: ArticleDetail) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewFailed, setPreviewFailed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasCover = article.coverImageId !== undefined;
  const busy = generating || uploading;

  // 预览跟随 coverImageId：换封面即重载。宿主对无封面会抛 RPC 错、图片解码也可能失败，
  // 两条失败路径都只落到占位块、不弹错误 toast——预览失败不该打断编辑主流程。
  useEffect(() => {
    if (!article.coverImageId) {
      setPreviewUrl(undefined);
      setPreviewFailed(false);
      return;
    }
    let alive = true;
    setPreviewUrl(undefined);
    setPreviewFailed(false);
    rpc
      .call<{ base64: string; mime: string; bytes: number }>('image/coverPreview', { articleId: article.id })
      .then((preview) => {
        if (alive) setPreviewUrl(`data:${preview.mime};base64,${preview.base64}`);
      })
      .catch(() => {
        if (alive) setPreviewFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [rpc, article.id, article.coverImageId]);

  async function generate() {
    if (busy) return;
    setGenerating(true);
    try {
      const detail = await rpc.call<ArticleDetail>('image/generateCover', { articleId: article.id });
      onArticleChanged(detail);
      toast.push({ kind: 'success', title: '封面已生成' });
    } catch (error) {
      toast.push({
        kind: 'error',
        title: '封面生成失败',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setGenerating(false);
    }
  }

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 清空 value：连续选择同一个文件也能再次触发 change。
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_MIME.test(file.type)) {
      toast.push({ kind: 'error', title: '只支持 png / jpeg / webp 图片。' });
      return;
    }
    void upload(file);
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const base64 = await readAsBase64(file);
      const detail = await rpc.call<ArticleDetail>('image/bindCover', {
        articleId: article.id,
        base64,
        mime: file.type,
      });
      onArticleChanged(detail);
      toast.push({ kind: 'success', title: '封面已上传' });
    } catch (error) {
      toast.push({
        kind: 'error',
        title: '封面上传失败',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setUploading(false);
    }
  }

  const generateLabel = generating ? '生成中…' : hasCover ? '重新生成' : '生成封面';
  const uploadLabel = uploading ? '上传中…' : hasCover ? '更换' : '上传封面';

  return (
    <div className="ww-cover" data-testid="ww-cover-control">
      {hasCover ? (
        previewUrl && !previewFailed ? (
          <img
            className="ww-cover__thumb"
            src={previewUrl}
            alt="封面预览"
            data-testid="ww-cover-thumb"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <div className="ww-cover__placeholder" data-testid="ww-cover-placeholder">
            {previewFailed ? '封面不可用' : '…'}
          </div>
        )
      ) : (
        <div className="ww-cover__banner" role="status" data-testid="ww-cover-banner">
          <Icon name="image" size={12} />
          <span>缺封面：推草稿箱必须带封面</span>
        </div>
      )}
      <div className="ww-cover__actions">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void generate()} data-testid="ww-cover-generate">
          {generateLabel}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          data-testid="ww-cover-upload"
        >
          {uploadLabel}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        className="ww-cover__input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        data-testid="ww-cover-input"
        onChange={onPickFile}
      />
    </div>
  );
}

/** FileReader 读 data URL 后去掉「data:mime;base64,」前缀——契约要求 bindCover 收纯 base64。 */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('读取图片文件失败。'));
    reader.readAsDataURL(file);
  });
}
