#!/usr/bin/env node
/**
 * 演示数据种子（README/官网截图用，2026-08-19）。
 * 直接写 storage unit JSON（须在 dsh web 未运行时执行——host 内存态会覆盖文件）。
 * 记录形状严格对齐 src/host/domain.ts 的 zod strictObject（多余字段会拒载）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const UNIT = join(homedir(), '.dsh/storages/dsh_wewrite.json');
const now = new Date();
const iso = (minAgo) => new Date(now.getTime() - minAgo * 60_000).toISOString();

const markdown = [
  '# 把公众号写作管线装进 DeepSeek Harness',
  '',
  '两周前 DeepSeek 开源了 Harness，一句「Everything is a Plugin」把模型之外的全部工程做成了插件位。',
  '生态里很快长出了调度器、通知器和各种工具面板，但内容生产一直是空的：想用 AI 持续写公众号，',
  '仍然要在选题工具、编辑器和后台草稿箱之间手动搬运。',
  '',
  '## 断裂的三截',
  '',
  '现有方案各自只解决一段：排版编辑器只管 Markdown 转图文；AI 写作 SaaS 是黑盒，模型不是你自己的；',
  '开源管线工具又停在命令行，没有配置界面，更没有定时能力。真正缺的是把选题、写作、门禁、排版、',
  '配图、草稿箱串成一条可复现的管线。',
  '',
  '## 管线的六个步骤',
  '',
  '1. 选题：热门榜抓取或给定主题',
  '2. 大纲：模型给出结构再动笔',
  '3. 成稿：按账号风格写作',
  '4. 门禁：结构、编号配图一致性、AI 味逐项校验',
  '5. 排版：Markdown 转微信内联样式 HTML',
  '6. 配图：九家图片供应商按序降级',
  '',
  '每一步的产物都落运行历史，改稿可追溯，推送前必须过目。',
  '',
  '## 安全默认是产品价值观',
  '',
  '定时任务只进草稿箱，群发永远留给人工；凭据只写本地；日志全链路脱敏。省下的审稿时间',
  '不值得拿账号资产去换。',
  '',
  '一条命令安装，打开工作台就能用。',
].join('\n');

const unit = JSON.parse(readFileSync(UNIT, 'utf8'));

const articleId = 'art_demo_20260819';
const runId = 'run_demo_20260819';
const stepNames = ['topic', 'outline', 'draft', 'gates', 'render', 'images'];
const stepMin = [86, 84, 12, 26, 8, 41]; // 各步完成于 N 分钟前

unit.tables.articles = {
  [articleId]: {
    v: 1,
    id: articleId,
    slug: 'dsh-wewrite-pipeline',
    title: '把公众号写作管线装进 DeepSeek Harness',
    digest: '选题、写作、门禁、排版、配图、草稿箱串成一条可复现的管线，定时只进草稿箱，群发永远留给人工。',
    status: 'rendered',
    markdown,
    theme: 'professional-clean',
    bodyImageIds: [],
    lastRunId: runId,
    createdAt: iso(96),
    updatedAt: iso(3),
  },
};

unit.tables.runs = {
  [runId]: {
    v: 1,
    id: runId,
    trigger: 'manual',
    articleId,
    paramsSnapshot: { topicMode: 'fixed', topic: '把公众号写作管线装进 DeepSeek Harness', imageCount: 1 },
    status: 'succeeded',
    steps: stepNames.map((name, i) => ({
      name,
      status: 'succeeded',
      startedAt: iso(stepMin[i] + 4),
      finishedAt: iso(stepMin[i]),
      ...(name === 'gates' ? { metrics: { score: 88, rules: 7, failed: 0 } } : {}),
      ...(name === 'draft' ? { metrics: { chars: 986 } } : {}),
    })),
    summary: '门禁 88/100，渲染完成，待推送草稿箱',
    startedAt: iso(88),
    finishedAt: iso(6),
  },
};

unit.tables.schedules = {
  sched_demo_weekly: {
    v: 1,
    id: 'sched_demo_weekly',
    revision: 1,
    name: '每周三早七点选题快评',
    rrule: 'FREQ=WEEKLY;BYDAY=WE;BYHOUR=7;BYMINUTE=0',
    timeZone: 'Asia/Shanghai',
    params: { topicMode: 'hotspots', imageCount: 1 },
    publishTarget: 'draft',
    enabled: false,
    nextRunAt: '2026-08-25T23:00:00.000Z',
    createdAt: iso(300),
    updatedAt: iso(300),
  },
};

writeFileSync(UNIT, JSON.stringify(unit, null, 2), 'utf8');
console.log('seeded: 1 article / 1 run / 1 schedule ->', UNIT);
