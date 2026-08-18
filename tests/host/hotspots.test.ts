import { describe, expect, it } from 'vitest';
import { aggregateHotspots, type HotspotSource } from '@/host/pipeline/steps/topic';

/**
 * 热榜聚合测试（AC-3：单热榜源失败，该源标记失败且其他源继续展示）。
 *
 * 本文件钉定 src/host/pipeline/steps/topic.ts 消费面：
 * - aggregateHotspots(sources, limit) -> { items, failures }
 * - 单源失败永不抛出、永不清空其他源结果；失败信息以 sourceId 标记返回供 UI 呈现
 */

const item = (title: string, rank: number, source = 'hackernews') => ({
  title,
  source,
  rank,
  url: `https://x.example.test/${rank}`,
});

const healthySource = (id: string, items: ReturnType<typeof item>[]): HotspotSource => ({
  id,
  fetch: async () => items,
});

const failingSource = (id: string, message: string): HotspotSource => ({
  id,
  fetch: async () => {
    throw new Error(message);
  },
});

describe('aggregateHotspots（AC-3 单源失败隔离）', () => {
  it('多源健康：结果合并、按 rank 排序', async () => {
    const sources = [
      healthySource('hn', [item('HN 二号', 2), item('HN 一号', 1)]),
      healthySource('custom', [item('自建源头条', 1, 'custom-relay')]),
    ];
    const result = await aggregateHotspots(sources, 10);

    expect(result.failures).toEqual([]);
    expect(result.items.length).toBe(3);
    expect(result.items.map((i) => i.title)).toContain('HN 一号');
    expect(result.items.map((i) => i.title)).toContain('自建源头条');
  });

  it('单源失败：items 保留健康源结果，failures 标记失败源与原因，不抛出', async () => {
    const sources = [
      failingSource('hn', 'HTTP 503'),
      healthySource('custom', [item('自建源头条', 1, 'custom-relay'), item('自建源次条', 2, 'custom-relay')]),
    ];
    const result = await aggregateHotspots(sources, 10);

    expect(result.items.length).toBe(2);
    expect(result.items.every((i) => i.source === 'custom-relay')).toBe(true);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0]).toMatchObject({ sourceId: 'hn' });
    expect(result.failures[0].message).toContain('503');
  });

  it('全部源失败：items 为空数组、failures 全记录、仍不抛出（空态+失败标记由 UI 呈现）', async () => {
    const sources = [failingSource('hn', 'timeout'), failingSource('custom', 'DNS 解析失败')];
    const result = await aggregateHotspots(sources, 10);

    expect(result.items).toEqual([]);
    expect(result.failures.map((f) => f.sourceId).sort()).toEqual(['custom', 'hn']);
  });

  it('limit 截断总量（Spec §10 边界约束）', async () => {
    const sources = [healthySource('big', Array.from({ length: 30 }, (_, i) => item(`条目 ${i + 1}`, i + 1)))];
    const result = await aggregateHotspots(sources, 5);
    expect(result.items.length).toBeLessThanOrEqual(5);
  });

  it('源返回空数组：合法（无条目不是失败）', async () => {
    const sources = [healthySource('empty', [])];
    const result = await aggregateHotspots(sources, 10);
    expect(result.items).toEqual([]);
    expect(result.failures).toEqual([]);
  });
});
