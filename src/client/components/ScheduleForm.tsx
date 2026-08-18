import { useMemo, useState } from 'react';
import { Button, Input, Modal, Pill } from '@deepseek-ai/dsh-client-ui-primitives';
import { buildRrule, describeRrule, parseRruleForm } from '../lib/format';
import { CodeChip } from './bits';
import { Icon } from './Icon';

/**
 * 新建/改期定时弹层（DESIGN §9.5 Modal）：时间 + 重复规则（一次/每天/每周几）
 * 实时翻译成 RRULE 等宽原文展示；目标 = 草稿箱，默认锁定（发布纪律 AC-10）。
 * initial 带 id 时为改期模式（schedule/save 回传 id 触发 revision++）。
 */

export interface ScheduleFormRequest {
  id?: string;
  name: string;
  rrule: string;
  timeZone: string;
}

export interface ScheduleFormInitial {
  /** 存在时为改期模式（schedule/save 回传 id 触发 revision++）。 */
  id?: string;
  /** 预填任务名（编辑器入口 = 文章标题）。 */
  name: string;
  /** 预填重复规则；缺省用 每天 09:30。 */
  rrule?: string;
}

const WEEKDAYS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'MO', label: '周一' },
  { id: 'TU', label: '周二' },
  { id: 'WE', label: '周三' },
  { id: 'TH', label: '周四' },
  { id: 'FR', label: '周五' },
  { id: 'SA', label: '周六' },
  { id: 'SU', label: '周日' },
];

export function ScheduleForm({
  open,
  initial,
  submitLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  initial?: ScheduleFormInitial;
  submitLabel: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (request: ScheduleFormRequest) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [hour, setHour] = useState(initial?.rrule ? parseRruleForm(initial.rrule).hour : 9);
  const [minute, setMinute] = useState(initial?.rrule ? parseRruleForm(initial.rrule).minute : 30);
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>(initial?.rrule ? parseRruleForm(initial.rrule).repeat : 'daily');
  const [weekday, setWeekday] = useState(initial?.rrule ? parseRruleForm(initial.rrule).weekday : 'MO');

  const rrule = useMemo(() => buildRrule(repeat, weekday, hour, minute), [repeat, weekday, hour, minute]);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const nameInvalid = name.trim().length === 0;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={initial?.id ? `改期：${initial.name}` : '定时到草稿箱'}
      closeLabel="取消"
      description="到达计划时刻后自动跑管线并把成稿推进公众号草稿箱。"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
          <Button variant="primary" size="sm" className="ww-btn-accent" onClick={() => onSubmit({ id: initial?.id, name: name.trim(), rrule, timeZone })} disabled={busy || nameInvalid}>
            {busy ? '保存中…' : submitLabel}
          </Button>
        </>
      }
    >
      <div className="ww-schedule-form">
        <label className="ww-field">
          <span className="ww-field__label">任务名</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="如：每日早四点" aria-label="任务名" />
        </label>
        <div className="ww-field-row">
          <label className="ww-field ww-field--time">
            <span className="ww-field__label">时刻</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(event) => setHour(clamp(parseInt(event.target.value, 10), 0, 23))}
              aria-label="小时"
            />
            <span className="ww-field__colon">:</span>
            <Input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(event) => setMinute(clamp(parseInt(event.target.value, 10), 0, 59))}
              aria-label="分钟"
            />
          </label>
        </div>
        <div className="ww-field">
          <span className="ww-field__label">重复</span>
          <div className="ww-field__pills" role="radiogroup" aria-label="重复规则">
            <Pill active={repeat === 'once'} onClick={() => setRepeat('once')}>一次</Pill>
            <Pill active={repeat === 'daily'} onClick={() => setRepeat('daily')}>每天</Pill>
            <Pill active={repeat === 'weekly'} onClick={() => setRepeat('weekly')}>每周</Pill>
          </div>
          {repeat === 'weekly' ? (
            <div className="ww-field__pills" role="radiogroup" aria-label="星期">
              {WEEKDAYS.map((day) => (
                <Pill key={day.id} active={weekday === day.id} onClick={() => setWeekday(day.id)}>
                  {day.label}
                </Pill>
              ))}
            </div>
          ) : null}
        </div>
        <div className="ww-rrule-preview">
          <span className="ww-rrule-preview__label">
            <Icon name="calendar-clock" size={16} /> {describeRrule(rrule)}
          </span>
          <CodeChip>{rrule}</CodeChip>
        </div>
        <p className="ww-field-note">发布目标：草稿箱（锁定）——群发不可撤回，v0.1 不提供自动群发。</p>
      </div>
    </Modal>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
