/**
 * RRULE 归一化与投影计算（ADR-004，rrule 2.x + Intl 时区）。
 * 语义：BYHOUR 等是墙钟时间——在目标时区的墙钟域里求下一次触发，再换算绝对时刻。
 * BYHOUR 缺省视为 0 点（QA 裁决：WEEKLY/MONTHLY 无 BYHOUR 时投影落在当日 0 点）。
 */

import rrulePackage from 'rrule';

/**
 * rrule 的 CJS 主入口在 Node ESM 下命名导出不可静态探测——统一走 default 互操作
 * 取 RRule 构造器（vitest/esbuild/Node 三环境一致）。
 */
const { RRule } = rrulePackage as unknown as { RRule: typeof import('rrule').RRule };

export class RruleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RruleValidationError';
  }
}

const KNOWN_KEYS = new Set([
  'FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'WKST',
  'BYHOUR', 'BYMINUTE', 'BYSECOND', 'BYDAY', 'BYMONTH', 'BYMONTHDAY', 'BYYEARDAY', 'BYWEEKNO', 'BYSETPOS',
]);

const FREQ_VALUES = new Set(['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

function assertIntInRange(label: string, raw: string, min: number, max: number, allowNegative: boolean): number {
  if (!/^-?\d+$/.test(raw)) throw new RruleValidationError(`${label} 必须是整数：${raw}`);
  const value = Number(raw);
  if (value === 0 && allowNegative) throw new RruleValidationError(`${label} 不能为 0`);
  if (value < min || value > max) throw new RruleValidationError(`${label} 超出范围 [${min}, ${max}]：${value}`);
  return value;
}

/** 大小写归一 + 分段校验（rrule 库不查 BYHOUR=25/COUNT=0，本层补齐）。 */
export function normalizeRrule(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new RruleValidationError('RRULE 不能为空');
  const normalized = trimmed
    .toUpperCase()
    .split(';')
    .map((part) => part.trim().replace(/\s+/g, ''))
    .filter(Boolean)
    .join(';');
  if (!normalized) throw new RruleValidationError('RRULE 不能为空');
  const seen = new Set<string>();
  for (const part of normalized.split(';')) {
    const match = /^([A-Z]+)=(.+)$/.exec(part);
    if (!match) throw new RruleValidationError(`RRULE 段无法解析：${part}`);
    const [, key, value] = match;
    if (!KNOWN_KEYS.has(key)) throw new RruleValidationError(`RRULE 含未知属性：${key}`);
    if (seen.has(key)) throw new RruleValidationError(`RRULE 属性重复：${key}`);
    seen.add(key);
    if (key === 'FREQ' && !FREQ_VALUES.has(value)) throw new RruleValidationError(`FREQ 取值非法：${value}`);
    if (key === 'BYHOUR') value.split(',').forEach((v) => assertIntInRange('BYHOUR', v, 0, 23, false));
    if (key === 'BYMINUTE') value.split(',').forEach((v) => assertIntInRange('BYMINUTE', v, 0, 59, false));
    if (key === 'BYSECOND') value.split(',').forEach((v) => assertIntInRange('BYSECOND', v, 0, 59, false));
    if (key === 'BYMONTH') value.split(',').forEach((v) => assertIntInRange('BYMONTH', v, 1, 12, false));
    if (key === 'BYMONTHDAY') value.split(',').forEach((v) => assertIntInRange('BYMONTHDAY', v, -31, 31, true));
    if (key === 'INTERVAL') {
      if (!/^\d+$/.test(value) || Number(value) < 1) throw new RruleValidationError(`INTERVAL 必须 >= 1：${value}`);
    }
    if (key === 'COUNT') {
      if (!/^\d+$/.test(value) || Number(value) < 1) throw new RruleValidationError(`COUNT 必须 >= 1：${value}`);
    }
  }
  if (!seen.has('FREQ')) throw new RruleValidationError('RRULE 缺少 FREQ');
  try {
    new RRule(RRule.parseString(normalized));
  } catch (error) {
    throw new RruleValidationError(`RRULE 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
  return normalized;
}

// ── 时区换算（Intl，无第三方时区库）───────────────────────────────────────

interface WallParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function wallPartsOf(instant: Date, timeZone: string): WallParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** 目标时区在某个绝对时刻的 UTC 偏移（毫秒）。 */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const wall = wallPartsOf(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - instant.getTime();
}

/** 墙钟时刻（以 UTC 编码的伪时刻）→ 绝对时刻（两遍法处理 DST 边界）。 */
function wallClockToAbsoluteMs(wallMs: number, timeZone: string): number {
  let offset = tzOffsetMs(new Date(wallMs), timeZone);
  let absolute = wallMs - offset;
  const secondPass = tzOffsetMs(new Date(absolute), timeZone);
  if (secondPass !== offset) {
    offset = secondPass;
    absolute = wallMs - offset;
  }
  return absolute;
}

/**
 * 计算下一次触发（绝对时刻 ISO 串）。
 * 非法 timeZone 在此 fail fast（Intl 构造即抛）。
 */
export function computeNextRunAt(rruleText: string, timeZone: string, from: Date): string {
  const normalized = normalizeRrule(rruleText);
  const options = RRule.parseString(normalized) as Record<string, unknown>;
  const wall = wallPartsOf(from, timeZone);
  const fromWallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const byhourRaw = options.byhour;
  const byhour = byhourRaw === undefined ? [0] : Array.isArray(byhourRaw) ? byhourRaw.map(Number) : [Number(byhourRaw)];
  const rule = new RRule({
    ...options,
    dtstart: new Date(Date.UTC(wall.year, wall.month - 1, wall.day)),
    byhour,
  });
  const nextWall = rule.after(new Date(fromWallMs), false);
  if (!nextWall) throw new RruleValidationError(`RRULE 已无未来触发点：${normalized}`);
  return new Date(wallClockToAbsoluteMs(nextWall.getTime(), timeZone)).toISOString();
}
