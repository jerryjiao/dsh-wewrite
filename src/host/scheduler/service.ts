/**
 * 调度服务（ADR-004，dsh-automation durable occurrence claim 模式）：
 * - createOccurrenceClaimer：同刻恰好一次派发（持久层 + 内存集，串行化竞态）
 * - scanOccurrences：三桶分类（toFire / missed / 未来不动）——misfire 宽限语义（AC-11）
 * - createSchedulerService：宿主内时钟——到期 claim 后派发 run；publishTarget 恒 'draft'
 */

import type { ScheduleRecord } from '../domain';
import { computeNextRunAt } from './rrule';

/** misfire 宽限（QA 契约 §7.2-7 钉定 10 分钟）。 */
export const DEFAULT_MISFIRE_GRACE_MS = 10 * 60 * 1000;
export const DEFAULT_SCHEDULER_TICK_MS = 30 * 1000;

export interface OccurrencePersist {
  load(): Promise<readonly string[]>;
  save(key: string): Promise<void>;
}

export interface OccurrenceClaimer {
  claim(key: string): Promise<boolean>;
}

/** durable claim：构造时载入持久层已 claim 键；claim 串行化（链式 promise），同刻并发恰好一个成功。 */
export function createOccurrenceClaimer(persist: OccurrencePersist): OccurrenceClaimer {
  const claimed = new Set<string>();
  let tail: Promise<unknown> = persist
    .load()
    .then((keys) => {
      for (const key of keys) claimed.add(key);
    })
    .catch(() => undefined);
  return {
    claim(key: string): Promise<boolean> {
      const result = tail.then(async () => {
        if (claimed.has(key)) return false;
        claimed.add(key);
        await persist.save(key);
        return true;
      });
      tail = result;
      return result;
    },
  };
}

export interface OccurrenceScan {
  readonly toFire: readonly string[];
  readonly missed: readonly string[];
}

/** 宽限窗内到期 -> toFire；超窗 -> missed（错过即错过，无云端补偿，AC-11）；未来 -> 两桶都不进。 */
export function scanOccurrences(occurrences: readonly string[], now: Date, graceMs: number): OccurrenceScan {
  const nowMs = now.getTime();
  const toFire: string[] = [];
  const missed: string[] = [];
  for (const occurrence of occurrences) {
    const at = Date.parse(occurrence);
    if (Number.isNaN(at) || at > nowMs) continue;
    if (nowMs - at <= graceMs) toFire.push(occurrence);
    else missed.push(occurrence);
  }
  return { toFire, missed };
}

export interface SchedulerDeps {
  readonly loadSchedules: () => Promise<readonly ScheduleRecord[]>;
  readonly saveSchedule: (record: ScheduleRecord) => Promise<void>;
  readonly claim: (key: string) => Promise<boolean>;
  readonly startRun: (schedule: ScheduleRecord, occurrence: string) => Promise<string>;
  readonly now?: () => Date;
}

export interface SchedulerOptions {
  readonly graceMs?: number;
  readonly tickMs?: number;
}

export interface PumpReport {
  readonly fired: number;
  readonly missed: number;
}

export function createSchedulerService(deps: SchedulerDeps, options: SchedulerOptions = {}) {
  const graceMs = options.graceMs ?? DEFAULT_MISFIRE_GRACE_MS;
  const tickMs = options.tickMs ?? DEFAULT_SCHEDULER_TICK_MS;
  const now = deps.now ?? (() => new Date());
  let timer: ReturnType<typeof setInterval> | null = null;
  let pumping = false;

  async function pumpOnce(): Promise<PumpReport> {
    const current = now();
    let fired = 0;
    let missed = 0;
    const schedules = await deps.loadSchedules();
    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      const next = computeNextRunAt(schedule.rrule, schedule.timeZone, current);
      const scan = scanOccurrences([next], current, graceMs);
      missed += scan.missed.length;
      if (scan.toFire.length === 0) {
        if (next !== schedule.nextRunAt) {
          await deps.saveSchedule({ ...schedule, nextRunAt: next, updatedAt: current.toISOString() });
        }
        continue;
      }
      const occurrenceKey = `${schedule.id}:${next}`;
      const claimed = await deps.claim(occurrenceKey);
      const after = computeNextRunAt(schedule.rrule, schedule.timeZone, new Date(current.getTime() + 1));
      if (claimed) {
        await deps.startRun(schedule, occurrenceKey);
        fired += 1;
        await deps.saveSchedule({
          ...schedule,
          nextRunAt: after,
          lastRunAt: current.toISOString(),
          updatedAt: current.toISOString(),
        });
      } else {
        await deps.saveSchedule({ ...schedule, nextRunAt: after, updatedAt: current.toISOString() });
      }
    }
    return { fired, missed };
  }

  async function pumpGuarded(): Promise<PumpReport | null> {
    if (pumping) return null;
    pumping = true;
    try {
      return await pumpOnce();
    } finally {
      pumping = false;
    }
  }

  return {
    pumpOnce: pumpGuarded,
    start(): void {
      if (timer) return;
      timer = setInterval(() => {
        void pumpGuarded().catch(() => undefined);
      }, tickMs);
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
