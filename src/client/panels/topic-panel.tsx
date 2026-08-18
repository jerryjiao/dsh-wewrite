import { useMemo, useState } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ArticleListItem, RunSummary, ScheduleViewModel } from '@/shared/contract';
import { gateStatusForArticle } from '../lib/gate';
import { formatTime, formatAgo } from '../lib/format';
import { articleStatusBadge, EmptyState, SectionHeader, SkeletonRow } from '../components/bits';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

/**
 * 写作台（DESIGN §9.1）：今日待办 → 最近文章（≤6，非等宽）→ 底部主题输入条（sticky）。
 * 生成中显示「◐ 正在生成《…》」行（转入后台后的回望点）。
 */

interface TodoItem {
  key: string;
  icon: 'clock' | 'shield-alert' | 'flame';
  text: string;
  actionLabel: string;
  onAction: () => void;
}

export function TopicPanel() {
  const store = useStore();
  const { snapshot, navigate, startGeneration, generation, activeRun, t } = store;
  const [topic, setTopic] = useState('');
  const [starting, setStarting] = useState(false);

  const articles = snapshot.status === 'ready' ? snapshot.data.articles : undefined;
  const schedules = snapshot.status === 'ready' ? snapshot.data.schedules : undefined;
  const runs: readonly RunSummary[] = snapshot.status === 'ready' ? snapshot.data.runs : [];
  const wechatConfigured =
    snapshot.status === 'ready' &&
    (snapshot.data.config.credentials['WEWRITE_WECHAT_SECRET']?.configured ?? false) &&
    snapshot.data.config.settings.wechatAppId.length > 0;

  const todos = useMemo<TodoItem[]>(() => {
    if (!schedules || !articles) return [];
    const items: TodoItem[] = [];
    for (const schedule of enabledUpcoming(schedules)) {
      items.push({
        key: `sch-${schedule.id}`,
        icon: 'clock',
        text: `${formatTime(schedule.nextRunAt)} 排队发布《${schedule.name}》`,
        actionLabel: '查看',
        onAction: () => navigate({ kind: 'schedule' }),
      });
    }
    const gateBlocked = articles.filter((article) => gateStatusForArticle(runs, article).blocking);
    if (gateBlocked.length > 0) {
      items.push({
        key: 'gate-failed',
        icon: 'shield-alert',
        text: `门禁未过 ${gateBlocked.length} 篇 ·《${gateBlocked[0].title}》`,
        actionLabel: '去修复',
        onAction: () => navigate({ kind: 'article', id: gateBlocked[0].id }),
      });
    }
    return items;
  }, [schedules, articles, runs, navigate]);

  async function handleStart() {
    const trimmed = topic.trim();
    if (!trimmed || starting) return;
    setStarting(true);
    const theme = snapshot.status === 'ready' ? snapshot.data.config.settings.defaultTheme : undefined;
    const llm = snapshot.status === 'ready' ? snapshot.data.config.settings.llmDefault : undefined;
    await startGeneration({ topicMode: 'fixed', topic: trimmed, theme, imageCount: 1, llm }, trimmed);
    setStarting(false);
    setTopic('');
  }

  const generating = generation !== null && activeRun !== undefined && (activeRun.status === 'queued' || activeRun.status === 'running');

  return (
    <div className="ww-topic">
      <section className="ww-topic__section">
        <SectionHeader
          title={`今日待办（${todos.length}）`}
          aside={<span className="ww-topic__date">{formatAgo(snapshot.status === 'ready' ? snapshot.data.serverNow : undefined)}</span>}
        />
        {snapshot.status === 'loading' ? (
          <SkeletonRow cells={2} />
        ) : todos.length === 0 && !generating ? (
          <EmptyState
            icon={<Icon name="list-todo" size={20} />}
            title="还没有排队中的任务。先去选题中心挑一条热榜，或直接输入主题。"
            action={
              <Button variant="outline" size="sm" icon={<Icon name="flame" size={16} />} onClick={() => navigate({ kind: 'hotspots' })}>
                {wechatConfigured ? t('empty.action.hotspots') : t('empty.action.wechat')}
              </Button>
            }
          />
        ) : (
          <ul className="ww-topic__todos">
            {generating && generation ? (
              <li className="ww-topic__todo ww-topic__todo--live" key="generating">
                <Icon name="loader-circle" size={16} className="ww-spin" />
                <span className="ww-topic__todo-text">正在生成《{generation.topic}》</span>
                <button type="button" className="ww-link" onClick={() => store.setGenerationOverlay(true)}>
                  查看进度
                </button>
              </li>
            ) : null}
            {todos.map((item) => (
              <li className="ww-topic__todo" key={item.key}>
                <Icon name={item.icon} size={16} />
                <span className="ww-topic__todo-text">{item.text}</span>
                <button type="button" className="ww-link" onClick={item.onAction}>
                  {item.actionLabel}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ww-topic__section">
        <SectionHeader title="最近文章" />
        {snapshot.status === 'loading' ? (
          <SkeletonRow cells={3} />
        ) : !articles || articles.length === 0 ? (
          <EmptyState icon={<Icon name="file-text" size={20} />} title="第一篇还没诞生。上面输入主题，3 分钟后回来预览。" />
        ) : (
          <ul className="ww-topic__articles">
            {articles.slice(0, 6).map((article) => (
              <RecentArticleCard
                key={article.id}
                article={article}
                gate={runs.length > 0 ? gateStatusForArticle(runs, article) : undefined}
                onOpen={() => navigate({ kind: 'article', id: article.id })}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="ww-topic__composer">
        <Input
          icon={<Icon name="sparkles" size={16} />}
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
          className="ww-btn-accent"
          icon={<Icon name="arrow-right" size={16} />}
          onClick={() => void handleStart()}
          disabled={starting || topic.trim().length === 0}
        >
          {starting ? '启动中…' : t('action.startWriting')}
        </Button>
      </div>
    </div>
  );
}

function RecentArticleCard({ article, gate, onOpen }: { article: ArticleListItem; gate: { label: string; blocking: boolean } | undefined; onOpen: () => void }) {
  const badge = articleStatusBadge(article.status);
  return (
    <li>
      <button type="button" className="ww-article-card" onClick={onOpen} title={article.title}>
        <span className="ww-article-card__title">{article.title}</span>
        <span className={`ww-article-card__status ww-article-card__status--${badge.tone}`}>
          {badge.label} · {formatAgo(article.updatedAt)}
        </span>
        {gate ? (
          <span className={gate.blocking ? 'ww-article-card__gate ww-article-card__gate--fail' : 'ww-article-card__gate'}>门禁 {gate.label}</span>
        ) : null}
      </button>
    </li>
  );
}

function enabledUpcoming(schedules: ScheduleViewModel[]): ScheduleViewModel[] {
  return schedules
    .filter((schedule) => schedule.enabled && schedule.nextRunAt)
    .sort((a, b) => (a.nextRunAt ?? '').localeCompare(b.nextRunAt ?? ''))
    .slice(0, 3);
}
