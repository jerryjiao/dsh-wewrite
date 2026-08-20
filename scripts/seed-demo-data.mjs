#!/usr/bin/env node
/**
 * 演示数据种子（README/官网截图 + E2E demo 相位共用，2026-08-19）。
 * 直接写 storage unit JSON（须在 dsh web 未运行时执行——host 内存态会覆盖文件，
 * CLI 入口有防御断言）。记录形状严格对齐 src/host/domain.ts 的 zod strictObject
 * （多余字段会拒载；claimedOccurrences 是数组、unit header 是对象等坑见
 * tests/e2e/session.mjs 注释）。
 *
 * 种子集合（幂等：整表替换，重跑不累积）：
 *   articles ×3  art_demo_20260819（主，rendered，最近编辑 → AC-2 默认载入）
 *                art_demo_second_20260819（editing，updatedAt 早于主文章——多篇时
 *                  「最近编辑一篇」区分度，B02）
 *                art_demo_gatefail_20260819（failed + lastRunId → gate-failed run，
 *                  E06 红色门禁标记与推送阻断）
 *   runs ×2      run_demo_20260819（succeeded）+ run_demo_gatefail_20260819
 *                （failed，error.code='gate-failed'——client/lib/gate.ts 的推导口径）
 *   schedules ×1 sched_demo_weekly（enabled=false，F01/F06 队列计数锚）
 *   settings     imageProviders 裁单家 openai（H01 的 AC-9 一次 401 快速失败；
 *                G06 两态兼容：首项 openai 断言两种形态都成立）
 *
 * 刻意不种 trigger=schedule 的历史 run：QA 的 F02 已重锚为「全部历史空态」边界断言
 * （前置注释明确「种子 run trigger=manual → 定时历史为空」）——种 schedule run 会让
 * 该用例必挂。定时历史非空路径留待后续用例扩展时再补。
 *
 * 用法：
 *   CLI：node scripts/seed-demo-data.mjs（宿主须停；读现网 unit 就地种入）
 *   库：  import { seedDemoData } from './seed-demo-data.mjs'（tests/e2e/session.mjs
 *         的 seedDemo 调用；不执行 CLI 段）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findHostPids } from './hostctl.mjs';

const UNIT = join(homedir(), '.dsh/storages/dsh_wewrite.json');

const now = () => new Date();
const iso = (base, minAgo) => new Date(base.getTime() - minAgo * 60_000).toISOString();

const MAIN_MARKDOWN = [
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

const SECOND_MARKDOWN = [
  '# 独立开发者的内容复利手册',
  '',
  '写一篇文章的成本是一次性的，收益却可以持续很多年——这是内容资产区别于外包接单的第一性原理。',
  '多数独立开发者不是不写作，而是每次都从零开始：选题靠灵感、结构靠现想、排版靠手调，',
  '三篇之后热情耗尽，账号归零。',
  '',
  '## 把一次写作变成三次复用',
  '',
  '同一条内容主线，第一次产出长文，第二次拆成短内容，第三次浓缩为产品页文案。复用的关键',
  '不是勤奋，而是中间产物可沉淀：大纲、初稿、审校记录都留在本地，随时可检索可重组。',
  '',
  '## 管线化不是自动化',
  '',
  '把选题、写作、门禁、排版串成管线，不是为了无人值守地发布，而是让每一步的修改成本降到',
  '最低。模型负责初稿与格式，人负责判断与取舍，账号安全边界写进默认值。',
  '',
  '从下一篇文章开始，让写作成为资产而不是消耗。',
].join('\n');

const GATEFAIL_MARKDOWN = [
  '# 十分钟搭好本地知识库',
  '',
  '本地优先的知识库不需要复杂技术栈：一个 Markdown 目录、一份索引脚本、一条全文搜索命令，',
  '十分钟就能搭好，且数据永远在你自己手里。',
  '',
  '## 三步走',
  '',
  '1. 目录即分类：文件夹命名遵循主题，不再维护额外元数据',
  '2. 索引脚本：遍历目录生成倒排索引，秒级完成',
  '3. 搜索接入：命令行或编辑器内直达',
  '',
  '（本文门禁未通过：正文章节编号与配图数量不一致，待修订后重新过审。）',
].join('\n');

/**
 * 种子写入（纯函数，幂等）：整表替换 articles/runs/schedules/images 为种子集，
 * global.settings 只覆盖 imageProviders（裁单家 openai），其余设置字段（appid、
 * llmDefault 等）原样保留——demo 相位不翻动 fresh 相位已配的模型与凭据。
 * 时间戳相对当前时刻生成（相对关系固定；重跑 id 集合与字段值一致）。
 */
export function seedDemoData(unit) {
  const base = now();
  const at = (minAgo) => iso(base, minAgo);

  const articleId = 'art_demo_20260819';
  const secondId = 'art_demo_second_20260819';
  const gatefailId = 'art_demo_gatefail_20260819';
  const runId = 'run_demo_20260819';
  const gatefailRunId = 'run_demo_gatefail_20260819';
  const stepNames = ['topic', 'outline', 'draft', 'gates', 'render', 'images'];
  const stepMin = [86, 84, 12, 26, 8, 41]; // 主 run 各步完成于 N 分钟前

  unit.tables.articles = {
    [articleId]: {
      v: 1,
      id: articleId,
      slug: 'dsh-wewrite-pipeline',
      title: '把公众号写作管线装进 DeepSeek Harness',
      digest: '选题、写作、门禁、排版、配图、草稿箱串成一条可复现的管线，定时只进草稿箱，群发永远留给人工。',
      status: 'rendered',
      markdown: MAIN_MARKDOWN,
      theme: 'professional-clean',
      bodyImageIds: [],
      lastRunId: runId,
      createdAt: at(96),
      updatedAt: at(3), // 最新 → B02「默认载入最近编辑一篇」
    },
    [secondId]: {
      v: 1,
      id: secondId,
      slug: 'indie-content-compounding',
      title: '独立开发者的内容复利手册',
      digest: '同一条内容主线三次复用，中间产物可沉淀可检索，让写作成为资产而不是消耗。',
      status: 'editing', // 「草稿」筛选 chip 的非空数据源
      markdown: SECOND_MARKDOWN,
      theme: 'professional-clean',
      bodyImageIds: [],
      createdAt: at(300),
      updatedAt: at(50), // 早于主文章 → 多篇时主文章仍是「最近编辑」
    },
    [gatefailId]: {
      v: 1,
      id: gatefailId,
      slug: 'local-knowledge-base-10min',
      title: '十分钟搭好本地知识库',
      digest: '目录即分类、索引脚本、搜索接入三步走。本稿门禁未过，修订后重新过审。',
      status: 'failed',
      markdown: GATEFAIL_MARKDOWN,
      theme: 'professional-clean',
      bodyImageIds: [],
      lastRunId: gatefailRunId, // → gate-failed run → rail 红色门禁标记（E06）
      createdAt: at(120),
      updatedAt: at(90),
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
        startedAt: at(stepMin[i] + 4),
        finishedAt: at(stepMin[i]),
        ...(name === 'gates' ? { metrics: { score: 88, rules: 7, failed: 0 } } : {}),
        ...(name === 'draft' ? { metrics: { chars: 986 } } : {}),
      })),
      summary: '门禁 88/100，渲染完成，待推送草稿箱',
      startedAt: at(88),
      finishedAt: at(6),
    },
    [gatefailRunId]: {
      v: 1,
      id: gatefailRunId,
      trigger: 'manual',
      articleId: gatefailId,
      paramsSnapshot: { topicMode: 'fixed', topic: '十分钟搭好本地知识库', imageCount: 1 },
      status: 'failed',
      steps: [
        { name: 'topic', status: 'succeeded', startedAt: at(104), finishedAt: at(100) },
        { name: 'outline', status: 'succeeded', startedAt: at(100), finishedAt: at(96) },
        {
          name: 'draft',
          status: 'succeeded',
          startedAt: at(96),
          finishedAt: at(94),
          metrics: { chars: 642 },
        },
        {
          name: 'gates',
          status: 'failed',
          startedAt: at(94),
          finishedAt: at(91),
          error: { code: 'gate-failed', message: '质量门禁未通过：章节编号与配图数量不一致（2 项规则未过）' },
          metrics: { score: 61, rules: 7, failed: 2 },
        },
        { name: 'render', status: 'pending' },
        { name: 'images', status: 'pending' },
      ],
      error: { code: 'gate-failed', message: '质量门禁未通过：章节编号与配图数量不一致（2 项规则未过）' },
      summary: '门禁 61/100，2 项规则未过，管线止于质量门禁',
      startedAt: at(104),
      finishedAt: at(91),
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
      createdAt: at(300),
      updatedAt: at(300),
    },
  };

  unit.tables.images = {};

  // 图片链裁单家（H01 前置：images 步 1 次 401 快速失败；G06 两态兼容不受影响）
  unit.global.settings = {
    ...unit.global.settings,
    imageProviders: [{ providerId: 'openai', credentialRef: 'WEWRITE_IMG_OPENAI' }],
  };

  return unit;
}

// ---------- CLI 入口（import 复用时无副作用） ----------
const invokedAsCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsCli) {
  const pids = findHostPids();
  if (pids.length) {
    console.error(`拒绝执行：dsh web 正在运行（PID ${pids.join(', ')}），host 内存态会覆盖文件。先 node scripts/hostctl.mjs stop`);
    process.exit(1);
  }
  const unit = JSON.parse(readFileSync(UNIT, 'utf8'));
  seedDemoData(unit);
  writeFileSync(UNIT, JSON.stringify(unit, null, 2), 'utf8');
  console.log('seeded: 3 articles / 2 runs / 1 schedule + imageProviders=单家openai ->', UNIT);
}
