# 智谱真通道收尾与 Playwright E2E 测试架构（v0.1.5 测试轮）

| 项 | 内容 |
|---|---|
| 产品 | dsh-wewrite — DSH 宿主的公众号 AI 写作管线插件 |
| 版本 | 测试架构 v0.1（对 v0.1.5 发版） |
| 作者 | 高见远（MVP 专家团架构师），2026-08-19 |
| 上游 | docs/spec.md v0.1.0、docs/tech-architecture.md v0.1、docs/qa-test-plan.md、.agent/memory/pitfalls.jsonl（dsh-llm-seam-real-protocol）、项目总监 2026-08-19 晚亲测现状 |
| 下游 | E2E 工程师（照 §2 目录与用例矩阵直接开工）、发布（v0.1.5 验收口径） |

> P0 视觉门禁三条全量继承（无 emoji 功能图标 / 无紫粉渐变 / 无模板味文案），本文档自身同样遵守。
> 事实与推测分离：`实测` 标注 = 本机 2026-08-19 核实；`ASSUMPTION` = 推测，附验证方式。

---

## 0. 现状核实（2026-08-19 晚，全部实测）

| # | 事实 | 状态 |
|---|---|---|
| S1 | 宿主进程 PID 45194（`node ~/.npm/_npx/1e7f6d9597241db0/.../dsh web`，npm exec 父进程 45175），监听 127.0.0.1:3080 | 实测 |
| S2 | `ps eww 45194` 里**没有 ZHIPU_API_KEY**（也没有 MATON_API_KEY）——宿主进程 env 缺口确认 | 实测 |
| S3 | ~/.dsh/settings.yaml 已配 `llm-pi-ai.providers.zhipu`：apiKeyEnv `ZHIPU_API_KEY`、baseURL `https://open.bigmodel.cn/api/paas/v4`、openai-completions 协议、provider 层 `reasoning: "off"`、三免费模型（glm-4.7-flash maxTokens 65536 / glm-4.5-flash maxTokens 8192 / glm-4-flash-250414 无 thinking 配置），前两个带 `compat.thinkingFormat: deepseek` | 实测 |
| S4 | key 真源 = `~/.zcode/cli/config.json` 的 `provider["builtin:bigmodel-coding-plan"].options.apiKey`（49 字符，同条目 baseURL 含 open.bigmodel.cn）；库中另有一把 imported:claude 条目也指向 bigmodel（按 `id 含 coding-plan` 精确匹配排除） | 实测 |
| S5 | 两模型 curl 直连 200（项目总监亲测）；上个 session 真机跑通「zhipu glm-4.5-flash 72 秒六步全绿」（pitfalls 最后一条） | 实测 |
| S6 | 管线六步 = `topic → outline → draft → gates → render → images`（src/host/pipeline/engine.ts `PIPELINE_STEP_NAMES`）；LLM 步只有 outline/draft 两步；UI 步骤标签：选题分析/研究与提纲/初稿写作/质量门禁/排版转换/配图生成 | 实测 |
| S7 | 图片供应商 9 家（openai/doubao/dashscope/jimeng/minimax/azure_openai/gemini/openrouter/replicate）**不含智谱**；glm-4v-flash 是视觉理解模型非生图，智谱生图（CogView 系列）不在插件矩阵 | 实测 |
| S8 | 写作台「开始写作」硬编码 `imageCount: 1`（topic-panel.tsx:68）——UI 真跑路径必然执行 images 步；无凭据时 fallback 链按序全试（每家 1 次 AUTH 类失败），步 `failed` 但 run `succeeded`（AC-9 无图推进） | 实测 |
| S9 | playwright 1.62.1 在 workspace 根 node_modules；`import 'playwright'` 从本项目向上解析命中（scripts/tmp-probe-btn.mjs 实证）；项目 devDeps 无 @playwright/test | 实测 |
| S10 | 安装链路：profile `github:jerryjiao/dsh-wewrite#v0.1.4`（v0.1.4 已装）+ 手动 `cp lib/` 覆盖 `~/.dsh/profiles/web/node_modules/dsh-wewrite/lib/`（08-19 17:39 实证生效） | 实测 |
| S11 | storage unit `~/.dsh/storages/dsh_wewrite.json` 顶层 `{unit, global:{v,settings,claimedOccurrences}, tables:{articles,runs,schedules,images}}`；现网 3 文章/4 run/1 schedule | 实测 |
| S12 | settings `llmDefault` 默认 `{}`——模型未配时管线启动立即失败，engine 显式报 `llm-not-configured`（「模型服务未配置：请在 设置 → 模型服务 选择供应商与模型后再运行管线」） | 实测 |
| S13 | 智谱免费模型限流档位官方页面需登录 usercenter 查看，公开文档无具体数字（社区旧资料：GLM-4-Flash 早期新用户 2 并发）——按「低并发低 QPM」做防御设计 | 实测（查证过程） |

---

## 1. 智谱真通道收尾方案

### 1.1 宿主生命周期与 key 注入（ADR-010）

#### 1.1.1 key 注入方式选型

| 方案 | 优点 | 缺点 | 裁决 |
|---|---|---|---|
| A. ~/.zshrc export（先例 MATON_API_KEY） | 交互 shell 起宿主自动带；Jerry 零操作 | key 产生第二份副本（单一真源被破坏，zcode 轮换 key 后 .zshrc 漂移失效）；**非交互环境（脚本 spawn/launchd/GUI）不继承**；E2E 从 Node spawn 宿主时还得显式传，等于两套机制并存 | 否决 |
| B. **launch 时脚本注入**（hostctl 从 zcode config 现读现注） | key 单一真源（只在 zcode config，轮换自动跟随）；交互/非交互统一；不落 shell history 不落盘；E2E 基建与人工共用同一入口 | 必须经 hostctl 起宿主，裸 `npx dsh web` 仍会缺 env——用文档+alias 约束 | **采纳** |
| C. launchd plist | 真 daemon、env 固定、开机自启 | 开发宿主不是服务，过重；改 key 要 kickstart； Jerry 桌面按需启动场景收益为零 | 否决 |

与 MATON 先例的本质差别：MATON 的消费者是**短命脚本进程**（每次 node 跑都从 shell 继承 env）；ZHIPU_API_KEY 的消费者是**常驻宿主进程**，必须进程启动瞬间在场，之后无法后补（F19 热更新只对凭据解析，对进程 env 无效）。语义不同，不套同款方案。

#### 1.1.2 scripts/hostctl.mjs（宿主生命周期 CLI，新建）

命令面：

```bash
node scripts/hostctl.mjs status    # 查 PID/端口/env/就绪状态
node scripts/hostctl.mjs start     # 未跑才拉起（带 ZHIPU_API_KEY）
node scripts/hostctl.mjs stop      # SIGTERM → 轮询端口释放 ≤15s → SIGKILL 兜底
node scripts/hostctl.mjs restart   # stop + start（已带 env 时 start 直通）
```

核心逻辑（工程师照抄级）：

```js
// scripts/hostctl.mjs（骨架）
import { spawn, execSync } from 'node:child_process';
import { readFileSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:3080';
const LOG = '/tmp/dsh-web.log';

function extractZhipuApiKey() {
  const config = JSON.parse(readFileSync(join(homedir(), '.zcode/cli/config.json'), 'utf8'));
  for (const [id, provider] of Object.entries(config.provider ?? {})) {
    const baseURL = provider?.options?.baseURL ?? '';
    const apiKey = provider?.options?.apiKey;
    if (id.includes('coding-plan') && baseURL.includes('open.bigmodel.cn')
        && typeof apiKey === 'string' && apiKey.length >= 40) return apiKey;
  }
  throw new Error('zcode config 未找到 bigmodel coding-plan key');
}

function findHostPid() {  // lsof -ti tcp:3080；空返回 null
  try { return execSync('lsof -ti tcp:3080').toString().trim() || null; }
  catch { return null; }
}

function hasZhipuEnv(pid) {  // macOS ps eww；S2 的检测方式
  try { return execSync(`ps eww ${pid}`).toString().includes('ZHIPU_API_KEY='); }
  catch { return false; }
}

async function waitReady(timeoutMs = 60000) {  // fetch 轮询：任何 HTTP 响应（含 404/5xx）都算监听；ECONNREFUSED 重试
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await fetch(BASE, { signal: AbortSignal.timeout(2000) }); return true; }
    catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error(`宿主 ${BASE} ${timeoutMs}ms 未就绪，看 ${LOG}`);
}

async function start() {
  const pid = findHostPid();
  if (pid) {
    console.log(`宿主已在跑（PID ${pid}），ZHIPU_API_KEY: ${hasZhipuEnv(pid) ? 'OK' : 'MISSING（用 restart 补）'}`);
    return;
  }
  const fd = openSync(LOG, 'a');
  const child = spawn('npx', ['@deepseek-ai/dsh', 'web'], {
    cwd: homedir(),
    env: { ...process.env, ZHIPU_API_KEY: extractZhipuApiKey() },  // 唯一注入点
    detached: true,                                                 // 脱离父进程
    stdio: ['ignore', fd, fd],                                      // 日志落文件，防 SIGPIPE 挂死
  });
  child.unref();
  await waitReady();
  console.log(`宿主已起（PID ${findHostPid()}），env OK，日志 ${LOG}`);
}
```

restart = `stop() → start()`；stop 顺序：`process.kill(pid, 'SIGTERM')` → 每 1s 查 `findHostPid()` 15 次 → 仍在则 SIGKILL。

**坑位清单（全部来自实测/先例）**：
1. 别用 `ZHIPU_API_KEY=xxx npx dsh web` 前台跑——shell 退出/Ctrl-C 宿主即死，且下次另一 session 起的就又没 env。必须 detached + unref + 日志重定向。
2. `npx` 冷启动可能重解析缓存（首次数十秒），waitReady 上限 60s；命中 npx 缓存（1e7f6d9597241db0）时数秒内就绪。
3. settings.yaml 的 `apiKeyEnv: ZHIPU_API_KEY` 每次操作重新解析（F19）——重启带上 env 后**无需改 settings**，立即生效。
4. hostctl 只对「本插件测试所需」的 env 负责；其他 env（MATON 等）与宿主无关，不掺和。
5. `ps eww` 是 macOS 专有；若未来跑 Linux CI 跳过 env 检测即可（CI 本来就 skip E2E，见 §2.6）。

**立即收尾动作**（本文档落地时执行一次）：

```bash
cd /Users/mac/Documents/workspace/apps/dsh-wewrite
node scripts/hostctl.mjs status   # 预期：PID 45194, ZHIPU_API_KEY: MISSING
node scripts/hostctl.mjs restart  # kill 45194 → 带 env 重启 → waitReady
node scripts/hostctl.mjs status   # 预期：新 PID, ZHIPU_API_KEY: OK
```

可选护栏（给 Jerry 的人工入口，不强制）：`alias dsh-web='node ~/Documents/workspace/apps/dsh-wewrite/scripts/hostctl.mjs restart'` 写进 .zshrc——保证人工起宿主也走同一注入点。

### 1.2 管线免费模型选择（ADR-010 附带）

| 模型 | 形态 | maxTokens（settings.yaml） | 管线适配评估 |
|---|---|---|---|
| **glm-4.7-flash（推荐默认）** | 混合推理（thinkingFormat deepseek，provider 层已 reasoning off） | **65536** | 2026 最新旗舰 flash（官方定位替代 4.5-flash）、质量最高；65536 输出预算使 draft 步（1500-3000 字中文）零截断风险 |
| glm-4-flash-250414（备选降级） | **非 reasoning**、128K 上下文 | settings 未标（走模型默认） | 最快；管线两步（短大纲+长初稿）质量足够；撞限流/求快时切它 |
| glm-4.5-flash（不推荐默认） | 混合推理（同 4.7） | **8192** | 已实测能跑通（72s 六步绿），但 8192 是三档里最紧的输出预算——reasoning 若被宿主按模型层 reasoningEfforts 打开，思考 token 会挤压正文；且已被 4.7 官方替代 |

**结论**：
- 插件设置 → 模型服务：供应商 `zhipu`、模型 `glm-4.7-flash`（E2E 里就是 G03-G05 用例的操作路径，见 §2.4）。
- reasoning 吃 token 的风险已在宿主配置层关死：settings.yaml `providers.zhipu.reasoning: "off"` 让宿主在 openai-completions 请求里带上思考关闭参数（thinkingFormat: deepseek 转译），插件侧 `pipeline/llm.ts` 不传 maxTokens、不掺思考逻辑，保持现状不动。
- 降级顺序（撞限流时人工/E2E 依次尝试）：glm-4.7-flash → glm-4-flash-250414 → 换时段重跑。glm-4.5-flash 仅作为 G04 菜单断言里的存在性验证对象，不作任何默认。

### 1.3 图片生成链路处理（ADR-012）

三条事实裁决：

1. **不为智谱加生图 provider**。glm-4v-flash 是识图（视觉理解）模型，不是生图；智谱生图是 CogView 系列，不在源管线 9 家矩阵、不在 Spec 锁定范围（Spec §3 反范围蔓延）。测试轮零改动。
2. **E2E 管线真跑不跳过 images 步，而是走真实失败降级路径**。写作台 UI 硬编码 `imageCount: 1`（S8）——真跑必然执行 images 步。没有配任何图片 key 时该步 AUTH 失败、run 仍 `succeeded`（AC-9 无图推进），这本身就是 Spec P1 验收标准的真实路径，比跳过覆盖更全。
3. **为省时降噪，E2E 数据准备时把 fallback 链裁成单家**。默认链 9 家会逐家发真 HTTP（9 次 401，约 10-25 秒网络噪声）。E2E demo 相位写 storage 时把 `global.settings.imageProviders` 置为单条 `[{providerId:'openai', credentialRef:'WEWRITE_IMG_OPENAI'}]`——images 步 1 次 401 快速失败，总时长和确定性都最优（helpers/storage.mjs 职责，见 §2.3）。默认链的完整 fallback 编排已由 vitest `providers-registry.test.ts` ×8 mock 覆盖，不依赖 E2E 重复验证。
4. **真实生图验收留手工**（gpt-image-2 需 OpenAI 付费 key，不属智谱免费测试轮），挂在 qa-test-plan §6 手工清单，本轮不自动化。

---

## 2. Playwright 无头 E2E 测试套件架构（核心交付）

### 2.1 运行方式选型：裸 playwright + 自研轻量 runner（ADR-011）

| 维度 | @playwright/test（test runner） | 裸 playwright + 自研 runner（采纳） |
|---|---|---|
| 依赖成本 | 新增 devDep（workspace monorepo 安装须 `--workspaces=false`，pitfall 7.1-2）；自带 playwright-core，**不与 workspace 根共用浏览器二进制**，要重新下载 Chromium 或配 PLAYWRIGHT_BROWSERS_PATH | 零新依赖；`import 'playwright'` 向上解析命中 workspace 根 1.62.1（S9 实证） |
| 隔离模型 | 每用例新 context——但我们的用例**依赖共享宿主状态**（storage 相位、穿越好的会话、管线产物），强制隔离反而是负担 | 单 browser 顺序复用，相位（§2.3）显式管理状态，与真实宿主语义一致 |
| 并行 | 支持并行——但宿主只有一个（3080 单实例、storage 单文件），**并行必然互相踩**，优势归零 | 串行执行，天然安全 |
| 重试/报告/trace | 内置 | 自研 ~60 行（run.mjs 汇总 pass/fail/失败截图/非零退出码） |
| 先例 | 无 | capture-screenshots.mjs / tmp-probe-btn.mjs 已验证整条链路（workspace 内解析、驱动真宿主、DOM 探测） |

裁决：**裸 playwright + 自研 runner**。约 50 个用例、单宿主串行、共享状态——test runner 的三大卖点（隔离/并行/重试基建）在本场景全部无效或有害，而它的成本（新依赖+浏览器二进制+隔离对抗）真实存在。MVP 恰到好处原则。

> 浏览器解析兜底顺序：① 自然向上解析（现状，零成本）；② 若未来 workspace 根移除 playwright：本项目本地 `npm install -D playwright --workspaces=false`（需重下浏览器）或 `NODE_PATH=/Users/mac/Documents/workspace/node_modules`（CJS 兜底）。首选①，文档钉死即可。

### 2.2 目录结构与 npm scripts

```
tests/e2e/
├── run.mjs                  # 入口：CI 探测跳过 → 相位调度 → 用例顺序执行 → 汇总/退出码
├── helpers/
│   ├── host.mjs             # hostctl 逻辑的库形态复用（findHostPid/hasZhipuEnv/start/stop/waitReady）
│   ├── storage.mjs          # backup()/reset()/seedDemo()/restore()——全部要求宿主已停（S11 形状）
│   ├── session.mjs          # openWorkbench(page)：穿越 onboarding→workspace→首消息→写作台 tab
│   └── assert.mjs           # expectVisible/expectText/expectDisabled + 失败时截图+HTML dump 到 .artifacts/
├── cases/
│   ├── a-navigation.mjs     # A01-A05
│   ├── b-dashboard.mjs      # B01-B04
│   ├── c-hotspots.mjs       # C01-C05
│   ├── d-articles.mjs       # D01-D07
│   ├── e-editor.mjs         # E01-E07
│   ├── f-schedule.mjs       # F01-F06
│   ├── g-settings.mjs       # G01-G09
│   ├── h-pipeline-live.mjs  # H01-H05（智谱真跑）
│   └── i-failure-modes.mjs  # I01-I03
└── .artifacts/              # 失败截图/HTML dump（gitignore）
scripts/
├── hostctl.mjs              # §1.1 CLI（新建）
└── dev-install.mjs          # dev loop：npm run build → cp lib/* → profile lib/ → hostctl restart（新建）
```

用例注册约定：每个 case 文件 `export default [{ id: 'A01', phase: 'fresh', run: async (ctx) => {...} }]`；ctx = `{ page, BASE, expect }`。runner 按 phase 分组、组内按文件内顺序执行（顺序即依赖，§2.4 前置列写明）。

npm scripts 接线（package.json，零新依赖）：

```json
"test:e2e": "node tests/e2e/run.mjs",
"host:status": "node scripts/hostctl.mjs status",
"host:start": "node scripts/hostctl.mjs start",
"host:stop": "node scripts/hostctl.mjs stop",
"host:restart": "node scripts/hostctl.mjs restart",
"dev:install": "node scripts/dev-install.mjs"
```

### 2.3 宿主驱动层设计

#### 2.3.1 相位（phase）管理——状态确定性的根基

E2E 最大风险是「宿主+storage 是共享单例状态」。解法：runner 把一次完整跑分四个相位，相位切换时**先停宿主**再动 storage（host 内存态会覆盖文件，seed-demo-data.mjs 注释已实证）：

| 相位 | 宿主动作 | storage 动作 | 跑哪些用例 |
|---|---|---|---|
| fresh | stop → start | 备份现网 unit 到 `/tmp/dsh-wewrite-e2e-backup.json` → 重置为最小空 unit（`{unit:'dsh_wewrite', global:{v:1,settings:{},claimedOccurrences:{}}, tables:{articles:{},runs:{},schedules:{},images:{}}}`，S11 形状；实施首日先 cat 现网 unit 对齐顶层字段再定稿） | 空态用例 + 导航 + 热榜 + 设置配置流（A/B01/B03/C/D06/G01-G05/I02） |
| demo | stop → start | 调 `seedDemo()`：仿 seed-demo-data.mjs 写 1 article/1 run/1 schedule 进 tables + `global.settings.imageProviders` 置单条 openai 链（§1.3-3）；**不动 llmDefault**（fresh 相位 G05 已配好，保留） | 有数据用例（B02/B04*/D01-D05/D07/E/F/G06-G09） |
| live | 保持运行 | 无改动 | 智谱真跑（H01-H05） |
| restore | stop → start | 从备份恢复 unit | I01（断连恢复顺带验证），随后 runner 收尾校验 storage 与备份一致 |

> B04（生成中待办行）标注 `*`：不独立起 run，并入 H01 的执行体内观察（开始写作后收起 overlay，断言写作台待办出现「正在生成」行，再打开 overlay 继续）——避免多付一次 LLM 真跑。
> backup/reset/seed/restore 全部只在宿主停止状态下执行（storage.mjs 内部先断言 `findHostPid() === null`，否则抛错拒绝跑）。

#### 2.3.2 session helper：穿越序列复用

把 capture-screenshots.mjs 第 1-3 段抽成 `openWorkbench(page)`（scripts 原文件保留不动，仅抽取共享逻辑）：

1. `page.goto(BASE, { waitUntil: 'domcontentloaded' })`；
2. onboarding 向导：`Continue/继续`（exact）→ `Configure later/稍后配置/Skip/跳过`（contains）——每步用 `expectVisible` 等待替代原脚本固定 sleep；
3. workspace 打开：placeholder 双语正则定位输入行 → fill `/tmp/dsh-demo-workspace` → Enter；已存在则点侧栏 workspace 项（原脚本两条路径全保留）；
4. 首消息激活会话：composer fill `e2e-init` → Enter——**不依赖模型回包成功**（capture 注释实证：无 key 报错但视图环已挂载），宿主 sessions 目录会积累少量 init 会话，无害不清理（避免误删真实 session）；
5. 点「写作台」tab（tabNames 数组保留双 locale 回退）；
6. 终点断言：`.dsh-wewrite-panel` 可见 + `#wewrite-panel-content` 存在。

browser context 参数（helper 内固定）：`locale: 'zh-CN'`、`viewport: {width:1440, height:900}`、`deviceScaleFactor: 1`（测试不要 2x，省内存；截图排查够用）。每个相位开始新建 context 跑一次 openWorkbench，相位内复用。

等待纪律：所有用例断言走 DOM 等待（`locator.waitFor({state:'visible', timeout})` 封装成 expectVisible），**禁止裸 sleep**；唯一例外是宿主就绪（host.waitReady 轮询）。

#### 2.3.3 dev loop 脚本化：scripts/dev-install.mjs

改版→生效链路三步一体（替代上个 session 的手动 cp）：

```
npm run build                                    # esbuild lib/index.js+shared.js+client.js + tsc types
cp -R lib/* ~/.dsh/profiles/web/node_modules/dsh-wewrite/lib/
node scripts/hostctl.mjs restart                 # 宿主重启强制加载新 lib
```

**为什么 cp 后必须重启宿主（风险 R2 的根治）**：host 侧 `lib/index.js` 是宿主进程 require 的 esbuild bundle，Cordis 无 watch、无热重载；client 侧 `lib/client.js` 虽有 `?rev=<hash>` 缓存破坏机制（build.mjs 的 `__ModuleLoader__.load` 外壳 + 宿主按内容出 rev），但宿主对插件内容的缓存边界（启动时缓存 vs 请求时读盘）无文档保证（UNKNOWN）。统一 restart 一并消除两侧不确定性，代价约 15 秒，换确定性。dev-install.mjs 顺序执行三步并在结尾跑一次 `host:status` 确认 env OK。

### 2.4 测试用例矩阵（51 用例，全用例无遗漏）

约定：前置列的相位即执行窗口；「面板」指 `.dsh-wewrite-panel` 内区域；断言全部 DOM 锚点（role/aria-label/text/class），不用像素对比。已知锚点速查：面板根 `.dsh-wewrite-panel`；顶栏 `nav[aria-label="WeWrite 工作台导航"]`；内容区 `#wewrite-panel-content`；写作台输入 `placeholder="输入主题，直接开写…"`；生成弹层标题 `正在生成《…》`；六步标签 选题分析/研究与提纲/初稿写作/质量门禁/排版转换/配图生成（S6）；设置导航 `nav[aria-label="设置分组"]`。

#### A 导航（5）

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| A01 | fresh，已进面板 | 读顶栏 | `nav[aria-label="WeWrite 工作台导航"]` 内 5 个按钮，文本 = 写作台/选题中心/文章库/定时任务/设置，首个带 `aria-current="true"` |
| A02 | A01 | 逐个点 5 Tab | 每次点击后目标按钮 `aria-current="true"` 且 `#wewrite-panel-content` 内出现对应面板容器（写作台 `.ww-topic`、选题 `.ww-aside`、文章库表格行容器、定时 `.ww-view-tab`、设置 `.ww-settings`） |
| A03 | demo 相位，D01 后 | 文章库点文章行 → 进编辑器 → 点返回按钮（arrow-left「返回文章库」） | 编辑器页头出现（`.ww-editor-head`）；返回后文章库表格重新可见 |
| A04 | demo 相位 | `page.setViewportSize({width:860,height:900})`（<900 断点，App.tsx NARROW_BREAKPOINT）→ 进设置 → 恢复 1440 | 窄屏：设置出现 `.ww-settings--narrow` + `.ww-settings__chip` 按钮、无 `.ww-settings__nav-item`；恢复后竖导航回归 |
| A05 | fresh（未配公众号，storage 重置保证 appid 空） | 看顶栏连接徽标 | 徽标 `aria-label` 含「公众号未配置」 |

#### B 写作台（4）

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| B01 | fresh（空库） | 进写作台 | 待办区空态文案可见（「今日待办（0）」或空态引导块）+ 最近文章空态；「开始写作」按钮 `disabled` |
| B02 | demo | 进写作台 | 待办列表渲染 demo 数据推导的条目（数量>0）；最近文章卡列表含《把公众号写作管线装进 DeepSeek Harness》 |
| B03 | fresh/demo 均可 | 输入框填纯空格 → 清空 → 填有效主题 | 空主题时按钮 `disabled`；填入后按钮 enabled（topic.trim().length===0 语义） |
| B04* | live（并入 H01 体内，不独立跑） | H01 发起生成后收起 overlay | 写作台待办列表首行出现「正在生成《主题》」live 行（`.ww-topic__todo--live`） |

#### C 选题中心（5）

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| C01 | fresh | 进选题中心，等列表加载 | 热榜列表出现条目行（真 HN API；若外网不可达则断言 AC-3 失败隔离态：失败源提示出现且页面不白屏——两态其一通过） |
| C02 | C01 | 点刷新按钮 | 按钮 loading 态（`.ww-spin` 或 disabled）出现后恢复，列表重新渲染或失败态保持结构 |
| C03 | C01 | 右栏「添加关键词」输入 `AI` → 提交 → 出现 Pill → 点 Pill 删除 | Pill 文本=AI 出现；删除后消失（localStorage 持久：刷新页面后仍在——提交后 reload 再断言一次） |
| C04 | C03 有关键词 | 刷新热榜 → 开「只看命中」筛选 | 命中行有高亮 class（`--ww-accent-subtle` 底）；开关后全部行可见；无命中时显示「没有命中…」空态文案 |
| C05 | C01 | 点任一条目「写这个」 | 进入生成流：overlay 出现且标题含该条目标题（live 相位外允许终态 failed——fresh 相位未配模型时即 I02 语义；此处只断言 overlay 打开+stepper 渲染） |

#### D 文章库（7）

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| D01 | demo | 进文章库 | 表格渲染：demo 文章行含标题、slug 副行（等宽）、状态点列、门禁列、更新时间列 |
| D02 | D01 | 打开状态筛选菜单（`.ww-menu-trigger`）→ 选「已渲染」 | 菜单项含 全部/编辑中/已渲染/已推送/失败；选择后仅 status=rendered 行可见（demo 文章保留） |
| D03 | D01 | 搜索框输入 demo 文章标题片段 | 仅匹配行可见；清空后全部回归 |
| D04 | D01 | 筛选=已渲染 + 搜索不相关词 `zzz` | 表格空态（0 行 + 空态提示） |
| D05 | D01 | 点 demo 文章标题行 | 下钻编辑器（`.ww-editor-head` 出现，A03 对称验证） |
| D06 | fresh（空库） | 进文章库 | 空表格空态文案，无报错 |
| D07 | demo | 看门禁列 | demo run（gates succeeded）对应行门禁列为通过图标/文本（`.ww-gate-*` 或语义色 success 类） |

#### E 编辑器（7）

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| E01 | demo，D05 后 | 点三视图 tab（`.ww-view-tabs[aria-label="编辑器视图"]`） | 三个 role=tab 可见（编辑/微信预览/门禁报告语义），切换后对应视图容器出现（编辑 CodeMirror / 预览画布 / GateReport） |
| E02 | E01 | 编辑器内追加一行文本 → 触发失焦 | 页头出现「自动保存于 …」（`.ww-editor-head__saved`）；reload 页面重进后文本仍在（article/save 真落库） |
| E03 | E01 | 切「微信预览」 | 预览画布容器出现且内含渲染 HTML（容器 innerHTML 含内联 style 属性、正文文本非空——预览=产物走 article/preview RPC） |
| E04 | E01 | 切「门禁报告」 | GateReport 组件区域渲染（结构可见；v0.1 契约无 gates 步明细，允许占位性「暂无报告」文案，断言容器存在不白屏） |
| E05 | fresh（appid 空 → pushDraft 必然失败且**不可能触达微信**，确定性失败态） | demo 相位外的备选：在 demo 相位用 demo 文章点「推草稿箱」 | error toast 出现（ToastHost error 类），无 success toast；不出现 mediaId 回填 |
| E06 | demo + 追加 seed 一篇 gates-failed 的 article/run（storage.mjs 的 seedDemo 加一变体或 runner 在 demo 相位补写） | 打开该文 → 点「推草稿箱」 | 门禁阻断提示出现（gateBlock modal/提示条），无任何网络推送语义的 success |
| E07 | E01 | 点返回 | 回文章库，表格可见（与 A03 互为正反） |

> E05 说明：demo 相位 settings.wechatAppId 继承自 fresh 重置（空）——pushDraft 在 token 获取处确定性失败，失败分类断言只锚「error toast 出现」，不锚具体分类（AUTH/网络两态皆可），避免对宿主 credentials 全局态（Jerry 的 ~/.dsh/.credentials.yaml）做任何假设与写操作。

#### F 定时任务（6）

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| F01 | demo | 进定时任务，默认「排队中」tab | demo schedule 卡渲染：名称「每周三早七点选题快评」+ RRULE 等宽原文 + 人类可读翻译行 + disabled 状态标识（seed enabled:false） |
| F02 | F01 | 切「全部历史」tab | 时间线渲染 demo run（trigger=schedule 或全部 run 视图；空态也接受但需结构在——以「tab 切换后内容区变化」为底线断言） |
| F03 | F01 | 「新建定时」→ 名称留空/RRULE 填 `NOTARRULE` → 提交 | 表单显示校验错误（非法 RRULE 被 normalizeRrule 拒绝，RruleValidationError 文案可见），队列无新增 |
| F04 | F03 | 填合法名称 + `FREQ=DAILY;BYHOUR=9` 提交 | 表单关闭，队列出现新卡且 enabled，RRULE 原文正确 |
| F05 | F04 | 切新卡 enable/disable | 卡状态标识切换；toast/视觉态变化（enabled 徽标） |
| F06 | F04 | 删除新卡 | 卡从队列消失，队列计数 -1 |

#### G 设置（9）

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| G01 | fresh | 进设置 | 左栏 `nav[aria-label="设置分组"]` 5 项：公众号/模型服务/图片供应商/API 代理/发布纪律；点击切换右侧内容区变化且 `aria-current` 跟随 |
| G02 | G01（fresh：未配置徽标态，须在 A05 后执行） | 公众号组填 AppID `wx-test-e2e` + 作者名 → 保存 | 保存态反馈（SaveState saved）；顶栏徽标 aria-label 翻转为「公众号已连接…」；凭据徽标显示已配置掩码语义（configured badge，无明文 secret——secret 本轮不写，见 E05 说明） |
| G03 | G01 | 模型服务组打开供应商菜单 | 菜单含 `zhipu`（llm/options 真宿主透传，settings.yaml 已配） |
| G04 | G03 | 选 zhipu 后打开模型菜单 | 菜单含三免费模型 id：`glm-4.7-flash`、`glm-4.5-flash`、`glm-4-flash-250414` |
| G05 | G04 | 选 `glm-4.7-flash` → 保存 → 离开再进设置 | 保存成功；重进后供应商=zhipu、模型=glm-4.7-flash 回显（llmDefault 落库） |
| G06 | demo | 图片供应商组 | 9 家列表渲染 + 默认链顺序（openai 首位）；只验渲染排序，不真生成 |
| G07 | demo | API 代理组点「连接测试」（凭据无效/缺） | 失败态提示出现且分类可见（AC-1 语义的 UI 面；不锚具体 errcode） |
| G08 | demo | 发布纪律组 | 「只进草稿箱/无自动群发」说明文案可见，页面无任何群发入口控件 |
| G09 | demo，窄屏（A04 viewport） | 窄屏进设置 | 分组导航呈 chip 行（`.ww-settings__chip`），5 组全部可达可切换 |

#### H 管线 E2E——智谱真跑（5，live 相位）

执行窗口预算：单次完整管线实测 72s（S5），runner 超时上限 240s/次；live 相位共 3 次 LLM 真跑（H01 完成 + H05 取消 + I03 打断），串行 + 用例间 10s 间隔，防限流。

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| H01 | live：模型已配（G05 贯穿）+ 图片链单家（§1.3） | 写作台输入主题「本地优先的 AI 工作流」→ 开始写作 → overlay 内观察 | ① overlay 标题 `正在生成《本地优先的 AI 工作流》`；② 六步 stepper 按序推进：选题分析→研究与提纲→初稿写作→质量门禁→排版转换→配图生成，前五步依次出现进行中→完成态；③ **配图生成步显示失败而整体终态=成功**（AC-9 真实路径：单家 openai 无 key AUTH 失败）；④ 成功 toast（「已生成…去文章库查看」）；⑤ 顺带执行 B04（收起 overlay 断言待办 live 行再回来） |
| H02 | H01 | 进文章库 | 列表出现新文章行，标题含主题关键词，状态列=已渲染（rendered） |
| H03 | H02 | 点开新文 | 编辑器 markdown 非空（CodeMirror 文本长度 > 200 字符）；切微信预览有渲染 HTML（E03 同锚点） |
| H04 | H01 | 回文章库看新文行门禁列 + 编辑器门禁视图 | 门禁列通过标识（gates 步 succeeded 的投影） |
| H05 | H01 后 | 再起一次真跑 → 立即点「取消」 | 终态=已取消；已开始的步骤（通常选题分析/研究与提纲）标取消态，后续步保持未开始；无成功 toast |

#### I 异常态（3）

| 编号 | 前置 | 步骤 | 断言 |
|---|---|---|---|
| I01 | live 完成后（restore 相位） | `hostctl stop` 杀宿主 → 观察页面 → `hostctl start` → 刷新 | 杀后：面板不白屏（error 态/ErrorNote 结构在，console 无未捕获崩溃）；重启+刷新后 openWorkbench 重新可用、文章库恢复 |
| I02 | **fresh 相位窗口**（llmDefault 尚空，G05 之前执行） | 写作台输入主题 → 开始写作 | run 快速失败；overlay 终态=失败；失败信息含「模型服务未配置」（S12 文案锚点）；stepper 显示失败于研究与提纲步；**重试按钮可见且可点**（点击后再现失败提示——retryGeneration 路径） |
| I03 | live 相位末尾 | 起第三次真跑 → outline 进行中 `hostctl stop` → `hostctl start` → 重进面板 | 该 run 状态=已中断（interrupted，宿主启动 resumeInterrupted 扫描，AC-11 语义）；提示错过/中断可见（无自动重派发） |

覆盖核对：Spec §7 页面清单 6 页（写作台/选题中心/文章库/编辑器/定时/设置）× 空态/有数据 × 核心交互全部入矩阵；导航窄屏、管线真链、异常三族（断连/未配模型/停机打断）齐备；AC-1/3/4/5/7/8/9/11/13/14 的 UI 面均有 E2E 触点（深层语义仍由 vitest 持有，见 §2.5）。

### 2.5 与既有 vitest 单测的边界

| 层 | 归属 | 内容 |
|---|---|---|
| vitest（`npm test`，已存在 154+ 用例） | 纯函数/契约/引擎 mock | zod 契约 ×20 端点、engine 六步编排（mock LLM）、门禁判定、渲染 parity、微信客户端 mock HTTP、fallback 链 mock、脱敏、调度归一化 |
| E2E（`npm run test:e2e`，本架构新增） | 面板行为 × 宿主真身 | 真浏览器 DOM 行为、真 RPC 往返（信封/loopback）、真 storage 落库回读、真 llm/options 透传、智谱真 LLM 流（text-delta 组装/finish 分流的端到端验证）、宿主生命周期（env/重启/打断恢复） |

分界规则：mock 能验证的逻辑不进 E2E（不重复）；E2E 只验「跨进程集成面」——llm.ts 的 v0.1.5 重写（0318e7b）恰恰只有真宿主能验，这正是本轮 E2E 的核心动机。vitest 里 pipeline-engine 的 mock LLM 用例全部保留不动。

### 2.6 CI 可行性（一句话评估）

E2E 依赖本机常驻宿主（3080）、宿主内 zhipu provider 配置（~/.dsh/settings.yaml）与 zcode config 里的 key——GitHub Actions 三者全无，**CI 跑不了 E2E**；run.mjs 顶部探测 `process.env.CI` 即打印跳过原因并 `process.exit(0)`（不挡 CI 绿灯），CI 维持现状只跑 `npm test && npm run lint && npm run typecheck && npm run check:p0`。

---

## 3. 风险清单（每条带缓解）

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | **宿主重启冲击并行 session**：3080 上可能有 Jerry 或其他 agent 的浏览器连着；`npx dsh web` 被重启即断连 | 中 | ① hostctl restart 前 console 打印旧 PID+3 秒缓冲；② E2E 全套约 15-25 分钟，安排在无人值守窗口跑（Jerry 触发即视为独占授权）；③ status 命令随时可查占用，人工重启前先看一眼 |
| R2 | **ModuleLoader/宿主缓存导致改版不生效**：host 侧 require 缓存 + client 侧 rev 机制边界无文档（UNKNOWN） | 中 | 根治于流程：dev-install.mjs 把 build→cp→restart 钉成原子三连，永不依赖热重载；浏览器侧每次相位新开 context 无缓存；若仍见旧行为，`?rev=` 手刷 + 查 /tmp/dsh-web.log |
| R3 | **demo/管线产物数据污染**：E2E 写入 Jerry 真实 storage unit | 中 | 相位制（§2.3.1）：跑前备份到 /tmp、跑后恢复并校验一致；管线真跑产物在恢复时一并清除；storage.mjs 所有写操作前置断言宿主已停（防内存态覆盖文件，S11 先例） |
| R4 | **免费模型限流**（S13：档位不公开，按低并发防御）：live 相位 3 次真跑共约 6 个 LLM 调用，叠加 Jerry 并行用量可能撞 QPM/并发 | 中 | ① 三次真跑串行 + 用例间 10s 间隔；② H05/I03 设计为 draft 步前终止（token 消耗最小化）；③ 撞限流（429/供应商 error）时 runner 打印降级指引：切 glm-4-flash-250414 或换时段；④ 单次管线只有 2 个串行 LLM 调用，自身不撞并发上限 |
| R5 | **key 轮换/失效**：zcode 编码套餐 key 换新后宿主 env 里是旧值 | 低 | key 单一真源在 zcode config（方案 B 的核心收益）：每次 `hostctl start/restart` 现读现注，轮换自动跟随；key 失效的表现=llm 步 error，恰被 I02/H01 失败路径覆盖，hostctl status 可快速定位 |
| R6 | **免费档抖动/慢**：高峰期 72s 可能变 3-5 分钟 | 低 | H01 超时上限 240s（3.3 倍实测值）；超时报失败并截图 dump，人工判断是否时段问题重跑 |
| R7 | **穿越序列对宿主升级脆弱**：npx 下次拉新 dsh 版本，onboarding/侧栏 DOM 变化 | 中 | 穿越序列集中单文件 session.mjs（改一处全生效）；选择器全部用 role/placeholder/aria 双 locale 回退（先例写法）；hostctl 可 pin npx 缓存版本（现状已命中固定缓存目录，短窗内稳定）；序列失败时自动 dump 页面全部可点文本（capture 脚本先例的排查输出） |
| R8 | **E2E 期间 Jerry 误触 3080**：人工操作改了 storage/设置，用例断言漂移 | 低 | 相位内 storage 以宿主停机写为准，运行中外部 UI 写入会与本套件轮询竞争——文档约定 E2E 窗口即独占（与 R1 同一纪律）；runner 每相位开头输出 ETA，便于避让 |

---

## 4. 决策记录（ADR 摘要，MADR 格式；与 tech-architecture §10 编号接续）

**ADR-010 宿主生命周期统一 hostctl，ZHIPU key 于 launch 时从 zcode config 注入** — Status: Accepted
Background：S2 env 缺口 + key 真源在 zcode config + 消费者是常驻进程。Decision：§1.1 方案 B；key 单一真源、detached spawn、ps eww 检测、restart 补 env。Consequences：正向—轮换零维护、E2E/人工单入口；负向—裸 npx dsh web 启动缺 env（alias+文档约束）。

**ADR-011 E2E 用裸 playwright + 自研 runner，不引入 @playwright/test** — Status: Accepted
Background：§2.1 矩阵（共享宿主状态/单实例/串行场景下 test runner 卖点失效）。Decision：workspace 根 playwright 向上解析，零新依赖；相位制管状态。Consequences：正向—零安装风险、先例复用；负向—重试/trace 自研（run.mjs ~60 行，可接受）。

**ADR-012 E2E 管线真跑不配图片 key、链裁单家，images 步走真实失败降级** — Status: Accepted
Background：S7/S8（无智谱生图、UI 硬编码 imageCount=1）。Decision：§1.3。Consequences：正向—AC-9 无图推进获真实路径覆盖、免 9 家 401 噪声；负向—真实生图验收仍留手工（P1 本位，挂 qa-test-plan §6）。

---

## 5. 交付物清单（工程师开工序）

1. scripts/hostctl.mjs（§1.1.2）→ 立即执行 restart 收尾 env 缺口；
2. scripts/dev-install.mjs（§2.3.3）；
3. tests/e2e/{run.mjs, helpers/*, cases/*}（§2.2-2.4）；
4. package.json scripts 六条接线（§2.2）；
5. .gitignore 追加 `tests/e2e/.artifacts/`；
6. 设置页人工/E2E 配置：供应商 zhipu、模型 glm-4.7-flash（§1.2）；
7. 完整跑 `npm run test:e2e` 一轮，红灯即缺陷清单，绿灯即 v0.1.5 发布前 E2E 门禁基线。
