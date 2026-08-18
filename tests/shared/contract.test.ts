import { describe, expect, it } from 'vitest';
import {
  RPC_AUTHORITY,
  RPC_CHANNEL,
  CONTRACT_VERSION,
  RPC_ENDPOINTS,
  rpcContract,
  RunParamsSchema,
  HotspotItemSchema,
  ArticleListItemSchema,
  ArticleDetailSchema,
  RunSummarySchema,
  ScheduleViewModelSchema,
  ConfigViewSchema,
  SnapshotResponseSchema,
} from '@/shared/contract';

/**
 * 契约测试：Spec §5 端点清单（18 行表格，实际 20 个端点）的可执行形态。
 * 本文件钉定 src/shared/contract.ts 必须导出的形状——Phase 3 按此实现。
 * 断言依据：docs/spec.md §5、docs/tech-architecture.md §6。
 */

const runParams = () => ({
  topicMode: 'fixed' as const,
  topic: 'AI 写作管线',
  theme: 'professional-clean',
  imageCount: 1,
  llm: { provider: 'openai', model: 'deepseek-v4' },
});

const articleListItem = () => ({
  id: 'art_1',
  slug: 'dsh-open-source',
  title: 'DeepSeek Harness 开源一夜 8 万星',
  digest: '平台背景与插件生态观察',
  status: 'editing' as const,
  updatedAt: '2026-08-18T00:00:00.000Z',
});

const articleDetail = () => ({
  ...articleListItem(),
  v: 1,
  markdown: '# 标题\n\n正文',
  theme: 'professional-clean',
  bodyImageIds: ['img_1'],
  coverImageId: 'img_0',
  createdAt: '2026-08-17T00:00:00.000Z',
});

const scheduleViewModel = () => ({
  id: 'sch_1',
  revision: 3,
  name: '每日早四点',
  rrule: 'FREQ=DAILY;BYHOUR=4',
  timeZone: 'Asia/Shanghai',
  params: runParams(),
  enabled: true,
  publishTarget: 'draft' as const,
  nextRunAt: '2026-08-19T04:00:00+08:00',
});

const runSummary = () => ({
  id: 'run_1',
  trigger: 'manual' as const,
  status: 'succeeded' as const,
  startedAt: '2026-08-18T04:00:02.000Z',
  finishedAt: '2026-08-18T04:05:11.000Z',
});

const configView = () => ({
  settings: {
    wechatAppId: 'wx1234567890abcdef',
    wechatApiBaseUrl: 'https://api.weixin.qq.com',
    wechatAuthor: 'Jerry',
    defaultTheme: 'professional-clean',
    defaultImageSize: '1024x1024',
    llmDefault: { provider: 'openai', model: 'deepseek-v4' },
    agentToolsEnabled: false,
    runHistoryLimit: 200,
  },
  credentials: {
    WEWRITE_WECHAT_SECRET: { configured: false, writable: true },
    WEWRITE_IMG_OPENAI: { configured: true, writable: true },
  },
  imageProviders: [
    { providerId: 'openai', model: 'gpt-image-2', credentialRef: 'WEWRITE_IMG_OPENAI' },
  ],
});

const snapshotResponse = () => ({
  articles: [articleListItem()],
  runs: [runSummary()],
  schedules: [scheduleViewModel()],
  config: configView(),
  serverNow: '2026-08-18T12:00:00.000Z',
  capabilities: { contractVersion: 1, features: ['scheduler', 'images'] },
});

const EXPECTED_ENDPOINTS = [
  'snapshot',
  'hotspots/fetch',
  'article/list',
  'article/get',
  'article/save',
  'article/delete',
  'article/preview',
  'run/start',
  'run/cancel',
  'schedule/save',
  'schedule/delete',
  'schedule/toggle',
  'schedule/runNow',
  'config/get',
  'config/set',
  'credentials/set',
  'credentials/describe',
  'llm/options',
  'wechat/pushDraft',
  'wechat/diagnose',
] as const;

describe('RPC 通道常量（Spec §5 头部 + 架构 F13）', () => {
  it('通道名锁定为 dsh-wewrite', () => {
    expect(RPC_CHANNEL).toBe('dsh-wewrite');
  });

  it('authority 锁定为 loopback（控制无人值守写面仅本机回环）', () => {
    expect(RPC_AUTHORITY).toBe('loopback');
  });

  it('契约版本常量为 1（capabilities 协商）', () => {
    expect(CONTRACT_VERSION).toBe(1);
  });

  it('端点全集精确等于 Spec §5 的 20 个端点，无增无减', () => {
    expect([...RPC_ENDPOINTS].sort()).toEqual([...EXPECTED_ENDPOINTS].sort());
    expect(Object.keys(rpcContract).sort()).toEqual([...EXPECTED_ENDPOINTS].sort());
  });

  it('每个端点同时具备 request 与 response schema', () => {
    for (const endpoint of EXPECTED_ENDPOINTS) {
      const entry = rpcContract[endpoint];
      expect(entry, `端点 ${endpoint} 缺失`).toBeDefined();
      expect(entry.request, `${endpoint}.request`).toBeDefined();
      expect(entry.response, `${endpoint}.response`).toBeDefined();
      expect(typeof entry.request.safeParse).toBe('function');
      expect(typeof entry.response.safeParse).toBe('function');
    }
  });
});

interface EndpointCase {
  endpoint: string;
  name: string;
  validRequests: unknown[];
  invalidRequests: unknown[];
  validResponse: unknown;
  invalidResponse: unknown;
}

const CASES: EndpointCase[] = [
  {
    endpoint: 'snapshot',
    name: 'snapshot：空请求，全量视图响应',
    validRequests: [{}],
    invalidRequests: [{ extra: 1 }],
    validResponse: snapshotResponse(),
    invalidResponse: { ...snapshotResponse(), serverNow: 'not-a-date', capabilities: {} },
  },
  {
    endpoint: 'hotspots/fetch',
    name: 'hotspots/fetch：可选 limit（1-100），响应为条目数组',
    validRequests: [{}, { limit: 20 }, { limit: 1 }, { limit: 100 }],
    invalidRequests: [{ limit: 0 }, { limit: -1 }, { limit: 101 }, { limit: '20' }, { limit: 1.5 }],
    validResponse: [{ title: '某热榜标题', source: 'hackernews', rank: 1, url: 'https://news.ycombinator.com/item?id=1' }],
    invalidResponse: [{ title: '缺 url', source: 'hackernews', rank: 1 }],
  },
  {
    endpoint: 'article/list',
    name: 'article/list：空请求，轻量列表（无 markdown）',
    validRequests: [{}],
    invalidRequests: [{ id: 'art_1' }],
    validResponse: [articleListItem()],
    invalidResponse: [{ ...articleListItem(), status: 'drafting' }],
  },
  {
    endpoint: 'article/get',
    name: 'article/get：按 id 取详情',
    validRequests: [{ id: 'art_1' }],
    invalidRequests: [{}, { id: 123 }, { id: '' }],
    validResponse: articleDetail(),
    invalidResponse: { ...articleDetail(), digest: undefined, bodyImageIds: 'img_1' },
  },
  {
    endpoint: 'article/save',
    name: 'article/save：创建/更新（digest 必填，slug kebab-case）',
    validRequests: [
      { slug: 'my-post', title: '标题', digest: '摘要', markdown: '# hi', theme: 'professional-clean' },
      { id: 'art_1', slug: 'my-post', title: '标题', digest: '摘要', markdown: '# hi', theme: 'professional-clean' },
    ],
    invalidRequests: [
      { slug: 'my-post', title: '标题', markdown: '# hi', theme: 'professional-clean' },
      { slug: 'My Post', title: '标题', digest: 'd', markdown: '# hi', theme: 't' },
      { slug: 'my_post', title: '标题', digest: 'd', markdown: '# hi', theme: 't' },
      { slug: 'my-post', title: '', digest: 'd', markdown: '# hi', theme: 't' },
    ],
    validResponse: articleDetail(),
    invalidResponse: { ...articleDetail(), slug: 'Not Slug' },
  },
  {
    endpoint: 'article/delete',
    name: 'article/delete：按 id 删除，返回 deleted 布尔',
    validRequests: [{ id: 'art_1' }],
    invalidRequests: [{}, { id: null }],
    validResponse: { deleted: true },
    invalidResponse: { deleted: 'yes' },
  },
  {
    endpoint: 'article/preview',
    name: 'article/preview：{id} 或 {markdown,theme} 二选一，返回 html',
    validRequests: [{ id: 'art_1' }, { markdown: '# hi', theme: 'professional-clean' }],
    invalidRequests: [
      {},
      { id: 'art_1', markdown: '# hi' },
      { markdown: '# hi' },
      { theme: 'professional-clean' },
    ],
    validResponse: { html: '<section style="...">hi</section>' },
    invalidResponse: { html: 42 },
  },
  {
    endpoint: 'run/start',
    name: 'run/start：params 必填 RunParams，可选 articleId',
    validRequests: [
      { params: runParams() },
      { articleId: 'art_1', params: { topicMode: 'hotspots' } },
    ],
    invalidRequests: [
      {},
      { params: {} },
      { params: { topicMode: 'other' } },
      { params: { topicMode: 'fixed' } },
      { params: { ...runParams(), imageCount: 11 } },
      { params: { ...runParams(), imageCount: -1 } },
    ],
    validResponse: { runId: 'run_42' },
    invalidResponse: { runId: '' },
  },
  {
    endpoint: 'run/cancel',
    name: 'run/cancel：按 runId 取消，返回 ok',
    validRequests: [{ runId: 'run_42' }],
    invalidRequests: [{}, { runId: 42 }],
    validResponse: { ok: true },
    invalidResponse: { ok: 'true' },
  },
  {
    endpoint: 'schedule/save',
    name: 'schedule/save：RRULE+IANA 时区+params，返回视图',
    validRequests: [
      {
        name: '每日早四点',
        rrule: 'FREQ=DAILY;BYHOUR=4',
        timeZone: 'Asia/Shanghai',
        params: runParams(),
        enabled: true,
      },
      {
        id: 'sch_1',
        name: '每周一',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        timeZone: 'America/New_York',
        params: { topicMode: 'hotspots' },
        enabled: false,
      },
    ],
    invalidRequests: [
      { name: 'n', timeZone: 'Asia/Shanghai', params: runParams(), enabled: true },
      { name: 'n', rrule: '', timeZone: 'Asia/Shanghai', params: runParams(), enabled: true },
      { name: 'n', rrule: 'FREQ=DAILY', timeZone: 'Mars/Olympus', params: runParams(), enabled: true },
      { name: 'n', rrule: 'FREQ=DAILY', timeZone: 'Asia/Shanghai', enabled: true },
    ],
    validResponse: scheduleViewModel(),
    invalidResponse: { ...scheduleViewModel(), publishTarget: 'publish' },
  },
  {
    endpoint: 'schedule/delete',
    name: 'schedule/delete：按 id 删除，返回 deleted 布尔',
    validRequests: [{ id: 'sch_1' }],
    invalidRequests: [{}],
    validResponse: { deleted: true },
    invalidResponse: {},
  },
  {
    endpoint: 'schedule/toggle',
    name: 'schedule/toggle：id+enabled，返回视图',
    validRequests: [{ id: 'sch_1', enabled: false }],
    invalidRequests: [{ id: 'sch_1' }, { enabled: false }, { id: 'sch_1', enabled: 'off' }],
    validResponse: { ...scheduleViewModel(), enabled: false },
    invalidResponse: { ...scheduleViewModel(), revision: 'three' },
  },
  {
    endpoint: 'schedule/runNow',
    name: 'schedule/runNow：立即派发一次，返回 runId',
    validRequests: [{ id: 'sch_1' }],
    invalidRequests: [{}],
    validResponse: { runId: 'run_77' },
    invalidResponse: { runId: 77 },
  },
  {
    endpoint: 'config/get',
    name: 'config/get：空请求，全脱敏 ConfigView',
    validRequests: [{}],
    invalidRequests: [{ deep: true }],
    validResponse: configView(),
    invalidResponse: { ...configView(), settings: { ...configView().settings, runHistoryLimit: 'many' } },
  },
  {
    endpoint: 'config/set',
    name: 'config/set：Partial<SettingsRecord>，未知键拒',
    validRequests: [
      { wechatAuthor: 'Jerry' },
      { runHistoryLimit: 500 },
      { llmDefault: { provider: 'openai', model: 'deepseek-v4' } },
      { imageProviders: [{ providerId: 'doubao', credentialRef: 'WEWRITE_IMG_DOUBAO' }] },
      {},
    ],
    invalidRequests: [
      { runHistoryLimit: 0 },
      { runHistoryLimit: 1001 },
      { wechatSecret: 'should-not-exist' },
      { defaultImageSize: 'not-a-size' },
    ],
    validResponse: configView(),
    invalidResponse: { ...configView(), imageProviders: 'openai' },
  },
  {
    endpoint: 'credentials/set',
    name: 'credentials/set：POSIX ref + 非空 value，只写直通',
    validRequests: [
      { ref: 'WEWRITE_WECHAT_SECRET', value: 'abc123' },
      { ref: 'WEWRITE_IMG_OPENAI', value: 'sk-x' },
    ],
    invalidRequests: [
      { ref: 'wechat-secret', value: 'x' },
      { ref: 'lowercase_ref', value: 'x' },
      { ref: 'WEWRITE_SECRET', value: '' },
      { ref: 'WEWRITE_SECRET' },
      { value: 'x' },
    ],
    validResponse: { ok: true },
    invalidResponse: { ok: 1 },
  },
  {
    endpoint: 'credentials/describe',
    name: 'credentials/describe：ref→{configured,writable} 映射',
    validRequests: [{}],
    invalidRequests: [{ ref: 'X' }],
    validResponse: {
      WEWRITE_WECHAT_SECRET: { configured: false, writable: true },
      WEWRITE_IMG_OPENAI: { configured: true, writable: true },
    },
    invalidResponse: {
      WEWRITE_WECHAT_SECRET: { configured: 'no', writable: true },
    },
  },
  {
    endpoint: 'llm/options',
    name: 'llm/options：透传平台 providers 与 models',
    validRequests: [{}],
    invalidRequests: [{ all: true }],
    validResponse: { providers: [{ id: 'openai', models: ['deepseek-v4', 'gpt-5'] }] },
    invalidResponse: { providers: [{ id: 'openai', models: 'deepseek-v4' }] },
  },
  {
    endpoint: 'wechat/pushDraft',
    name: 'wechat/pushDraft：articleId，返回 mediaId+thumbMediaId',
    validRequests: [{ articleId: 'art_1' }],
    invalidRequests: [{}, { articleId: '' }, { articleId: 'art_1', force: true }],
    validResponse: { mediaId: 'MEDIA_1', thumbMediaId: 'THUMB_1' },
    invalidResponse: { mediaId: 'MEDIA_1' },
  },
  {
    endpoint: 'wechat/diagnose',
    name: 'wechat/diagnose：探测结果（40164 特判面）',
    validRequests: [{}],
    invalidRequests: [{ refresh: true }],
    validResponse: { reachable: true, ipWhitelisted: false, errcode: 40164, hint: '出口 IP 1.2.3.4 不在白名单' },
    invalidResponse: { reachable: 'yes', hint: '' },
  },
];

describe('RPC 端点 schema 形状（表驱动）', () => {
  for (const testCase of CASES) {
    describe(testCase.endpoint, () => {
      it(`${testCase.name} —— 合法请求过`, () => {
        const schema = rpcContract[testCase.endpoint].request;
        for (const req of testCase.validRequests) {
          const result = schema.safeParse(req);
          expect(result.success, JSON.stringify(req)).toBe(true);
        }
      });

      it(`${testCase.name} —— 非法请求拒`, () => {
        const schema = rpcContract[testCase.endpoint].request;
        for (const req of testCase.invalidRequests) {
          const result = schema.safeParse(req);
          expect(result.success, JSON.stringify(req)).toBe(false);
        }
      });

      it(`${testCase.name} —— 合法响应过`, () => {
        const result = rpcContract[testCase.endpoint].response.safeParse(testCase.validResponse);
        expect(result.success).toBe(true);
      });

      it(`${testCase.name} —— 非法响应拒`, () => {
        const result = rpcContract[testCase.endpoint].response.safeParse(testCase.invalidResponse);
        expect(result.success).toBe(false);
      });

      it(`${testCase.name} —— 请求多余未知键拒（契约漂移防护）`, () => {
        const schema = rpcContract[testCase.endpoint].request;
        const base = testCase.validRequests[0];
        const polluted = typeof base === 'object' && base !== null ? { ...base, __unknownField: 1 } : base;
        expect(schema.safeParse(polluted).success).toBe(false);
      });
    });
  }
});

describe('RunParamsSchema 边界（Spec §6 paramsSnapshot）', () => {
  it('imageCount 边界：0 与 10 过，-1 与 11 拒（单篇正文图上限 10）', () => {
    const mk = (imageCount: number) => ({ topicMode: 'fixed' as const, imageCount });
    expect(RunParamsSchema.safeParse(mk(0)).success).toBe(true);
    expect(RunParamsSchema.safeParse(mk(10)).success).toBe(true);
    expect(RunParamsSchema.safeParse(mk(-1)).success).toBe(false);
    expect(RunParamsSchema.safeParse(mk(11)).success).toBe(false);
  });

  it('imageCount 必须是整数', () => {
    expect(RunParamsSchema.safeParse({ topicMode: 'fixed', imageCount: 2.5 }).success).toBe(false);
  });

  it('topicMode 仅 hotspots|fixed', () => {
    expect(RunParamsSchema.safeParse({ topicMode: 'hotspots' }).success).toBe(true);
    expect(RunParamsSchema.safeParse({ topicMode: 'fixed', topic: 'T' }).success).toBe(true);
    expect(RunParamsSchema.safeParse({ topicMode: 'random' }).success).toBe(false);
    expect(RunParamsSchema.safeParse({}).success).toBe(false);
  });

  it('llm 覆盖仅 provider/model 两键，多余键拒', () => {
    const base = { topicMode: 'fixed' as const, llm: { provider: 'openai', model: 'deepseek-v4' } };
    expect(RunParamsSchema.safeParse(base).success).toBe(true);
    expect(RunParamsSchema.safeParse({ ...base, llm: { ...base.llm, apiKey: 'x' } }).success).toBe(false);
  });
});

describe('视图模型 schema 细项', () => {
  it('HotspotItemSchema：title/source/rank/url 必填，多余键拒', () => {
    const item = { title: 't', source: 's', rank: 1, url: 'https://x.example.test/a' };
    expect(HotspotItemSchema.safeParse(item).success).toBe(true);
    expect(HotspotItemSchema.safeParse({ ...item, extra: 1 }).success).toBe(false);
    expect(HotspotItemSchema.safeParse({ title: 't', source: 's', rank: 1 }).success).toBe(false);
  });

  it('ArticleListItemSchema：status 枚举 editing|rendered|pushed|failed', () => {
    for (const status of ['editing', 'rendered', 'pushed', 'failed']) {
      expect(ArticleListItemSchema.safeParse({ ...articleListItem(), status }).success).toBe(true);
    }
    expect(ArticleListItemSchema.safeParse({ ...articleListItem(), status: 'archived' }).success).toBe(false);
  });

  it('ArticleDetailSchema：可选回填字段 wechatMediaId/thumbMediaId/lastRunId', () => {
    const withPushed = { ...articleDetail(), status: 'pushed', wechatMediaId: 'M1', thumbMediaId: 'T1', lastRunId: 'run_9' };
    expect(ArticleDetailSchema.safeParse(withPushed).success).toBe(true);
    expect(ArticleDetailSchema.safeParse({ ...articleDetail(), wechatMediaId: 42 }).success).toBe(false);
  });

  it('RunSummarySchema：status 含全部六态（queued/running/succeeded/failed/cancelled/interrupted）', () => {
    for (const status of ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted']) {
      expect(RunSummarySchema.safeParse({ ...runSummary(), status }).success).toBe(true);
    }
    expect(RunSummarySchema.safeParse({ ...runSummary(), status: 'paused' }).success).toBe(false);
  });

  it('ScheduleViewModelSchema：publishTarget 仅 draft（AC-10 类型层不可达群发）', () => {
    expect(ScheduleViewModelSchema.safeParse(scheduleViewModel()).success).toBe(true);
    expect(ScheduleViewModelSchema.safeParse({ ...scheduleViewModel(), publishTarget: 'publish' }).success).toBe(false);
    expect(ScheduleViewModelSchema.safeParse({ ...scheduleViewModel(), publishTarget: 'freepublish' }).success).toBe(false);
  });

  it('SnapshotResponseSchema：五键齐全，缺 capabilities 拒', () => {
    expect(SnapshotResponseSchema.safeParse(snapshotResponse()).success).toBe(true);
    const { capabilities, ...withoutCapabilities } = snapshotResponse();
    expect(capabilities).toBeDefined();
    expect(SnapshotResponseSchema.safeParse(withoutCapabilities).success).toBe(false);
  });
});

describe('ConfigViewSchema 脱敏面（AC-5 契约层防御）', () => {
  it('settings 字段全集不含任何机密命名字段（secret/token/key/password）', () => {
    const parsed = ConfigViewSchema.safeParse(configView());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const keys = Object.keys(parsed.data.settings as Record<string, unknown>);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(/secret|token|key|password/i.test(key), `敏感字段名泄漏: ${key}`).toBe(false);
    }
  });

  it('credentials 描述符只有 configured/writable 两键——永不携带凭据值', () => {
    const parsed = ConfigViewSchema.safeParse(configView());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const values = Object.values(parsed.data.credentials as Record<string, Record<string, unknown>>);
    for (const descriptor of values) {
      expect(Object.keys(descriptor).sort()).toEqual(['configured', 'writable']);
    }
  });

  it('settings 嵌套多余机密键拒（wechatSecret 注入被拒）', () => {
    const polluted = {
      ...configView(),
      settings: { ...configView().settings, wechatSecret: 'leak' },
    };
    expect(ConfigViewSchema.safeParse(polluted).success).toBe(false);
  });

  it('runHistoryLimit 边界：1-1000', () => {
    const mk = (n: number) => ({ ...configView(), settings: { ...configView().settings, runHistoryLimit: n } });
    expect(ConfigViewSchema.safeParse(mk(1)).success).toBe(true);
    expect(ConfigViewSchema.safeParse(mk(1000)).success).toBe(true);
    expect(ConfigViewSchema.safeParse(mk(0)).success).toBe(false);
    expect(ConfigViewSchema.safeParse(mk(1001)).success).toBe(false);
  });
});
