/**
 * 定时任务存取（service 拆分，单文件 <=300 行纪律）：
 * save（归一化 + revision++ + 投影计算）/ delete / toggle / runNow。
 * publishTarget 恒 'draft'（AC-10：类型层不可达群发）。
 */

import { randomUUID } from 'node:crypto';
import type { RunParams, ScheduleViewModel } from '../shared/contract';
import type { ScheduleRecord } from './domain';
import { computeNextRunAt, normalizeRrule } from './scheduler/rrule';
import type { DomainTables } from './store';
import { scheduleToView } from './views';
import { WewriteServiceError } from './service-errors';

export interface ScheduleStoreDeps {
  readonly tables: DomainTables;
  readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly nowIso: () => string;
  readonly startRun: (schedule: ScheduleRecord) => { runId: string };
}

export interface SaveScheduleInput {
  readonly id?: string;
  readonly name: string;
  readonly rrule: string;
  readonly timeZone: string;
  readonly params: RunParams;
  readonly enabled: boolean;
}

export class ScheduleStore {
  constructor(private readonly deps: ScheduleStoreDeps) {}

  async save(input: SaveScheduleInput): Promise<ScheduleViewModel> {
    return this.deps.serialize(async () => {
      const now = this.deps.nowIso();
      const normalized = normalizeRrule(input.rrule);
      const existing = input.id ? this.deps.tables.schedules.get(input.id) : undefined;
      const record: ScheduleRecord = {
        v: 1,
        id: existing?.id ?? `sch_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
        revision: (existing?.revision ?? 0) + 1,
        name: input.name,
        rrule: normalized,
        timeZone: input.timeZone,
        params: input.params,
        publishTarget: 'draft',
        enabled: input.enabled,
        nextRunAt: computeNextRunAt(normalized, input.timeZone, new Date(now)),
        ...(existing?.lastRunAt ? { lastRunAt: existing.lastRunAt } : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await this.deps.tables.schedules.put(record.id, record);
      return scheduleToView(record);
    });
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    return this.deps.serialize(async () => ({ deleted: await this.deps.tables.schedules.delete(id) }));
  }

  async toggle(id: string, enabled: boolean): Promise<ScheduleViewModel> {
    return this.deps.serialize(async () => {
      const record = this.deps.tables.schedules.get(id);
      if (!record) throw new WewriteServiceError('schedule-not-found', `定时任务不存在：${id}`);
      const next = { ...record, enabled, updatedAt: this.deps.nowIso() };
      await this.deps.tables.schedules.put(id, next);
      return scheduleToView(next);
    });
  }

  runNow(id: string): { runId: string } {
    const record = this.deps.tables.schedules.get(id);
    if (!record) throw new WewriteServiceError('schedule-not-found', `定时任务不存在：${id}`);
    return this.deps.startRun(record);
  }
}
