import {
  parseMeta,
  safeParsePushMeta,
  safeParseRunMeta,
  type PushToolMeta,
  type RunToolMeta,
} from './meta';

/**
 * wewrite-deliverables ConversationNodeDefinition（architecture §5.1，M2；
 * 官方 ui-deliverables 同款模式：client-only、零自定义 session 事件、target 省略
 * ——只发布 TurnData，不发布 view node）。
 *
 * 事件→状态机：
 * - match：只认自家 tool/result（message.name ∈ {wewrite_run, wewrite_push_draft}）
 *   且 meta（JSON 字符串容错解析）含 tool 标记；run ok 且有 articleId → start，
 *   id=articleId；push → update（同 articleId 归并）。
 * - start：articles=[{articleId,title,digest,runId,state:'drafted'}]
 * - update：drafted→pushed（push ok）；push 失败保留 drafted（draft-failed 不入列表）；
 *   published 单向（重跑同 articleId 不回退 pushed）。
 * - buildLocationData：ConversationTurnDataMap 键 'wewrite' → {articles}（turnTail 消费）。
 *
 * 本文件自带 host 结构最小类型（ConversationNodeDefinitionLike 等，窄面纪律：
 * 字段比宿主真实面窄是刻意的，宿主参照包已 pin devDeps，需要扩面时在此追加）。
 */

// ── host 结构最小类型（窄面，仅本 Definition 所需面） ─────────────────────────

/** dsh-session 'tool/result' 事件面（known 类型，回放安全）。 */
export interface ToolResultSessionEventLike {
  readonly type: string;
  readonly seq: number;
  readonly time: number;
  readonly data: {
    readonly turn: number;
    readonly step: number;
    readonly message: { readonly type?: string; readonly name: string; readonly content?: readonly unknown[] };
    readonly meta?: unknown;
  };
}

export interface ConversationMatchResultLike {
  readonly id: string;
  readonly role: 'start' | 'update';
}

export interface ConversationMatchLike {
  readonly event: { readonly event: ToolResultSessionEventLike; readonly view?: unknown };
  readonly role: 'start' | 'update';
  readonly location?: unknown;
}

export interface ConversationNodeContextLike<State> {
  readonly key: string;
  readonly kind: string;
  readonly id: string;
  readonly matches: readonly ConversationMatchLike[];
  readonly start?: ConversationMatchLike | undefined;
  readonly state: State | undefined;
}

export interface ConversationContextReaderLike {
  previous<State>(kind: string): { readonly state: Readonly<State> } | undefined;
}

export interface ConversationLocationDataLike {
  readonly kind: 'turn' | 'step';
  readonly turn: number;
  readonly step?: number;
  readonly key: string;
  readonly value: unknown;
}

export interface ConversationNodeDefinitionLike<State> {
  readonly kind: string;
  readonly target?: string;
  match(event: ToolResultSessionEventLike): ConversationMatchResultLike | null;
  start(
    context: ConversationNodeContextLike<State>,
    match: ConversationMatchLike,
    reader: ConversationContextReaderLike,
  ): State;
  update(context: ConversationNodeContextLike<State> & { readonly state: State }, match: ConversationMatchLike): State;
  buildLocationData?(
    context: ConversationNodeContextLike<State>,
    scope: 'step' | 'turn',
  ): ConversationLocationDataLike | null;
}

// ── Turn 数据与状态 ────────────────────────────────────────────────────────────

// type alias（非 interface）：便于宿主/测试侧 Record<string, unknown> 结构化收窄。
export type WewriteDeliverableArticle = {
  readonly articleId: string;
  readonly title: string;
  readonly digest: string;
  readonly runId: string;
  readonly state: 'drafted' | 'pushed';
};

export interface WewriteDeliverablesState {
  /** 可变数组（QA 契约 reduceFrom 对 state 的结构化收窄）。 */
  articles: WewriteDeliverableArticle[];
}

/** turnTail owner 面的最小读取（ConversationLocationDataStore.get）。 */
interface TurnDataReaderLike {
  get(key: string): unknown;
}

export interface TurnTailOwnerPropsLike {
  readonly turn: { readonly turn: number; readonly data: TurnDataReaderLike };
  readonly seq: number;
  readonly openFile?: (path: string) => void;
}

export const WEWRITE_TURN_DATA_KEY = 'wewrite';

// ── Definition 本体 ───────────────────────────────────────────────────────────

function runStart(meta: RunToolMeta): WewriteDeliverableArticle {
  return { articleId: meta.articleId as string, title: meta.title ?? meta.topic, digest: meta.digest ?? '', runId: meta.runId, state: 'drafted' };
}

function upsertArticle(
  articles: readonly WewriteDeliverableArticle[],
  next: WewriteDeliverableArticle,
): WewriteDeliverableArticle[] {
  const index = articles.findIndex((article) => article.articleId === next.articleId);
  if (index === -1) return [...articles, next];
  const existing = articles[index] as WewriteDeliverableArticle;
  // published 单向终态（uiux §4.2）：已 pushed 的文章重跑成稿不回退。
  const merged: WewriteDeliverableArticle = existing.state === 'pushed' ? { ...next, state: 'pushed' } : next;
  return [...articles.slice(0, index), merged, ...articles.slice(index + 1)];
}

export const wewriteDeliverablesDefinition: ConversationNodeDefinitionLike<WewriteDeliverablesState> = {
  kind: 'wewrite-deliverables',
  // target 省略：只发布 TurnData（S6 官方 deliverables 同款），不发布 view node。

  match(event: ToolResultSessionEventLike): ConversationMatchResultLike | null {
    if (event.type !== 'tool/result') return null;
    const data = event.data;
    if (!data?.message || typeof data.message.name !== 'string') return null;
    const name = data.message.name;
    if (name !== 'wewrite_run' && name !== 'wewrite_push_draft') return null;
    const meta = parseMeta(data.meta);
    if (!meta || typeof meta !== 'object' || (meta as { tool?: unknown }).tool === undefined) return null;
    if (name === 'wewrite_run') {
      const runMeta = safeParseRunMeta(meta);
      // run 失败（无 articleId）不 match——产物行只列产出（§5.1）。
      if (!runMeta || !runMeta.ok || !runMeta.articleId) return null;
      return { id: runMeta.articleId, role: 'start' };
    }
    const pushMeta = safeParsePushMeta(meta);
    if (!pushMeta || !pushMeta.articleId) return null;
    return { id: pushMeta.articleId, role: 'update' };
  },

  start(_context, match): WewriteDeliverablesState {
    const meta = safeParseRunMeta(parseMeta(match.event.event.data.meta));
    if (!meta || !meta.articleId) return { articles: [] };
    return { articles: [runStart(meta)] };
  },

  update(context, match): WewriteDeliverablesState {
    const articles = context.state?.articles ?? [];
    const data = match.event.event.data;
    if (data.message.name === 'wewrite_push_draft') {
      const meta: PushToolMeta | undefined = safeParsePushMeta(parseMeta(data.meta));
      if (!meta) return { articles };
      const index = articles.findIndex((article) => article.articleId === meta.articleId);
      if (index === -1) {
        // 未见 run start 的 push（窗口截断/回放半截）：按 push 事实补行（pushed）。
        return { articles: [...articles, { articleId: meta.articleId, title: meta.title, digest: '', runId: '', state: meta.ok ? 'pushed' : 'drafted' }] };
      }
      if (!meta.ok) return { articles }; // push 失败保留 drafted（§5.1 转移矩阵）
      return {
        articles: [...articles.slice(0, index), { ...(articles[index] as WewriteDeliverableArticle), state: 'pushed' }, ...articles.slice(index + 1)],
      };
    }
    const runMeta = safeParseRunMeta(parseMeta(data.meta));
    if (!runMeta || !runMeta.ok || !runMeta.articleId) return { articles };
    return { articles: upsertArticle(articles, runStart(runMeta)) };
  },

  buildLocationData(context, scope) {
    if (scope !== 'turn') return null;
    const state = context.state;
    if (!state || state.articles.length === 0) return null;
    const turn = context.matches.length > 0 ? context.matches[context.matches.length - 1]?.event.event.data.turn : undefined;
    if (typeof turn !== 'number') return null;
    return { kind: 'turn', turn, key: WEWRITE_TURN_DATA_KEY, value: { articles: state.articles } };
  },
};

// ── turnTail 选择器（decline-before-mount，S6） ────────────────────────────────

/**
 * 读 owner.turn.data.get('wewrite')：空 → null（挂载前拒绝，turnTail 渲染零成本）；
 * 非空 articles → 原样透传给产物行组件（chain matched prop）。
 */
export function selectWewriteArticles(owner: TurnTailOwnerPropsLike): WewriteDeliverableArticle[] | null {
  const data = owner.turn.data.get(WEWRITE_TURN_DATA_KEY) as { articles?: unknown } | undefined;
  if (!data || typeof data !== 'object') return null;
  const articles = data.articles;
  if (!Array.isArray(articles) || articles.length === 0) return null;
  return articles as WewriteDeliverableArticle[];
}
