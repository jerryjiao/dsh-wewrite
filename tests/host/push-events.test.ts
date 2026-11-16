import { describe, expect, it } from 'vitest';
import { PUSH_EVENT_HISTORY_LIMIT, listPushEvents, prunePushEvents, recordPushEvent, toPushEventView } from '@/host/push-events';
import type { PushEventDeps, PushEventInput } from '@/host/push-events';
import { PushEventSchema } from '@/shared/contract';
import type { KvTable } from '@/host/platform';
import type { PushEventRecord } from '@/host/domain';
import { MemoryDomain } from './service-harness';

/**
 * 推送留痕模块单测（v0.5.6）：直接测 src/host/push-events.ts，不经 service。
 *
 * 钉定的消费面：
 * - recordPushEvent(deps, input)：落库 + 自淘汰（超 200 删最旧），可选字段按输入取舍
 * - listPushEvents(deps, {limit?, articleId?})：occurredAt 倒序，limit 缺省 20 上限 50
 * - prunePushEvents(deps, keep)：只保留最近 keep 条
 * - toPushEventView(record)：输出对 shared PushEventSchema 合法（strictObject，不乱带可选字段）
 */

/** 表 + 递增秒级时钟：每次落库 occurredAt 严格递增（ISO 字符串序 = 时间序，倒序排序有确定性）。 */
function makeDeps(): PushEventDeps {
  const domain = new MemoryDomain();
  const table = domain.table('push_events') as KvTable<PushEventRecord>;
  let tick = 0;
  return {
    table,
    now: () => new Date(Date.UTC(2026, 7, 18, 12, 0, tick++)),
  };
}

function tableSize(deps: PushEventDeps): number {
  return [...deps.table.entries()].length;
}

/** 全部记录按 occurredAt 升序（时间正序），便于断言「最旧/最新」。 */
function recordsByOldestFirst(deps: PushEventDeps): PushEventRecord[] {
  return [...deps.table.entries()]
    .map(([, record]) => record)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function input(partial: Partial<PushEventInput> = {}): PushEventInput {
  return {
    articleId: 'art_x',
    articleTitle: '一篇稿',
    ok: true,
    durationMs: 1200,
    message: '已进草稿箱',
    ...partial,
  };
}

/** 直塞一条记录（不经 recordPushEvent），id/occurredAt 完全可控——给显式 prune 测试用。 */
function seededRecord(index: number): PushEventRecord {
  return {
    v: 1,
    id: `seed_${String(index).padStart(3, '0')}`,
    articleId: 'art_bulk',
    articleTitle: `稿${index}`,
    occurredAt: new Date(Date.UTC(2026, 7, 18, 12, 0, index)).toISOString(),
    durationMs: 100,
    ok: index % 2 === 0,
    message: '直塞记录',
  };
}

describe('recordPushEvent：落库字段按输入取舍', () => {
  it('失败记录（可选字段齐全）：reason/errcode/classification 原样落库，view 过 PushEventSchema', async () => {
    const deps = makeDeps();
    const view = await recordPushEvent(
      deps,
      input({ ok: false, durationMs: 1234.6, message: '微信接口拒绝', reason: 'wechat-api', errcode: 40007, classification: 'SYSTEM' }),
    );

    expect(tableSize(deps)).toBe(1);
    const record = recordsByOldestFirst(deps)[0];
    // 落库字段完整：身份、时间、取舍后的可选字段都在。
    expect(record.id).toMatch(/^push_/);
    expect(record.articleId).toBe('art_x');
    expect(record.occurredAt).toBe('2026-08-18T12:00:00.000Z');
    expect(record.ok).toBe(false);
    expect(record.reason).toBe('wechat-api');
    expect(record.errcode).toBe(40007);
    expect(record.classification).toBe('SYSTEM');
    // durationMs 四舍五入为整数毫秒。
    expect(record.durationMs).toBe(1235);
    expect(view.durationMs).toBe(1235);
    // 返回值是给调用方即时展示的视图，schema 合法。
    expect(PushEventSchema.parse(view)).toEqual(view);
  });

  it('成功记录：可选字段（reason/errcode/classification）不落库、view 不乱带；负 durationMs 钳到 0', async () => {
    const deps = makeDeps();
    const view = await recordPushEvent(deps, input({ durationMs: -50, mediaId: 'MEDIA_1' }));

    const record = recordsByOldestFirst(deps)[0];
    // strictObject 表：没传的可选字段绝不写 undefined 进库（存储体积与契约都干净）。
    expect(Object.keys(record).sort()).toEqual(
      ['articleId', 'articleTitle', 'durationMs', 'id', 'mediaId', 'message', 'occurredAt', 'ok', 'v'].sort(),
    );
    // 视图去掉记录级演进位 v，其余键与库内一一对应。
    expect(Object.keys(view).sort()).toEqual(
      ['articleId', 'articleTitle', 'durationMs', 'id', 'mediaId', 'message', 'occurredAt', 'ok'].sort(),
    );
    expect(view.mediaId).toBe('MEDIA_1');
    expect(view.durationMs).toBe(0);
  });
});

describe('listPushEvents：倒序、过滤与 limit 边界', () => {
  it('按 occurredAt 倒序：最新在前；articleId 过滤只留该文章', async () => {
    const deps = makeDeps();
    await recordPushEvent(deps, input({ articleId: 'art_a', articleTitle: '稿A-1' }));
    await recordPushEvent(deps, input({ articleId: 'art_b', articleTitle: '稿B-1' }));
    await recordPushEvent(deps, input({ articleId: 'art_a', articleTitle: '稿A-2' }));

    expect(listPushEvents(deps).map((event) => event.articleTitle)).toEqual(['稿A-2', '稿B-1', '稿A-1']);
    const onlyA = listPushEvents(deps, { articleId: 'art_a' });
    expect(onlyA.map((event) => event.articleTitle)).toEqual(['稿A-2', '稿A-1']);
    expect(onlyA.every((event) => event.articleId === 'art_a')).toBe(true);
  });

  it('limit 边界：0 → 按 1 取，51 → 按 50 取，缺省 → 20', async () => {
    const deps = makeDeps();
    for (let i = 0; i < 55; i++) await recordPushEvent(deps, input({ articleTitle: `稿${i}` }));

    // 库里 55 条（自淘汰上限 200 未触发），取用面才谈得上边界。
    expect(tableSize(deps)).toBe(55);
    expect(listPushEvents(deps).length).toBe(20);
    expect(listPushEvents(deps).every((event) => event.articleTitle !== '稿20')).toBe(true); // 缺省只回最近 20 条
    expect(listPushEvents(deps, { limit: 0 }).length).toBe(1);
    expect(listPushEvents(deps, { limit: 0 })[0].articleTitle).toBe('稿54'); // 边界钳 1 后仍是最新的
    expect(listPushEvents(deps, { limit: 51 }).length).toBe(50);
    expect(listPushEvents(deps, { limit: 51 })[49].articleTitle).toBe('稿5'); // 上限钳 50：第 50 条是倒数第 50 新
  });
});

describe('prunePushEvents：超限删最旧', () => {
  it('recordPushEvent 自淘汰：连记 205 条，剩 200 且最旧的是第 6 条（稿5）', async () => {
    const deps = makeDeps();
    for (let i = 0; i < 205; i++) await recordPushEvent(deps, input({ articleTitle: `稿${i}` }));

    expect(tableSize(deps)).toBe(PUSH_EVENT_HISTORY_LIMIT);
    const remaining = recordsByOldestFirst(deps);
    expect(remaining[0].articleTitle).toBe('稿5'); // 稿0–稿4 已按最旧淘汰
    expect(remaining[remaining.length - 1].articleTitle).toBe('稿204'); // 最新一条在
    expect(remaining.some((record) => record.articleTitle === '稿0')).toBe(false);
  });

  it('显式 prunePushEvents(deps, keep)：直塞 205 条（不经 record），prune 后剩 keep 条', async () => {
    const deps = makeDeps();
    for (let i = 0; i < 205; i++) await deps.table.put(`seed_${String(i).padStart(3, '0')}`, seededRecord(i));

    await prunePushEvents(deps, 200);
    expect(tableSize(deps)).toBe(200);
    const oldest = recordsByOldestFirst(deps)[0];
    expect(oldest.id).toBe('seed_005'); // 205 − 200 = 5，最旧 5 条（seed_000–004）被删
    expect(deps.table.get('seed_000')).toBeUndefined();
    expect(deps.table.get('seed_204')).toBeDefined();

    // keep 更小同样生效：再裁到 3 条，留下的是最新的 3 条。
    await prunePushEvents(deps, 3);
    expect(tableSize(deps)).toBe(3);
    expect(recordsByOldestFirst(deps).map((record) => record.id)).toEqual(['seed_202', 'seed_203', 'seed_204']);
  });
});

describe('toPushEventView：对 shared PushEventSchema 合法', () => {
  it('可选字段齐全的记录：视图逐字段还原，schema parse 通过', () => {
    const record: PushEventRecord = {
      v: 1,
      id: 'push_full',
      articleId: 'art_full',
      articleTitle: '全字段稿',
      occurredAt: '2026-08-18T12:30:00.000Z',
      durationMs: 4321,
      ok: false,
      reason: 'wechat-api',
      message: 'errcode 40001',
      errcode: 40001,
      classification: 'AUTH',
    };
    const view = toPushEventView(record);
    expect(PushEventSchema.parse(view)).toEqual(view);
    expect(view.reason).toBe('wechat-api');
    expect(view.errcode).toBe(40001);
    expect(view.classification).toBe('AUTH');
  });

  it('可选字段缺省的记录：视图不带 undefined 键（strictObject 不乱带）', () => {
    const record: PushEventRecord = {
      v: 1,
      id: 'push_bare',
      articleId: 'art_bare',
      articleTitle: '裸记录',
      occurredAt: '2026-08-18T12:31:00.000Z',
      durationMs: 0,
      ok: true,
      message: '已进草稿箱',
    };
    const view = toPushEventView(record);
    expect(Object.keys(view).sort()).toEqual(
      ['articleId', 'articleTitle', 'durationMs', 'id', 'message', 'occurredAt', 'ok'].sort(),
    );
    expect(PushEventSchema.parse(view)).toEqual(view);
  });
});
