import type { Translate } from '../lib/context';
import { Icon } from '../components/Icon';
import { cardT } from './card-text';
import type { WewriteDeliverableArticle } from './deliverables';
import { isOverlayAvailable, openOverlayWithArticle } from './overlay-bridge';

/**
 * turnTail 产物行组件（architecture §5.1 / uiux §1.0，M2）。
 *
 * chain 挂载纪律：selectWewriteArticles 在挂载前裁决（decline-before-mount），
 * 本组件只在 matched 非空时被挂载；每行 = 文章标题 + 状态 chip（成稿/已推送），
 * 点击 → openOverlayWithArticle（AC-M2-04，overlayAvailable=false 时行降为纯文本）。
 */

export interface DeliverablesRowProps {
  /** chain 选择器结果（selectWewriteArticles 的非空返回）。 */
  readonly matched?: readonly WewriteDeliverableArticle[];
  /** turnTail owner 透传面（openFile 本行不使用——文章非 workspace 文件，ADR-012）。 */
  readonly seq?: number;
  readonly openFile?: (path: string) => void;
  readonly t?: Translate;
}

export function DeliverablesRow({ matched, t }: DeliverablesRowProps) {
  const tt = cardT(t);
  const articles = matched;
  if (!articles || articles.length === 0) return null;
  const clickable = isOverlayAvailable();
  return (
    <div className="ww-chatcard ww-chatcard--tail">
      <div className="ww-chatcard__tailhead">
        <Icon name="file-text" size={12} />
        <span className="ww-chatcard__kind">
          {tt('chat.deliverables')}（{articles.length}）
        </span>
      </div>
      <ul className="ww-chatcard__taillist">
        {articles.map((article) => (
          <li key={article.articleId} className="ww-chatcard__tailitem">
            {clickable ? (
              <button
                type="button"
                className="ww-chatcard__tailbtn"
                data-testid="ww-chatcard-tail-article"
                onClick={() => openOverlayWithArticle(article.articleId)}
              >
                <span className="ww-chatcard__title" title={article.title}>
                  《{article.title}》
                </span>
                <span className={article.state === 'pushed' ? 'ww-chatcard__chip ww-chatcard__chip--ok' : 'ww-chatcard__chip'}>
                  {article.state === 'pushed' ? tt('chat.state.pushed') : tt('chat.state.drafted')}
                </span>
              </button>
            ) : (
              <>
                <span className="ww-chatcard__title" title={article.title}>
                  《{article.title}》
                </span>
                <span className={article.state === 'pushed' ? 'ww-chatcard__chip ww-chatcard__chip--ok' : 'ww-chatcard__chip'}>
                  {article.state === 'pushed' ? tt('chat.state.pushed') : tt('chat.state.drafted')}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
