import type { InputZonePropsLike } from '../lib/context';
import { Icon } from '../components/Icon';
import { cardT } from '../chat/card-text';
import { setOverlayOpen } from '../chat/overlay-bridge';

/**
 * composer「写作」入口（conversation.input.right，M3 / uiux §5.1）。
 *
 * Spec 裁决（§9 AC-M3-02 修正版）：28px pen-line 图标钮，点击**直接打开写作台
 * 浮层**——无菜单（composer 工具行寸土寸金，一个图标一个确定性动作）。
 * 不抢输入框焦点、不插入任何文本。
 * S8 纪律：owner（InputZone）是 point-in-time 快照，本组件不自订阅、不读宿主态。
 */
export function WewriteComposerButton(_props: InputZonePropsLike) {
  const t = cardT();
  return (
    <div className="ww-composer-entry">
      <button
        type="button"
        className="ww-composer-entry__btn"
        data-testid="ww-composer-entry"
        aria-label={t('chat.workbenchEntry')}
        title={t('chat.workbenchEntry')}
        onClick={() => setOverlayOpen(true)}
      >
        <Icon name="pen-line" size={16} />
      </button>
    </div>
  );
}
