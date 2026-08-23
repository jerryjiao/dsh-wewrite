import { useState } from 'react';
import { Button, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ArticleDetail } from '@/shared/contract';
import { CodeChip } from '../bits';
import { Icon } from '../Icon';
import { useStore } from '../../store';

/**
 * 文章级管理菜单（uiux-workbench-delta §1-7）：原文章库表格的编辑/去修复/删除
 * 收进编辑器页头 ⋯ 菜单（重命名/删除）。重命名走 article/save（同稿保存新标题）；
 * 删除走 article/delete 二次确认，删除后回工作区。
 */

export function ArticleManage({
  article,
  onChanged,
  onDeleted,
}: {
  article: ArticleDetail;
  onChanged: (next: ArticleDetail) => void;
  onDeleted: () => void;
}) {
  const store = useStore();
  const { rpc, refreshSnapshot, toast } = store;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(article.title);
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function confirmRename() {
    const title = renameDraft.trim();
    if (!title || renameBusy) return;
    setRenameBusy(true);
    try {
      const saved = await rpc.call<ArticleDetail>('article/save', {
        id: article.id,
        slug: article.slug,
        title,
        digest: article.digest,
        markdown: article.markdown,
        theme: article.theme,
      });
      onChanged(saved);
      setRenameOpen(false);
      toast.push({ kind: 'success', title: '已重命名', detail: title });
      await refreshSnapshot();
    } catch (error) {
      toast.push({ kind: 'error', title: '重命名失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setRenameBusy(false);
    }
  }

  async function confirmDelete() {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      await rpc.call<{ deleted: boolean }>('article/delete', { id: article.id });
      toast.push({ kind: 'success', title: '已删除《' + article.title + '》' });
      setDeleteOpen(false);
      await refreshSnapshot();
      onDeleted();
    } catch (error) {
      toast.push({ kind: 'error', title: '删除失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <Menu
        open={menuOpen}
        anchor={
          <button
            type="button"
            className="ww-editor-head__menu"
            data-testid="ww-article-menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="文章管理"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name="ellipsis" size={16} />
          </button>
        }
        items={[
          { id: 'rename', label: '重命名', icon: <Icon name="square-pen" size={16} /> },
          { id: 'delete', label: '删除', icon: <Icon name="trash-2" size={16} />, danger: true },
        ]}
        onSelect={(id) => {
          setMenuOpen(false);
          if (id === 'rename') {
            setRenameDraft(article.title);
            setRenameOpen(true);
          } else {
            setDeleteOpen(true);
          }
        }}
        onClose={() => setMenuOpen(false)}
        align="end"
      />

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="重命名文章"
        closeLabel="取消重命名"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRenameOpen(false)}>取消</Button>
            <Button variant="primary" size="sm" className="ww-btn-accent" onClick={() => void confirmRename()} disabled={renameBusy || renameDraft.trim().length === 0}>
              {renameBusy ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <input
          type="text"
          className="ww-rename-input"
          value={renameDraft}
          onChange={(event) => setRenameDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void confirmRename();
          }}
          aria-label="新标题"
        />
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`删除《${article.title}》`}
        closeLabel="取消删除"
        description="删除后不可恢复；已推送到草稿箱的稿子不受影响。"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>取消</Button>
            <Button variant="ghost" size="sm" className="ww-danger-ghost" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? '删除中…' : '确认删除'}
            </Button>
          </>
        }
      >
        <p className="ww-modal-note">
          <CodeChip>{article.slug}</CodeChip> 将从本地存储移除。
        </p>
      </Modal>
    </>
  );
}
