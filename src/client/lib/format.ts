import { RUN_STATUSES } from '@/shared/contract';

/** 展示层格式化工具（纯函数，无 DOM 依赖，便于单测）。 */

/** 文章状态（契约 schema 内部枚举的 client 侧名义类型；真源 contract.ArticleListItem.status）。 */
export type ArticleStatus = 'editing' | 'rendered' | 'pushed' | 'failed';

/** run 状态六态（契约 RUN_STATUSES 常量的类型投影）。 */
export type RunStatus = (typeof RUN_STATUSES)[number];

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatShortDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 「x 秒/分钟前」相对时间（自动保存于 12 秒前）。 */
export function formatAgo(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 10) return '刚刚';
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return formatShortDateTime(iso);
}

/** 中文习惯的字数统计（CJK 字符逐个计，拉丁连续串按词计）。 */
export function countWords(markdown: string): number {
  const cjk = markdown.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g)?.length ?? 0;
  const latin = markdown.match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g)?.length ?? 0;
  return cjk + latin;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('zh-Hans-CN');
}

/** 时长（毫秒差 →「3 分 12 秒」）。 */
export function formatDuration(fromIso?: string, toIso?: string): string {
  if (!fromIso || !toIso) return '—';
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return '—';
  const total = Math.max(0, Math.round((to - from) / 1000));
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes} 分` : `${minutes} 分 ${seconds} 秒`;
}

export const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = {
  editing: '草稿',
  rendered: '已排版',
  pushed: '已进草稿箱',
  failed: '失败',
};

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
};

/** 热榜来源标签（source id → 展示名；未知来源回退原 id）。 */
export function hotspotSourceLabel(source: string): string {
  switch (source) {
    case 'hackernews':
      return 'HN';
    case 'weibo':
      return '微博';
    case 'zhihu':
      return '知乎';
    case 'dailyhot':
      return '聚合';
    default:
      return source;
  }
}

const WEEKDAY_LABEL: Record<string, string> = {
  MO: '一',
  TU: '二',
  WE: '三',
  TH: '四',
  FR: '五',
  SA: '六',
  SU: '日',
};

function parseRruleParts(rrule: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of rrule.split(';')) {
    const [key, value] = part.split('=');
    if (!key || value === undefined) continue;
    map.set(key.toUpperCase(), value.split(','));
  }
  return map;
}

function describeTimeOfDay(parts: Map<string, string[]>): string {
  const hour = parts.get('BYHOUR')?.[0];
  const minute = parts.get('BYMINUTE')?.[0];
  if (hour === undefined) return '';
  const h = hour.padStart(2, '0');
  const m = minute ? `:${minute.padStart(2, '0')}` : '';
  return ` ${h}${m}`;
}

/** RRULE 等宽原文 → 人类可读翻译（FREQ=DAILY;BYHOUR=4 → 「每天 04:00」）。 */
export function describeRrule(rrule: string): string {
  const parts = parseRruleParts(rrule);
  const freq = parts.get('FREQ')?.[0]?.toUpperCase();
  const time = describeTimeOfDay(parts);
  const count = parts.get('COUNT')?.[0];
  const onceSuffix = count === '1' ? '（一次）' : '';
  switch (freq) {
    case 'DAILY':
      return `每天${time}${onceSuffix}`;
    case 'WEEKLY': {
      const days = (parts.get('BYDAY') ?? [])
        .map((day) => WEEKDAY_LABEL[day.toUpperCase()] ?? day)
        .join('、');
      return days ? `每周${days}${time}` : `每周${time}`;
    }
    case 'MONTHLY':
      return `每月${time}`;
    case 'HOURLY':
      return '每小时';
    default:
      return freq ? `${freq}${time}` : rrule;
  }
}

/** 新建定时弹层的三种重复规则 → RRULE 等宽原文。 */
export function buildRrule(repeat: 'once' | 'daily' | 'weekly', weekday: string, hour: number, minute: number): string {
  const time = `BYHOUR=${hour};BYMINUTE=${String(minute).padStart(2, '0')}`;
  if (repeat === 'once') return `FREQ=DAILY;${time};COUNT=1`;
  if (repeat === 'weekly') return `FREQ=WEEKLY;BYDAY=${weekday};${time}`;
  return `FREQ=DAILY;${time}`;
}

/** RRULE → 表单字段（改期回填用；解析失败回退每天 09:30）。 */
export function parseRruleForm(rrule: string): { repeat: 'once' | 'daily' | 'weekly'; weekday: string; hour: number; minute: number } {
  const parts = parseRruleParts(rrule);
  const hour = Number.parseInt(parts.get('BYHOUR')?.[0] ?? '9', 10);
  const minute = Number.parseInt(parts.get('BYMINUTE')?.[0] ?? '30', 10);
  const weekday = (parts.get('BYDAY')?.[0] ?? 'MO').toUpperCase();
  const freq = parts.get('FREQ')?.[0]?.toUpperCase();
  const repeat = parts.get('COUNT')?.[0] === '1' ? 'once' : freq === 'WEEKLY' ? 'weekly' : 'daily';
  return {
    repeat,
    weekday,
    hour: Number.isNaN(hour) ? 9 : hour,
    minute: Number.isNaN(minute) ? 30 : minute,
  };
}

/** URL → 域名（热榜条目来源域展示；解析失败回退原文）。 */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
