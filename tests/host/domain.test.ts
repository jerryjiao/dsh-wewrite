import { describe, expect, it } from 'vitest';
import {
  ArticleRecordSchema,
  ImageRecordSchema,
  RunRecordSchema,
  ScheduleRecordSchema,
  SettingsRecordSchema,
  domainSpec,
} from '@/host/domain';
import { RunParamsSchema } from '@/shared/contract';

/**
 * storage domain schema 测试：与 Spec §6 数据表清单逐字段对齐。
 *
 * 本文件钉定 src/host/domain.ts 消费面：domainSpec 常量 + 5 个 zod schema。
 * 约束来源：Spec §6 表格、架构 §5 字段说明（含全部记录带 v 字段）。
 */

const articleRecord = () => ({
  v: 1,
  id: 'art_1',
  slug: 'dsh-open-source',
  title: 'DeepSeek Harness 开源一夜 8 万星',
  digest: '平台背景观察',
  status: 'editing' as const,
  markdown: '# 标题\n\n正文',
  theme: 'professional-clean',
  bodyImageIds: ['img_1'],
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
});

const runRecord = () => ({
  v: 1,
  id: 'run_1',
  trigger: 'manual' as const,
  paramsSnapshot: { topicMode: 'fixed' as const, topic: 'T' },
  status: 'succeeded' as const,
  steps: [
    {
      name: 'draft',
      status: 'succeeded' as const,
      startedAt: '2026-08-18T04:00:01.000Z',
      finishedAt: '2026-08-18T04:01:00.000Z',
    },
  ],
  startedAt: '2026-08-18T04:00:00.000Z',
  finishedAt: '2026-08-18T04:05:00.000Z',
});

const scheduleRecord = () => ({
  v: 1,
  id: 'sch_1',
  revision: 1,
  name: '每日早四点',
  rrule: 'FREQ=DAILY;BYHOUR=4',
  timeZone: 'Asia/Shanghai',
  params: { topicMode: 'fixed' as const, topic: 'T' },
  publishTarget: 'draft' as const,
  enabled: true,
  nextRunAt: '2026-08-19T04:00:00+08:00',
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
});

const imageRecord = () => ({
  v: 1,
  id: 'img_1',
  articleId: 'art_1',
  kind: 'cover' as const,
  mime: 'image/png',
  base64: Buffer.from('tiny-png-bytes').toString('base64'),
  provider: 'openai',
  model: 'gpt-image-2',
  prompt: '封面提示词',
  createdAt: '2026-08-18T04:03:00.000Z',
});

describe('domainSpec（单一 domain dsh-wewrite v1，ADR-0005）', () => {
  it('domain 名与版本锁定', () => {
    expect(domainSpec.name).toBe('dsh-wewrite');
    expect(domainSpec.version).toBe(1);
  });

  it('表集合精确为 articles/runs/schedules/images 四表（无增无减）', () => {
    expect(Object.keys(domainSpec.tables).sort()).toEqual(['articles', 'images', 'runs', 'schedules']);
  });
});

describe('SettingsRecord（global，非机密项；AC-5/架构 §8）', () => {
  it('默认值：runHistoryLimit=200，apiBaseUrl 默认官方直连，imageProviders 首位 openai，agentToolsEnabled=false', () => {
    const parsed = SettingsRecordSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const data = parsed.data as Record<string, unknown>;
    expect(data.runHistoryLimit).toBe(200);
    expect(data.wechatApiBaseUrl).toBe('https://api.weixin.qq.com');
    expect(data.agentToolsEnabled).toBe(false);
    const providers = data.imageProviders as Array<{ providerId: string }>;
    expect(providers.length).toBeGreaterThanOrEqual(1);
    expect(providers[0].providerId).toBe('openai');
  });

  it('字段全集不含机密命名（secret/token/key/password 一律走 credentials）', () => {
    const parsed = SettingsRecordSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const keys = Object.keys(parsed.data as Record<string, unknown>);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const key of keys) {
      expect(/secret|token|password|apikey|api_key|credential/i.test(key), `机密字段混入 SettingsRecord: ${key}`).toBe(false);
    }
  });

  it('imageProviders 每项含 providerId 与 credentialRef；providerId 必须在 9 家集合内', () => {
    const valid = SettingsRecordSchema.safeParse({
      imageProviders: [{ providerId: 'doubao', credentialRef: 'WEWRITE_IMG_DOUBAO' }],
    });
    expect(valid.success).toBe(true);

    const invalid = SettingsRecordSchema.safeParse({
      imageProviders: [{ providerId: 'not-a-provider', credentialRef: 'X' }],
    });
    expect(invalid.success).toBe(false);
  });
});

describe('ArticleRecord（Spec §6 articles）', () => {
  it('合法记录通过；digest 必填（draft/add 依赖）', () => {
    expect(ArticleRecordSchema.safeParse(articleRecord()).success).toBe(true);
    const { digest, ...withoutDigest } = articleRecord();
    expect(digest).toBeDefined();
    expect(ArticleRecordSchema.safeParse(withoutDigest).success).toBe(false);
  });

  it('status 枚举 editing|rendered|pushed|failed，其余拒', () => {
    for (const status of ['editing', 'rendered', 'pushed', 'failed']) {
      expect(ArticleRecordSchema.safeParse({ ...articleRecord(), status }).success).toBe(true);
    }
    expect(ArticleRecordSchema.safeParse({ ...articleRecord(), status: 'published' }).success).toBe(false);
  });

  it('推送回填字段 wechatMediaId/thumbMediaId 可选', () => {
    const pushed = { ...articleRecord(), status: 'pushed', wechatMediaId: 'M1', thumbMediaId: 'T1' };
    expect(ArticleRecordSchema.safeParse(pushed).success).toBe(true);
  });

  it('bodyImageIds 上限 10（Spec §10 单篇正文图 <=10 张）', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `img_${i}`);
    expect(ArticleRecordSchema.safeParse({ ...articleRecord(), bodyImageIds: eleven }).success).toBe(false);
    const ten = Array.from({ length: 10 }, (_, i) => `img_${i}`);
    expect(ArticleRecordSchema.safeParse({ ...articleRecord(), bodyImageIds: ten }).success).toBe(true);
  });
});

describe('RunRecord（Spec §6 runs）', () => {
  it('status 六态含 interrupted（宿主停机打断语义）', () => {
    for (const status of ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted']) {
      expect(RunRecordSchema.safeParse({ ...runRecord(), status }).success).toBe(true);
    }
    expect(RunRecordSchema.safeParse({ ...runRecord(), status: 'retrying' }).success).toBe(false);
  });

  it('trigger 仅 manual|schedule；调度触发可携带 scheduleId', () => {
    expect(RunRecordSchema.safeParse({ ...runRecord(), trigger: 'cron' }).success).toBe(false);
    const scheduled = { ...runRecord(), trigger: 'schedule', scheduleId: 'sch_1' };
    expect(RunRecordSchema.safeParse(scheduled).success).toBe(true);
  });

  it('步骤记录形状：name/status/startedAt/finishedAt/error{code,message}', () => {
    const failed = {
      ...runRecord(),
      status: 'failed',
      steps: [
        { name: 'gates', status: 'failed', startedAt: '2026-08-18T04:02:00.000Z', error: { code: 'gate-failed', message: 'humanness 不足' } },
      ],
      error: { code: 'gate-failed', message: 'humanness 不足' },
    };
    expect(RunRecordSchema.safeParse(failed).success).toBe(true);
    const badStep = { ...runRecord(), steps: [{ name: 'gates', status: 'exploded' }] };
    expect(RunRecordSchema.safeParse(badStep).success).toBe(false);
  });

  it('paramsSnapshot 与 shared 契约 RunParamsSchema 一致（双处 schema 不漂移）', () => {
    const sharedSample = { topicMode: 'fixed', topic: 'T', imageCount: 3 };
    expect(RunParamsSchema.safeParse(sharedSample).success).toBe(true);
    expect(RunRecordSchema.safeParse({ ...runRecord(), paramsSnapshot: sharedSample }).success).toBe(true);
    expect(RunRecordSchema.safeParse({ ...runRecord(), paramsSnapshot: { topicMode: 'nope' } }).success).toBe(false);
  });
});

describe('ScheduleRecord（Spec §6 schedules）', () => {
  it('合法记录通过；publishTarget 恒 draft（AC-10）', () => {
    expect(ScheduleRecordSchema.safeParse(scheduleRecord()).success).toBe(true);
    expect(ScheduleRecordSchema.safeParse({ ...scheduleRecord(), publishTarget: 'publish' }).success).toBe(false);
  });

  it('timeZone 必须是合法 IANA 时区', () => {
    expect(ScheduleRecordSchema.safeParse({ ...scheduleRecord(), timeZone: 'America/New_York' }).success).toBe(true);
    expect(ScheduleRecordSchema.safeParse({ ...scheduleRecord(), timeZone: 'UTC+8' }).success).toBe(false);
    expect(ScheduleRecordSchema.safeParse({ ...scheduleRecord(), timeZone: 'Mars/Olympus' }).success).toBe(false);
  });

  it('revision 为正整数；缺失拒', () => {
    expect(ScheduleRecordSchema.safeParse({ ...scheduleRecord(), revision: 5 }).success).toBe(true);
    expect(ScheduleRecordSchema.safeParse({ ...scheduleRecord(), revision: 0 }).success).toBe(false);
    expect(ScheduleRecordSchema.safeParse({ ...scheduleRecord(), revision: 'five' }).success).toBe(false);
  });
});

describe('ImageRecord（Spec §6 images）', () => {
  it('合法记录通过；kind 枚举 cover|body；mime 必须 image/*', () => {
    expect(ImageRecordSchema.safeParse(imageRecord()).success).toBe(true);
    expect(ImageRecordSchema.safeParse({ ...imageRecord(), kind: 'banner' }).success).toBe(false);
    expect(ImageRecordSchema.safeParse({ ...imageRecord(), mime: 'text/html' }).success).toBe(false);
    expect(ImageRecordSchema.safeParse({ ...imageRecord(), kind: 'body' }).success).toBe(true);
  });

  it('base64 超过单图 10MB 上限拒（Spec §10）', () => {
    const oversized = 'A'.repeat(14 * 1024 * 1024); // 14MiB 字符 > 10MB 二进制的 base64 编码长度上限
    expect(ImageRecordSchema.safeParse({ ...imageRecord(), base64: oversized }).success).toBe(false);
  });

  it('生成溯源字段 provider/model/prompt 必填（fallback 审计链）', () => {
    const { provider, ...withoutProvider } = imageRecord();
    expect(provider).toBeDefined();
    expect(ImageRecordSchema.safeParse(withoutProvider).success).toBe(false);
    const { prompt, ...withoutPrompt } = imageRecord();
    expect(prompt).toBeDefined();
    expect(ImageRecordSchema.safeParse(withoutPrompt).success).toBe(false);
  });

  it('上传回填字段 wechatUrl/wechatMediaId 可选', () => {
    const uploaded = { ...imageRecord(), wechatUrl: 'https://mmbiz.qpic.cn/x/0?wx_fmt=png', wechatMediaId: 'THUMB_1' };
    expect(ImageRecordSchema.safeParse(uploaded).success).toBe(true);
  });
});
