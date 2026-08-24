import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { LaunchBrief } from '@/shared/contract';
import { useStore } from '../store';
import { Icon } from './Icon';

/**
 * 启动卡（StartupCard，uiux-workbench-delta §1-4，L4）：零文章时工作区主区唯一大卡。
 * 主题输入 + 「开始写作」accent CTA + 次级入口「去选题中心挑热榜」；
 * 未配置公众号凭据时追加卡底 helper「先配置公众号凭据」（可见路径 ≤2）。
 * 空输入 CTA 不 disabled（点击/Enter 聚焦输入框）；提交后就地转进度，不整页跳走。
 * snapshot.articles ≥ 1 后本卡不再渲染（退位条件由 WorkbenchPanel 控制）。
 * inputRef：窄态空库时由 WorkbenchPanel 传入——ww-rail-select「新文章」引导聚焦本输入框（A04）。
 * v0.5 启动 brief（docs/v0.5-launch-brief.md）：「更多信息」折叠区默认收起——快路径
 * 一句话零损伤；展开可带 标题/思路/大纲/来源 四项可选富输入（分层绑定合同）。
 */

const SOURCE_LINE_PATTERN = /^https?:\/\/\S+$/i;

export function StartupCard({ inputRef: externalInputRef }: { inputRef?: RefObject<HTMLInputElement> }) {
  const store = useStore();
  const { snapshot, navigate, startGeneration, toast } = store;
  const [topic, setTopic] = useState('');
  const [starting, setStarting] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [briefTitle, setBriefTitle] = useState('');
  const [approach, setApproach] = useState('');
  const [outlineText, setOutlineText] = useState('');
  const [sourcesText, setSourcesText] = useState('');
  const localInputRef = useRef<HTMLInputElement | null>(null);
  // 类型注：局部 ref 是 MutableRefObject<HTMLInputElement | null>、外部 prop 是 RefObject<HTMLInputElement>，
  // 两者 current 同为 HTMLInputElement | null、各自可赋给 input 的 ref prop（联合类型的两员都合法）；
  // 勿把 prop 声明成 RefObject<HTMLInputElement | null>——TS 对同泛型引用走 variance 快速通道会误判不兼容。
  const inputRef = externalInputRef ?? localInputRef;

  const wechatConfigured =
    snapshot.status === 'ready' &&
    (snapshot.data.config.credentials['WEWRITE_WECHAT_SECRET']?.configured ?? false) &&
    snapshot.data.config.settings.wechatAppId.length > 0;

  /** 富输入 → 启动 brief：空项全丢（一句话模式不带 brief）；非法来源行 toast 提示后丢弃。 */
  function buildBrief(): LaunchBrief | undefined {
    const title = briefTitle.trim();
    const trimmedApproach = approach.trim();
    const outline = outlineText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const sourceLines = sourcesText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const sources = sourceLines.filter((line) => SOURCE_LINE_PATTERN.test(line));
    const invalidCount = sourceLines.length - sources.length;
    if (invalidCount > 0) {
      toast.push({
        kind: 'error',
        title: `已忽略 ${invalidCount} 条来源`,
        detail: '来源必须是 http(s) 链接，每行一条',
      });
    }
    const brief: LaunchBrief = {
      ...(title ? { title } : {}),
      ...(trimmedApproach ? { approach: trimmedApproach } : {}),
      ...(outline.length ? { outline } : {}),
      ...(sources.length ? { sources } : {}),
    };
    return Object.keys(brief).length ? brief : undefined;
  }

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
    const brief = buildBrief();
    await startGeneration(
      {
        topicMode: 'fixed',
        topic: trimmed,
        ...(brief ? { brief } : {}),
        theme,
        imageCount: 1,
        llm,
      },
      trimmed,
    );
    setStarting(false);
    setTopic('');
    setBriefTitle('');
    setApproach('');
    setOutlineText('');
    setSourcesText('');
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
      <button
        type="button"
        className="ww-startup__more"
        data-testid="ww-startup-more-toggle"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((open) => !open)}
      >
        <Icon name={moreOpen ? 'chevron-up' : 'chevron-down'} size={12} />
        {moreOpen ? '收起更多信息' : '更多信息（标题 · 思路 · 大纲 · 来源）'}
      </button>
      {moreOpen ? (
        <div className="ww-startup__brief" data-testid="ww-startup-brief">
          <div className="ww-startup__field">
            <label className="ww-startup__label" htmlFor="ww-startup-brief-title">
              标题 <span className="ww-startup__hint">给了就是最终标题</span>
            </label>
            <input
              id="ww-startup-brief-title"
              type="text"
              className="ww-startup__input"
              data-testid="ww-startup-brief-title"
              placeholder="可选，≤64 字"
              value={briefTitle}
              onChange={(event) => setBriefTitle(event.target.value)}
            />
          </div>
          <div className="ww-startup__field">
            <label className="ww-startup__label" htmlFor="ww-startup-brief-approach">
              思路 <span className="ww-startup__hint">全文围绕这一主张展开</span>
            </label>
            <textarea
              id="ww-startup-brief-approach"
              className="ww-startup__input ww-startup__input--area"
              data-testid="ww-startup-brief-approach"
              placeholder="可选：一句话核心主张或总体思路"
              rows={2}
              value={approach}
              onChange={(event) => setApproach(event.target.value)}
            />
          </div>
          <div className="ww-startup__field">
            <label className="ww-startup__label" htmlFor="ww-startup-brief-outline">
              大纲 <span className="ww-startup__hint">节名原样保留，管线可补节</span>
            </label>
            <textarea
              id="ww-startup-brief-outline"
              className="ww-startup__input ww-startup__input--area"
              data-testid="ww-startup-brief-outline"
              placeholder="可选：每行一节"
              rows={4}
              value={outlineText}
              onChange={(event) => setOutlineText(event.target.value)}
            />
          </div>
          <div className="ww-startup__field">
            <label className="ww-startup__label" htmlFor="ww-startup-brief-sources">
              来源 <span className="ww-startup__hint">正文以可见 URL 引用，AI 不编造来源</span>
            </label>
            <textarea
              id="ww-startup-brief-sources"
              className="ww-startup__input ww-startup__input--area"
              data-testid="ww-startup-brief-sources"
              placeholder="可选：每行一条 http(s) 链接"
              rows={3}
              value={sourcesText}
              onChange={(event) => setSourcesText(event.target.value)}
            />
          </div>
        </div>
      ) : null}
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
