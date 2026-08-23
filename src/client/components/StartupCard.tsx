import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useStore } from '../store';
import { Icon } from './Icon';

/**
 * 启动卡（StartupCard，uiux-workbench-delta §1-4，L4）：零文章时工作区主区唯一大卡。
 * 主题输入 + 「开始写作」accent CTA + 次级入口「去选题中心挑热榜」；
 * 未配置公众号凭据时追加卡底 helper「先配置公众号凭据」（可见路径 ≤2）。
 * 空输入 CTA 不 disabled（点击/Enter 聚焦输入框）；提交后就地转进度，不整页跳走。
 * snapshot.articles ≥ 1 后本卡不再渲染（退位条件由 WorkbenchPanel 控制）。
 * inputRef：窄态空库时由 WorkbenchPanel 传入——ww-rail-select「新文章」引导聚焦本输入框（A04）。
 */

export function StartupCard({ inputRef: externalInputRef }: { inputRef?: RefObject<HTMLInputElement> }) {
  const store = useStore();
  const { snapshot, navigate, startGeneration } = store;
  const [topic, setTopic] = useState('');
  const [starting, setStarting] = useState(false);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  // 类型注：局部 ref 是 MutableRefObject<HTMLInputElement | null>、外部 prop 是 RefObject<HTMLInputElement>，
  // 两者 current 同为 HTMLInputElement | null、各自可赋给 input 的 ref prop（联合类型的两员都合法）；
  // 勿把 prop 声明成 RefObject<HTMLInputElement | null>——TS 对同泛型引用走 variance 快速通道会误判不兼容。
  const inputRef = externalInputRef ?? localInputRef;

  const wechatConfigured =
    snapshot.status === 'ready' &&
    (snapshot.data.config.credentials['WEWRITE_WECHAT_SECRET']?.configured ?? false) &&
    snapshot.data.config.settings.wechatAppId.length > 0;

  async function handleStart() {
    const trimmed = topic.trim();
    if (!trimmed) {
      // v2 §3-01：空输入不 disabled——点击/Enter 聚焦输入框。
      inputRef.current?.focus();
      return;
    }
    if (starting) return;
    setStarting(true);
    const theme = snapshot.status === 'ready' ? snapshot.data.config.settings.defaultTheme : undefined;
    const llm = snapshot.status === 'ready' ? snapshot.data.config.settings.llmDefault : undefined;
    await startGeneration({ topicMode: 'fixed', topic: trimmed, theme, imageCount: 1, llm }, trimmed);
    setStarting(false);
    setTopic('');
  }

  return (
    <section className="ww-startup" aria-label="开始写作" data-testid="ww-startup">
      <span className="ww-startup__glyph">
        <Icon name="pen-line" size={20} className="ww-startup__glyph-main" />
        <span className="ww-startup__glyph-sub">
          <Icon name="sparkles" size={12} />
        </span>
      </span>
      <h2 className="ww-startup__title">开始你的第一篇文章</h2>
      <p className="ww-startup__subtitle">输入主题，管线接管成稿</p>
      <div className="ww-startup__form">
        <input
          ref={inputRef}
          type="text"
          className="ww-startup__input"
          data-testid="ww-startup-input"
          placeholder="输入主题，直接开写…"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleStart();
          }}
          aria-label="文章主题"
        />
        <Button
          variant="primary"
          size="md"
          className="ww-btn-accent"
          data-testid="ww-startup-submit"
          icon={<Icon name="arrow-right" size={16} />}
          onClick={() => void handleStart()}
          disabled={starting}
        >
          {starting ? '启动中…' : '开始写作'}
        </Button>
      </div>
      <div className="ww-startup__alts">
        <Button
          variant="ghost"
          size="sm"
          data-testid="ww-startup-alt-hotspots"
          icon={<Icon name="flame" size={16} />}
          onClick={() => navigate({ kind: 'hotspots' })}
        >
          去选题中心挑热榜
        </Button>
      </div>
      {!wechatConfigured ? (
        <button
          type="button"
          className="ww-startup__helper"
          data-testid="ww-startup-alt-settings"
          onClick={() => navigate({ kind: 'settings' })}
        >
          <Icon name="settings" size={12} /> 先配置公众号凭据
        </button>
      ) : null}
    </section>
  );
}
