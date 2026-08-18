import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScheduleRecordSchema } from '@/host/domain';
import { RruleValidationError, computeNextRunAt, normalizeRrule } from '@/host/scheduler/rrule';
import {
  DEFAULT_MISFIRE_GRACE_MS,
  createOccurrenceClaimer,
  scanOccurrences,
} from '@/host/scheduler/service';

/**
 * 调度器测试：RRULE 归一化、nextRunAt 投影（Intl 时区，Asia/Shanghai 主用例）、
 * durable occurrence claim（同刻不双跑）、misfire 宽限（AC-11）、
 * publishTarget 恒 draft（AC-10 类型层不可达群发）+ 源码树 freepublish 扫描（Spec §12 步骤 7 自动化）。
 */

const sampleSchedule = () => ({
  v: 1,
  id: 'sch_1',
  revision: 1,
  name: '每日早四点',
  rrule: 'FREQ=DAILY;BYHOUR=4',
  timeZone: 'Asia/Shanghai',
  params: { topicMode: 'fixed' as const, topic: 'AI 写作' },
  publishTarget: 'draft' as const,
  enabled: true,
  nextRunAt: '2026-08-19T04:00:00+08:00',
});

describe('RRULE 归一化（Spec §6 schedules 约束）', () => {
  it('合法串归一化后可直接计算投影（round-trip）', () => {
    const normalized = normalizeRrule('FREQ=DAILY;BYHOUR=4');
    expect(typeof normalized).toBe('string');
    expect(normalized.length).toBeGreaterThan(0);
    const from = new Date(Date.UTC(2026, 7, 18, 2, 0));
    const viaRaw = computeNextRunAt('FREQ=DAILY;BYHOUR=4', 'Asia/Shanghai', from);
    const viaNormalized = computeNextRunAt(normalized, 'Asia/Shanghai', from);
    expect(new Date(viaNormalized).getTime()).toBe(new Date(viaRaw).getTime());
  });

  it('大小写归一：小写输入与规范输入产出一致', () => {
    expect(normalizeRrule('freq=daily;byhour=4')).toBe(normalizeRrule('FREQ=DAILY;BYHOUR=4'));
  });

  it('非法串抛 RruleValidationError（不吞、不返回原串）', () => {
    const invalidInputs = ['', 'garbage', 'BYHOUR=4', 'FREQ=BOGUS', 'FREQ=DAILY;BYHOUR=25', 'FREQ=DAILY;COUNT=0'];
    for (const raw of invalidInputs) {
      expect(() => normalizeRrule(raw), `输入: ${raw}`).toThrow(RruleValidationError);
    }
  });

  it('RruleValidationError 是 Error 子类', () => {
    expect(new RruleValidationError('bad rrule')).toBeInstanceOf(Error);
  });
});

describe('nextRunAt 投影计算（Asia/Shanghai 主用例）', () => {
  it('每日 4 点：当天 4 点已过取次日，未到取当天（北京时间语义）', () => {
    const nextAfter10am = computeNextRunAt('FREQ=DAILY;BYHOUR=4', 'Asia/Shanghai', new Date(Date.UTC(2026, 7, 18, 2, 0)));
    expect(new Date(nextAfter10am).getTime()).toBe(Date.UTC(2026, 7, 18, 20, 0)); // 08-19 04:00+08

    const nextBefore4am = computeNextRunAt('FREQ=DAILY;BYHOUR=4', 'Asia/Shanghai', new Date(Date.UTC(2026, 7, 17, 19, 0)));
    expect(new Date(nextBefore4am).getTime()).toBe(Date.UTC(2026, 7, 17, 20, 0)); // 08-18 04:00+08
  });

  it('每周一：从周二起取下周一 0 点（北京时间语义）', () => {
    const fromTuesday = new Date(Date.UTC(2026, 7, 18, 0, 0)); // 2026-08-18 周二
    const next = computeNextRunAt('FREQ=WEEKLY;BYDAY=MO', 'Asia/Shanghai', fromTuesday);
    expect(new Date(next).getTime()).toBe(Date.UTC(2026, 7, 23, 16, 0)); // 08-24 00:00+08
  });

  it('每月 1 号：从 8 月 18 日起取 9 月 1 日 0 点（北京时间语义）', () => {
    const next = computeNextRunAt('FREQ=MONTHLY;BYMONTHDAY=1', 'Asia/Shanghai', new Date(Date.UTC(2026, 7, 18, 0, 0)));
    expect(new Date(next).getTime()).toBe(Date.UTC(2026, 7, 31, 16, 0)); // 09-01 00:00+08
  });

  it('同一时刻同一规则，不同时区产出不同投影（时区真正参与计算）', () => {
    const from = new Date(Date.UTC(2026, 7, 18, 10, 0));
    const shanghai = computeNextRunAt('FREQ=DAILY;BYHOUR=4', 'Asia/Shanghai', from);
    const newYork = computeNextRunAt('FREQ=DAILY;BYHOUR=4', 'America/New_York', from);

    expect(new Date(shanghai).getTime()).toBe(Date.UTC(2026, 7, 18, 20, 0)); // 北京次日 04:00
    expect(new Date(newYork).getTime()).toBe(Date.UTC(2026, 7, 19, 8, 0)); // 纽约次日 04:00 EDT
    expect(new Date(shanghai).getTime()).not.toBe(new Date(newYork).getTime());
  });

  it('非法 timeZone 在投影计算处抛错（fail fast）', () => {
    expect(() => computeNextRunAt('FREQ=DAILY;BYHOUR=4', 'Mars/Olympus', new Date())).toThrow();
  });
});

describe('durable occurrence claim（同刻不双跑，ADR-004）', () => {
  const makePersist = () => {
    const claimedKeys: string[] = [];
    return {
      load: async () => [...claimedKeys],
      save: async (key: string) => {
        claimedKeys.push(key);
      },
      claimedKeys,
    };
  };

  it('同一 occurrence 二次 claim 返回 false', async () => {
    const persist = makePersist();
    const claimer = createOccurrenceClaimer(persist);
    const key = 'sch_1:2026-08-19T04:00:00+08:00';

    await expect(claimer.claim(key)).resolves.toBe(true);
    await expect(claimer.claim(key)).resolves.toBe(false);
    expect(persist.claimedKeys).toEqual([key]);
  });

  it('durable：重启后（新实例共享持久层）已 claim 的 occurrence 仍拒绝', async () => {
    const persist = makePersist();
    const key = 'sch_1:2026-08-20T04:00:00+08:00';
    await createOccurrenceClaimer(persist).claim(key);

    const rebornClaimer = createOccurrenceClaimer(persist);
    await expect(rebornClaimer.claim(key)).resolves.toBe(false);
    await expect(rebornClaimer.claim('sch_1:2026-08-21T04:00:00+08:00')).resolves.toBe(true);
  });

  it('并发同刻 claim：恰好一个成功', async () => {
    const persist = makePersist();
    const claimer = createOccurrenceClaimer(persist);
    const key = 'sch_2:2026-08-19T04:00:00+08:00';

    const results = await Promise.all([claimer.claim(key), claimer.claim(key), claimer.claim(key)]);
    expect(results.filter((ok: boolean) => ok === true).length).toBe(1);
    expect(persist.claimedKeys.length).toBe(1);
  });
});

describe('misfire 宽限（AC-11：错过即错过 + 提示错过数）', () => {
  it('DEFAULT_MISFIRE_GRACE_MS 锚定 10 分钟', () => {
    expect(DEFAULT_MISFIRE_GRACE_MS).toBe(10 * 60 * 1000);
  });

  it('宽限窗内到期 -> toFire；超窗 -> missed；未来 -> 两桶都不进', () => {
    const now = new Date(Date.UTC(2026, 7, 18, 4, 0, 0));
    const withinGrace = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const tooLate = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const future = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    const result = scanOccurrences([tooLate, withinGrace, future], now, DEFAULT_MISFIRE_GRACE_MS);

    expect(result.toFire).toEqual([withinGrace]);
    expect(result.missed).toEqual([tooLate]);
  });

  it('错过计数 = missed 桶长度（启动提示错过数的直接数据源）', () => {
    const now = new Date(Date.UTC(2026, 7, 18, 4, 0, 0));
    const occurrences = [1, 2, 3].map((d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString());
    const result = scanOccurrences(occurrences, now, DEFAULT_MISFIRE_GRACE_MS);
    expect(result.missed.length).toBe(3);
    expect(result.toFire.length).toBe(0);
  });
});

describe('AC-10：publishTarget 恒 draft（类型层不可达群发）', () => {
  it('ScheduleRecordSchema 接受 publishTarget=draft', () => {
    expect(ScheduleRecordSchema.safeParse(sampleSchedule()).success).toBe(true);
  });

  it('ScheduleRecordSchema 拒绝 publishTarget=publish 与 freepublish', () => {
    expect(ScheduleRecordSchema.safeParse({ ...sampleSchedule(), publishTarget: 'publish' }).success).toBe(false);
    expect(ScheduleRecordSchema.safeParse({ ...sampleSchedule(), publishTarget: 'freepublish' }).success).toBe(false);
    expect(ScheduleRecordSchema.safeParse({ ...sampleSchedule(), publishTarget: 'mass' }).success).toBe(false);
  });
});

describe('AC-10：源码树无 freepublish 调用路径（Spec §12 步骤 7 的自动化）', () => {
  it('src/ 下全部 ts/tsx/css 文件不出现 freepublish 字样', () => {
    const projectRoot = join(__dirname, '..', '..');
    const srcRoot = join(projectRoot, 'src');
    const files: string[] = [];
    const walk = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === 'lib') continue;
          walk(full);
        } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    walk(srcRoot);
    // src/ 在 Phase 3 完成后必有实现文件；当前扫描面可能为空（工具级配置文件除外），
    // 但断言本身对每个存在的文件逐一执行——一旦有文件即生效。
    const offenders = files
      .map((file) => ({ file, content: readFileSync(file, 'utf8') }))
      .filter(({ content }) => /freepublish/i.test(content));
    expect(
      offenders.map(({ file }) => file),
      `发现 freepublish 调用路径: ${offenders.map(({ file }) => file).join(', ')}`,
    ).toEqual([]);
  });
});
