import { describe, expect, it } from 'vitest';
import {
  PushToolMetaSchema,
  RewriteToolMetaSchema,
  RunToolMetaSchema,
  RunToolValueSchema,
  SuggestTopicsMetaSchema,
} from '@/shared/agent-tool-contract';

/**
 * E2 meta schema 契约测试（chat-integration，测试先行——模块按 architecture §2.3 + Spec §5 实现）。
 *
 * 硬约束（architecture §2.1）：meta 随 tool/result 事件持久化，`Session.append` 对 meta 跑
 * isJsonValue 运行时校验，非 JSON 在写入点抛错——所以每个 meta schema 必须：
 * 1. strict 拒未知字段（契约漂移防护，同 contract.test.ts 纪律）；
 * 2. JSON.stringify→parse 无损 round-trip（勘误 1：E2 是终局投影的唯一持久化载体）；
 * 3. tool 字面量标记正确（E3 deliverables 靠 meta.tool 识别自家事件）。
 */

const runValue = () => ({
  ok: true,
  runId: 'run_abc123',
  status: 'succeeded' as const,
  articleId: 'art_9',
  title: 'Cloudflare Workers 冷启动实测',
  digest: 'p99 冷启动 3ms，重 IO 场景差距更小。',
  gatePassed: true,
});

const runMeta = () => ({ ...runValue(), tool: 'wewrite_run' as const, topic: 'Cloudflare Workers 冷启动实测' });

const pushMeta = () => ({
  tool: 'wewrite_push_draft' as const,
  articleId: 'art_9',
  title: 'Cloudflare Workers 冷启动实测',
  ok: true,
  mediaId: 'MEDIA_ab12cd',
});

const rewriteMeta = () => ({
  tool: 'wewrite_rewrite' as const,
  charsIn: 120,
  charsOut: 98,
  ok: true,
});

const suggestTopicsMeta = () => ({
  tool: 'wewrite_suggest_topics' as const,
  topics: [
    { title: '某引擎开源一夜 8 万星', source: 'hackernews', digest: '这条在讲什么：开源热度与生态观察。' },
    { title: '新前端框架发布', source: 'github', digest: '这条在讲什么：编译时框架的新路线。' },
  ],
});

type MetaCase = {
  name: string;
  schema: { safeParse(input: unknown): { success: boolean; data?: unknown } };
  fixture: () => Record<string, unknown>;
};

const META_CASES: MetaCase[] = [
  { name: 'RunToolMetaSchema', schema: RunToolMetaSchema, fixture: runMeta },
  { name: 'PushToolMetaSchema', schema: PushToolMetaSchema, fixture: pushMeta },
  { name: 'RewriteToolMetaSchema', schema: RewriteToolMetaSchema, fixture: rewriteMeta },
  { name: 'SuggestTopicsMetaSchema', schema: SuggestTopicsMetaSchema, fixture: suggestTopicsMeta },
];

describe('E2 meta schema：round-trip / strict / 无损 JSON（全部 meta）', () => {
  for (const testCase of META_CASES) {
    describe(testCase.name, () => {
      it('合法 fixture 过，且 parse 数据与输入 deep equal（round-trip）', () => {
        const fixture = testCase.fixture();
        const parsed = testCase.schema.safeParse(fixture);
        expect(parsed.success).toBe(true);
        expect(parsed.success ? parsed.data : undefined).toEqual(fixture);
      });

      it('strict：未知字段拒（契约漂移防护）', () => {
        expect(testCase.schema.safeParse({ ...testCase.fixture(), __unknown: 1 }).success).toBe(false);
      });

      it('硬约束：JSON.stringify→parse 等值（Session.append isJsonValue 写入点不抛）', () => {
        const fixture = testCase.fixture();
        const throughWire = JSON.parse(JSON.stringify(fixture));
        const parsed = testCase.schema.safeParse(throughWire);
        expect(parsed.success).toBe(true);
        expect(parsed.success ? parsed.data : undefined).toEqual(fixture);
        // 再过一层数组/对象边界：topics 嵌套也不允许出现不可序列化残留
        expect(JSON.parse(JSON.stringify(throughWire))).toEqual(throughWire);
      });

      it('tool 字面量标记：错 tool 值拒（E3 识别面）', () => {
        const fixture = testCase.fixture();
        const wrong = { ...fixture, tool: 'not-a-wewrite-tool' };
        expect(testCase.schema.safeParse(wrong).success).toBe(false);
        const missing = { ...fixture };
        delete (missing as { tool?: string }).tool;
        expect(testCase.schema.safeParse(missing).success).toBe(false);
      });
    });
  }
});

describe('RunToolValueSchema（wewrite_run canonical value，architecture §2.3）', () => {
  it('status 终态枚举四值；running 等非终态拒', () => {
    for (const status of ['succeeded', 'failed', 'cancelled', 'interrupted']) {
      expect(RunToolValueSchema.safeParse({ ...runValue(), status }).success).toBe(true);
    }
    for (const status of ['running', 'queued', 'paused']) {
      expect(RunToolValueSchema.safeParse({ ...runValue(), status }).success).toBe(false);
    }
  });

  it('digest 上限 200 字（卡面摘要），201 字拒', () => {
    expect(RunToolValueSchema.safeParse({ ...runValue(), digest: 'x'.repeat(200) }).success).toBe(true);
    expect(RunToolValueSchema.safeParse({ ...runValue(), digest: 'x'.repeat(201) }).success).toBe(false);
  });

  it('失败形态：ok:false + error{code,message}；articleId 等可选字段缺省合法', () => {
    const failed = { ok: false, runId: 'run_1', status: 'failed' as const, error: { code: 'gates-failed', message: '质量门禁未通过' } };
    expect(RunToolValueSchema.safeParse(failed).success).toBe(true);
    expect(RunToolValueSchema.safeParse({ ...failed, error: { code: 'x' } }).success).toBe(false);
    expect(RunToolValueSchema.safeParse({ ...failed, error: { code: 'x', message: 'm', extra: 1 } }).success).toBe(false);
  });

  it('未知字段拒（strict）', () => {
    expect(RunToolValueSchema.safeParse({ ...runValue(), topic: '不应出现在 value' }).success).toBe(false);
  });
});

describe('RunToolMetaSchema（value 超集 + E3 标记，architecture §2.3）', () => {
  it('RunToolValue 合法值 + {tool, topic} 即合法 meta（超集关系）', () => {
    expect(RunToolMetaSchema.safeParse({ ...runValue(), tool: 'wewrite_run', topic: 'T' }).success).toBe(true);
  });

  it('缺 topic 拒；topic 非字符串拒', () => {
    expect(RunToolMetaSchema.safeParse({ ...runValue(), tool: 'wewrite_run' }).success).toBe(false);
    expect(RunToolMetaSchema.safeParse({ ...runValue(), tool: 'wewrite_run', topic: 42 }).success).toBe(false);
  });

  it('value 层非法的 payload 在 meta 层同样拒（digest 超限等）', () => {
    expect(RunToolMetaSchema.safeParse({ ...runMeta(), digest: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('PushToolMetaSchema / RewriteToolMetaSchema 细项（architecture §2.3）', () => {
  it('Push：articleId/title/ok 必填；mediaId 可选；失败形态带 error 合法', () => {
    expect(PushToolMetaSchema.safeParse({ tool: 'wewrite_push_draft', articleId: 'a1', title: 'T', ok: true }).success).toBe(true);
    const failed = { tool: 'wewrite_push_draft', articleId: 'a1', title: 'T', ok: false, error: { code: 'wechat-40164', message: 'IP 不在白名单' } };
    expect(PushToolMetaSchema.safeParse(failed).success).toBe(true);
    expect(PushToolMetaSchema.safeParse({ tool: 'wewrite_push_draft', title: 'T', ok: true }).success).toBe(false);
  });

  it('Rewrite：charsIn/charsOut 整数；非整数拒', () => {
    expect(RewriteToolMetaSchema.safeParse({ ...rewriteMeta(), charsIn: 0, charsOut: 0 }).success).toBe(true);
    expect(RewriteToolMetaSchema.safeParse({ ...rewriteMeta(), charsIn: 1.5 }).success).toBe(false);
    expect(RewriteToolMetaSchema.safeParse({ ...rewriteMeta(), charsOut: '98' }).success).toBe(false);
  });
});

describe('SuggestTopicsMetaSchema（Spec §5 增补：热榜 top-N 带 AI 速览）', () => {
  it('topics 条目 = {title, source, digest}，缺一拒、空串拒', () => {
    const item = { title: '标题', source: 'hackernews', digest: '速览' };
    expect(SuggestTopicsMetaSchema.safeParse({ tool: 'wewrite_suggest_topics', topics: [item] }).success).toBe(true);
    expect(SuggestTopicsMetaSchema.safeParse({ tool: 'wewrite_suggest_topics', topics: [{ source: 'hackernews', digest: 'd' }] }).success).toBe(false);
    expect(SuggestTopicsMetaSchema.safeParse({ tool: 'wewrite_suggest_topics', topics: [{ ...item, title: '' }] }).success).toBe(false);
    expect(SuggestTopicsMetaSchema.safeParse({ tool: 'wewrite_suggest_topics', topics: [{ ...item, digest: '' }] }).success).toBe(false);
  });

  it('topics 条目未知字段拒（strict 嵌套）', () => {
    const polluted = { title: '标题', source: 's', digest: 'd', url: 'https://不应出现在速览卡' };
    expect(SuggestTopicsMetaSchema.safeParse({ tool: 'wewrite_suggest_topics', topics: [polluted] }).success).toBe(false);
  });
});
