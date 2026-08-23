import { describe, expect, it } from 'vitest';
import { selectWewriteArticles, wewriteDeliverablesDefinition } from '@/client/chat/deliverables';

/**
 * wewrite-deliverables Definition 状态机测试（chat-integration M2，测试先行——
 * 模块按 architecture §5.1（deliverables 官方模式，零自定义 session 事件）实现）。
 *
 * 钉定的公共 API（dev 按此实现）：
 * - `@/client/chat/deliverables` 具名导出：
 *   - `wewriteDeliverablesDefinition: ConversationNodeDefinition`（kind 'wewrite-deliverables'，
 *     target 省略——只发布 TurnData，不发布 view node，S6 官方同款）
 *   - `selectWewriteArticles(owner): Article[] | null`（decline-before-mount：空数据 → null）
 * 断言依据：Spec §9 AC-M2-01/02（勘误 1 载体）+ architecture §5.1 状态机。
 * 合成事件形状对齐宿主真源（dsh-session types.d.ts 'tool/result'：
 * {turn, step, message:{name,...}, meta?}——known 类型，回放安全）。
 */

// ── 合成事件与上下文假件 ─────────────────────────────────────────────────────

let nextSeq = 1;

interface ToolResultEventOptions {
  readonly name: string;
  readonly meta?: unknown;
  readonly turn?: number;
}

function toolResultEvent({ name, meta, turn = 1 }: ToolResultEventOptions) {
  return {
    type: 'tool/result',
    seq: nextSeq++,
    time: 1_755_648_000_000,
    data: { turn, step: 1, message: { type: 'tool_result', name, content: [] }, ...(meta === undefined ? {} : { meta }) },
  };
}

const runOkMeta = (articleId = 'art_9') => ({
  tool: 'wewrite_run',
  topic: 'Cloudflare Workers 冷启动实测',
  ok: true,
  runId: 'run_1',
  status: 'succeeded',
  articleId,
  title: 'Cloudflare Workers 冷启动实测',
  digest: 'p99 冷启动 3ms。',
  gatePassed: true,
});

const pushOkMeta = (articleId = 'art_9') => ({
  tool: 'wewrite_push_draft',
  articleId,
  title: 'Cloudflare Workers 冷启动实测',
  ok: true,
  mediaId: 'MEDIA_ab12cd',
});

const pushFailMeta = (articleId = 'art_9') => ({
  tool: 'wewrite_push_draft',
  articleId,
  title: 'Cloudflare Workers 冷启动实测',
  ok: false,
  error: { code: 'wechat-40164', message: 'IP 不在白名单' },
});

type Definition = typeof wewriteDeliverablesDefinition;
type SessionEventLike = Parameters<Definition['match']>[0];

const asEvent = (event: ReturnType<typeof toolResultEvent>) => event as unknown as SessionEventLike;

function makeMatch(event: SessionEventLike, role: 'start' | 'update') {
  return {
    event: { event, view: undefined },
    role,
    location: { turn: 1, step: 1 },
  } as Parameters<Definition['start']>[1];
}

function makeContext(id: string, state?: unknown) {
  return {
    key: `wewrite-deliverables:${id}`,
    kind: 'wewrite-deliverables',
    id,
    matches: [],
    start: undefined,
    state,
    current: new Map(),
  } as Parameters<Definition['update']>[0];
}

const makeReader = () => ({ previous: () => undefined }) as Parameters<Definition['start']>[2];

/** 走完一次完整状态机（start + 逐个 update），返回终态 state。 */
function reduceFrom(startEvent: ReturnType<typeof toolResultEvent>, ...updates: Array<ReturnType<typeof toolResultEvent>>) {
  const startMatch = wewriteDeliverablesDefinition.match(asEvent(startEvent));
  expect(startMatch).not.toBeNull();
  let state = wewriteDeliverablesDefinition.start(makeContext(startMatch!.id), makeMatch(asEvent(startEvent), 'start'), makeReader());
  for (const updateEvent of updates) {
    const updateMatch = wewriteDeliverablesDefinition.match(asEvent(updateEvent));
    expect(updateMatch).not.toBeNull();
    state = wewriteDeliverablesDefinition.update({ ...makeContext(updateMatch!.id), state }, makeMatch(asEvent(updateEvent), 'update'));
  }
  return state as { articles: Array<Record<string, unknown>> };
}

// ── match：只认自家 tool/result + meta.tool ─────────────────────────────────

describe('match 事件识别（AC-M2-01：终局投影只来自自家 tool/result）', () => {
  it('kind 锁定 wewrite-deliverables（turnTail 链注册键）', () => {
    expect(wewriteDeliverablesDefinition.kind).toBe('wewrite-deliverables');
  });

  it('wewrite_run ok meta（含 articleId）→ start，id=articleId', () => {
    expect(wewriteDeliverablesDefinition.match(asEvent(toolResultEvent({ name: 'wewrite_run', meta: runOkMeta() })))).toEqual({ id: 'art_9', role: 'start' });
  });

  it('同 articleId 的 push 结果 → update（状态转移入口）', () => {
    expect(wewriteDeliverablesDefinition.match(asEvent(toolResultEvent({ name: 'wewrite_push_draft', meta: pushOkMeta() })))).toEqual({ id: 'art_9', role: 'update' });
  });

  it('meta 为 JSON 字符串时容错解析（§5.1 JSON.parse 容错）', () => {
    expect(wewriteDeliverablesDefinition.match(asEvent(toolResultEvent({ name: 'wewrite_run', meta: JSON.stringify(runOkMeta()) })))).toEqual({ id: 'art_9', role: 'start' });
  });

  it('无 meta 不 match（普通工具结果不进产物行）', () => {
    expect(wewriteDeliverablesDefinition.match(asEvent(toolResultEvent({ name: 'wewrite_run' })))).toBeNull();
  });

  it('meta 无 tool 标记不 match（非本 Definition 的 meta）', () => {
    expect(wewriteDeliverablesDefinition.match(asEvent(toolResultEvent({ name: 'wewrite_run', meta: { articleId: 'art_9', ok: true } })))).toBeNull();
  });

  it('他工具不 match（bash / wewrite_rewrite 等，即使 meta 形似）', () => {
    expect(wewriteDeliverablesDefinition.match(asEvent(toolResultEvent({ name: 'bash', meta: runOkMeta() })))).toBeNull();
    expect(wewriteDeliverablesDefinition.match(asEvent(toolResultEvent({ name: 'wewrite_rewrite', meta: { tool: 'wewrite_rewrite', charsIn: 1, charsOut: 2, ok: true } })))).toBeNull();
  });

  it('run 失败（meta 无 articleId）不 match——产物行只列产出（§5.1 状态机）', () => {
    const failedMeta = { tool: 'wewrite_run', topic: 'T', ok: false, runId: 'run_2', status: 'failed', error: { code: 'gates-failed', message: 'm' } };
    expect(wewriteDeliverablesDefinition.match(asEvent(toolResultEvent({ name: 'wewrite_run', meta: failedMeta })))).toBeNull();
  });

  it('非 tool/result 事件不 match（user/message 等 known 事件）', () => {
    expect(wewriteDeliverablesDefinition.match({ type: 'user/message', seq: 1, time: 0, data: { turn: 1, message: {} } } as unknown as SessionEventLike)).toBeNull();
  });
});

// ── 状态机：drafted → pushed / push 失败保留 drafted ─────────────────────────

describe('文章状态机（AC-M2-02 同 articleId 归并，§5.1 转移矩阵）', () => {
  it('run ok → articles=[{articleId,title,digest,runId,state: drafted}]', () => {
    const state = reduceFrom(toolResultEvent({ name: 'wewrite_run', meta: runOkMeta() }));
    expect(state.articles).toEqual([
      { articleId: 'art_9', title: 'Cloudflare Workers 冷启动实测', digest: 'p99 冷启动 3ms。', runId: 'run_1', state: 'drafted' },
    ]);
  });

  it('drafted → pushed：push ok 覆盖状态（同一 run 单一权威呈现，OD-2）', () => {
    const state = reduceFrom(
      toolResultEvent({ name: 'wewrite_run', meta: runOkMeta() }),
      toolResultEvent({ name: 'wewrite_push_draft', meta: pushOkMeta() }),
    );
    expect(state.articles).toHaveLength(1);
    expect(state.articles[0]?.state).toBe('pushed');
    expect(state.articles[0]?.articleId).toBe('art_9');
  });

  it('push 失败 → 保留 drafted（draft-failed 不入列表，产物行仍可重试）', () => {
    const state = reduceFrom(
      toolResultEvent({ name: 'wewrite_run', meta: runOkMeta() }),
      toolResultEvent({ name: 'wewrite_push_draft', meta: pushFailMeta() }),
    );
    expect(state.articles).toHaveLength(1);
    expect(state.articles[0]?.state).toBe('drafted');
  });

  it('不同 articleId 各自成行（一次 run 一篇，push 目标即 run 产出）', () => {
    const state = reduceFrom(toolResultEvent({ name: 'wewrite_run', meta: runOkMeta('art_a') }));
    expect(state.articles.map((a) => a.articleId)).toEqual(['art_a']);
  });
});

// ── selector：decline-before-mount ───────────────────────────────────────────

describe('selectWewriteArticles（§5.1：空数据 → null，turnTail 渲染零成本）', () => {
  const ownerWith = (value: unknown) => ({ turn: { data: { get: () => value } } }) as never;

  it('Turn.data 无 wewrite 键 → null', () => {
    expect(selectWewriteArticles(ownerWith(undefined))).toBeNull();
  });

  it('wewrite 数据为空对象/空 articles → null（decline-before-mount）', () => {
    expect(selectWewriteArticles(ownerWith({}))).toBeNull();
    expect(selectWewriteArticles(ownerWith({ articles: [] }))).toBeNull();
  });

  it('非空 articles → 原样透传给产物行组件', () => {
    const articles = [{ articleId: 'art_9', title: 'T', digest: 'D', runId: 'run_1', state: 'pushed' as const }];
    expect(selectWewriteArticles(ownerWith({ articles }))).toEqual(articles);
  });
});
