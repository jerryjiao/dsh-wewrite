import { useMemo, useState } from 'react';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { RunSummary, ScheduleViewModel } from '@/shared/contract';
import { describeRrule, formatDateTime, formatDuration, formatShortDateTime } from '../lib/format';
import { EmptyState, ErrorNote, runStatusBadge, SkeletonBlock, StatusBadge } from '../components/bits';
import { ScheduleForm } from '../components/ScheduleForm';
import { Icon } from '../components/Icon';
import { useStore } from '../store';

/**
 * 定时任务（DESIGN §9.5）：排队队列（ScheduleCard）+ 执行历史（trigger=schedule 的 run 时间线）。
 * ScheduleCard = RRULE 等宽原文 + 人类可读翻译双行；新建/改期走 ScheduleForm（目标恒草稿箱）。
 */

export function SchedulePanel() {
  const store = useStore();
  const { snapshot, refreshSnapshot, rpc, toast, t } = store;
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [editing, setEditing] = useState<{ id: string; name: string; rrule: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const schedules = snapshot.status === 'ready' ? snapshot.data.schedules : undefined;
  const runs = snapshot.status === 'ready' ? snapshot.data.runs : undefined;
  const articles = snapshot.status === 'ready' ? snapshot.data.articles : undefined;

  /** 历史行主题：优先 scheduleId → 排期名，其次 articleId → 文章标题（真实契约字段推导）。 */
  function topicOf(run: RunSummary): string {
    const schedule = schedules?.find((item) => item.id === run.scheduleId);
    if (schedule) return schedule.name;
    const article = articles?.find((item) => item.id === run.articleId);
    return article?.title ?? '未命名主题';
  }

  const queue = useMemo<ScheduleViewModel[]>(
    () =>
      (schedules ?? [])
        .slice()
        .sort((a, b) => (a.nextRunAt ?? '9999').localeCompare(b.nextRunAt ?? '9999')),
    [schedules],
  );
  const history = useMemo<RunSummary[]>(
    () => (runs ?? []).filter((run) => run.trigger === 'schedule').sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')),
    [runs],
  );

  async function toggle(schedule: ScheduleViewModel) {
    setBusyId(schedule.id);
    try {
      await rpc.call('schedule/toggle', { id: schedule.id, enabled: !schedule.enabled });
      await refreshSnapshot();
    } catch (error) {
      toast.push({ kind: 'error', title: '操作失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(schedule: ScheduleViewModel) {
    setBusyId(schedule.id);
    try {
      await rpc.call<{ runId: string }>('schedule/runNow', { id: schedule.id });
      toast.push({ kind: 'info', title: '已派发一次手动执行', detail: schedule.name });
      await refreshSnapshot();
    } catch (error) {
      toast.push({ kind: 'error', title: '派发失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(schedule: ScheduleViewModel) {
    setBusyId(schedule.id);
    try {
      await rpc.call<{ deleted: boolean }>('schedule/delete', { id: schedule.id });
      toast.push({ kind: 'success', title: '已删除排期', detail: schedule.name });
      await refreshSnapshot();
    } catch (error) {
      toast.push({ kind: 'error', title: '删除失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function submitForm(request: { id?: string; name: string; rrule: string; timeZone: string }) {
    setFormBusy(true);
    try {
      await rpc.call('schedule/save', request.id
        ? { id: request.id, name: request.name, rrule: request.rrule, timeZone: request.timeZone, params: { topicMode: 'hotspots' }, enabled: true }
        : { name: request.name, rrule: request.rrule, timeZone: request.timeZone, params: { topicMode: 'hotspots' }, enabled: true });
      toast.push({ kind: 'success', title: request.id ? '已改期' : '已创建定时任务', detail: request.name });
      setFormOpen(false);
      setEditing(null);
      await refreshSnapshot();
    } catch (error) {
      toast.push({ kind: 'error', title: '保存失败', detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setFormBusy(false);
    }
  }

  return (
    <div className="ww-schedule">
      <div className="ww-pagebar">
        {/* Bluewash §4-2：定时域页头识别点（青） */}
        <span className="ww-pagebar__dot" data-view="schedule" />
        <h2 className="ww-pagebar__title">定时任务</h2>
        {schedules ? <span className="ww-pagebar__count">· {queue.length}</span> : null}
        <div className="ww-pagebar__spacer" />
        <div className="ww-pagebar__aside">
          <div className="ww-view-tabs" role="tablist" aria-label="定时任务视图">
            <button type="button" role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'ww-view-tab ww-view-tab--active' : 'ww-view-tab'} onClick={() => setTab('queue')}>
              排队中（{queue.length}）
            </button>
            <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'ww-view-tab ww-view-tab--active' : 'ww-view-tab'} onClick={() => setTab('history')}>
              全部历史（{history.length}）
            </button>
          </div>
          <Button variant="primary" size="sm" className="ww-btn-accent" icon={<Icon name="plus" size={16} />} onClick={() => setFormOpen(true)}>
            新建定时
          </Button>
        </div>
      </div>

      {snapshot.status === 'loading' ? (
        <SkeletonBlock lines={4} />
      ) : snapshot.status === 'error' ? (
        <ErrorNote
          title="定时任务读取失败（存储不可用）。"
          action={<Button variant="outline" size="sm" onClick={() => void refreshSnapshot()}>{t('action.retry')}</Button>}
        />
      ) : tab === 'queue' ? (
        queue.length === 0 ? (
          <EmptyState
            icon={<Icon name="clock" size={20} />}
            subIcon="plus"
            title="队列是空的。在编辑器里点「推草稿箱 ▾ → 定时」，或从选题中心创建每日选题任务。"
            action={
              <Button variant="outline" size="sm" icon={<Icon name="plus" size={16} />} onClick={() => setFormOpen(true)}>
                新建定时
              </Button>
            }
          />
        ) : (
          <ul className="ww-schedule-list">
            {queue.map((schedule) => {
              const paused = !schedule.enabled;
              return (
                <li key={schedule.id} className={paused ? 'ww-schedule-card ww-schedule-card--paused' : 'ww-schedule-card'}>
                  <div className="ww-schedule-card__head">
                    <Icon name="calendar-clock" size={16} />
                    <span className="ww-schedule-card__name">《{schedule.name}》</span>
                    {paused ? <StatusBadge tone="warning" label="已暂停" /> : <StatusBadge tone="ongoing" label="已排期" />}
                  </div>
                  <div className="ww-schedule-card__body">
                    {/* P4：RRULE 代码不再当正文展示；原文移入人话行 title 供悬停查看 */}
                    <p className="ww-schedule-card__human" title={schedule.rrule}>
                      {describeRrule(schedule.rrule)} · 下次 {formatDateTime(schedule.nextRunAt)}
                    </p>
                    <p className="ww-schedule-card__target">发布目标：草稿箱（锁定）</p>
                  </div>
                  <div className="ww-schedule-card__actions">
                    <Button variant="ghost" size="sm" icon={<Icon name={schedule.enabled ? 'pause' : 'play'} size={16} />} onClick={() => void toggle(schedule)} disabled={busyId === schedule.id}>
                      {schedule.enabled ? '暂停' : '恢复'}
                    </Button>
                    <Menu
                      open={menuOpenId === schedule.id}
                      anchor={
                        <button
                          type="button"
                          className="ww-schedule-card__more"
                          aria-label={`更多操作：${schedule.name}`}
                          aria-expanded={menuOpenId === schedule.id}
                          aria-haspopup="menu"
                          onClick={() => setMenuOpenId(menuOpenId === schedule.id ? null : schedule.id)}
                        >
                          <Icon name="ellipsis" size={16} />
                        </button>
                      }
                      items={[
                        {
                          id: 'reschedule',
                          label: '改期',
                          icon: <Icon name="calendar-clock" size={16} />,
                        },
                        {
                          id: 'runNow',
                          label: '立即执行',
                          icon: <Icon name="play" size={16} />,
                        },
                        {
                          id: 'delete',
                          label: '删除',
                          icon: <Icon name="trash-2" size={16} />,
                          danger: true,
                        },
                      ]}
                      onSelect={(id) => {
                        setMenuOpenId(null);
                        if (id === 'reschedule') {
                          setEditing({ id: schedule.id, name: schedule.name, rrule: schedule.rrule });
                          setFormOpen(true);
                        } else if (id === 'runNow') {
                          void runNow(schedule);
                        } else {
                          void remove(schedule);
                        }
                      }}
                      onClose={() => setMenuOpenId(null)}
                      align="end"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : history.length === 0 ? (
        <EmptyState icon={<Icon name="history" size={20} />} subIcon="clock" title="还没有定时执行记录。创建排期后，每次触发都会在这里留痕。" />
      ) : (
        <ul className="ww-history">
          {history.map((run) => {
            const badge = runStatusBadge(run.status);
            return (
              <li key={run.id} className="ww-history__item">
                <span className="ww-history__time">{formatShortDateTime(run.startedAt)}</span>
                <StatusBadge tone={badge.tone} label={badge.label} />
                <span className="ww-history__topic">《{topicOf(run)}》</span>
                <span className="ww-history__duration">{formatDuration(run.startedAt, run.finishedAt)}</span>
                {run.error ? <span className="ww-history__error">{run.error.message}</span> : null}
              </li>
            );
          })}
        </ul>
      )}

      <ScheduleForm
        key={editing?.id ?? 'new'}
        open={formOpen}
        initial={editing ?? undefined}
        submitLabel={editing ? '保存改期' : '创建定时'}
        busy={formBusy}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(request) => void submitForm(request)}
      />
    </div>
  );
}
