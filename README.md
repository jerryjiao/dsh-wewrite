<p align="center"><img src="assets/logo/mark-1024.png" width="120" alt="dsh-wewrite logo"></p>

# dsh-wewrite

[![CI](https://github.com/jerryjiao/dsh-wewrite/actions/workflows/ci.yml/badge.svg)](https://github.com/jerryjiao/dsh-wewrite/actions/workflows/ci.yml)
[![Website](https://github.com/jerryjiao/dsh-wewrite/actions/workflows/website.yml/badge.svg)](https://github.com/jerryjiao/dsh-wewrite/actions/workflows/website.yml)

一个 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 插件：把一整套微信公众号 AI 写作管线（选题 → 大纲 → 成稿 → 质量门禁 → 排版渲染 → 配图 → 草稿箱）产品化。任何 DSH 用户一条命令安装，在本地 Web UI 里完成从选题到草稿箱的全流程。模型与凭据全部走你自己的账号，数据只落本地。

- 官网：https://jerryjiao.github.io/dsh-wewrite/
- 版本：v0.2.0
- License：MIT
- 适用 DSH：v0.1.x developer preview（见下方[版本兼容表](#版本兼容表)）

## 5 分钟快速开始

前提：Node `^22.19.0 || >=24.0.0`，已能运行 `npx @deepseek-ai/dsh`。

**第 1 步：安装插件**

```bash
npx @deepseek-ai/dsh plugin --profile web add github:jerryjiao/dsh-wewrite#v0.2.0
```

安装完成后如需卸载：`npx @deepseek-ai/dsh plugin --profile web remove dsh-wewrite`。

> 关于产物形态：仓库直接提交了 `lib/` 预构建产物（dist-committed），这是有意决策——DSH 从 git 安装插件不会执行 build 脚本，预构建路径让你不必在 pnpm 侧加任何 `allowBuilds` 信任声明，装完即用。

**第 2 步：启动 DSH Web**

```bash
npx @deepseek-ai/dsh web
```

打开 http://127.0.0.1:3080 ，会话视图环里会出现「wewrite 工作台」tab。

**第 3 步：配置凭据**

模型不需要在本插件里配：文本生成直接用 DSH 原生的模型配置（`ctx.llm`）。你只需要在工作台「设置」页填：

- 公众号 AppID + AppSecret（来自公众平台「设置与开发 → 基本配置」），保存后只存本地，界面回显掩码
- 图片供应商 API Key（可选，不配则文章无图推进，不阻塞发布）

填完点「连接测试」。通过即可进入下一步；如返回 errcode 40164，见 [FAQ](#faq) 的 IP 白名单条目。

**第 4 步：出第一篇**

「选题」面板选一条热榜（内置 Hacker News，可配自定义聚合源），点开条目先看一眼 AI 速览（抓原文后的中文要点总结，抓不到则给标题解读），合适就点「写这个」，或直接输入固定主题。管线自动执行六步（选题 → 大纲 → 成稿 → 门禁 → 渲染 → 配图），进度实时可见。完成后在编辑器里改稿——选中任意一段点「AI 改写」下一句指令即可局部重写（Ctrl+Z 可撤销），右侧微信预览与最终推送产物字节一致。确认后点「推草稿箱」，到微信公众平台后台「内容与互动 → 图文素材」里查看草稿。群发请你在公众平台后台人工执行（本插件 v0.1 没有任何群发调用路径，见[安全声明](#安全声明)）。

## 一步步用起来

以下截图来自 v0.5.x 真机运行（本机 DSH Web 实拍），按使用动线排列。

### 对话框直写（推荐入口，v0.4.0 起）

装好后在 DSH 对话框里直接说「用 wewrite 写一篇……」——agent 会驱动写作管线，六步进度（选题 → 大纲 → 成稿 → 门禁 → 渲染 → 配图）以卡片形式实时出现在对话流里；管线跑完出成稿卡（标题/字数/门禁结论），门禁未过会给出可行动的失败引导。对 agent 说「推草稿箱」时，宿主原生审批面板先弹出（含文章标题与门禁状态）——**你点允许之前，插件零微信 API 调用**（fail-closed：审批不可用即拒绝执行）。另有 `/wewrite <主题>` 命令与 `@` 引用已有文章两个轻入口。

<p><img src="assets/screenshots/09-chat-run-progress.png" alt="对话直写：写作管线运行卡实时出现在对话时间线，显示六步进度" width="720"></p>

<p><img src="assets/screenshots/10-chat-final.png" alt="对话流中的成稿卡与失败引导卡，模型尝试推送时弹出宿主审批面板等待人工确认" width="720"></p>

### 写作台精修

另外两种进入方式：会话顶部 tab 环里的「写作台」（在会话里聊着写），或**侧边栏底部的「打开写作台」按钮**——不进任何会话，一键全屏铺开完整工作台，Esc 收起。

**写作工作区**

<p><img src="assets/screenshots/01-workbench.png" alt="写作工作区界面：左栏文章列表（搜索、状态筛选、门禁标记、新文章入口），主区编辑器默认载入最近一篇，顶部为写作/选题/定时导航与设置入口" width="720"></p>

打开即工作区：左栏是你的全部文章（状态点 + 门禁标记 + 筛选搜索），主区直接进入最近一篇的编辑器——选文章、改稿一步到位，不再有「列表页 → 下钻」两跳。零文章时主区是启动卡（输入主题开写 / 去选题中心 / 先配置凭据）。

**选题中心**

<p><img src="assets/screenshots/02-hotspots.png" alt="选题中心界面：热门榜按序号列出多条 Hacker News 条目，每条带来源与「写这个」按钮" width="720"></p>

热门榜实时拉取（上图为真实 Hacker News 数据），行上直接「写这个」进管线，右栏管理你的选题关键词。点开任意条目，AI 会抓取原文给你一段中文速览——「这条在讲什么」加两三条具体要点（带「读了原文」徽记）；抓不到原文的站点自动降级为标题解读与写作角度。速览按条当日缓存，不点开不消耗。

**编辑器（双栏）**

<p><img src="assets/screenshots/04-editor.png" alt="编辑器双栏视图：左 Markdown 改稿，右微信预览显示同名文章排版效果，顶栏一行含标题、三视图切换（仅编辑/双栏/仅预览）与推草稿箱按钮" width="720"></p>

顶部 chrome 压缩为两行；视图一键切换「仅编辑 / 双栏 / 仅预览」，双栏可拖拽调宽；门禁报告从右侧滑出（不再挤占视图位）；字数、门禁、保存状态全部归拢到底部状态条。改稿不顺手时**选中一段文字**，上方浮出「AI 改写」——输入一句话（更口语 / 精简一半 / 扩写细节 / 更有数据感，或自定义），AI 只重写选中段落并原位替换，Ctrl+Z 即可撤销；全文其余部分一个字不动。

**编辑器（仅预览）**

<p><img src="assets/screenshots/05-editor-preview.png" alt="仅预览视图：文章渲染在带边框圆角的白底画布上，外围井底色与手机 notch 装饰营造「这台手机」实感，支持 100/90/75% 缩放" width="720"></p>

预览画布立在井底之上，所见与推到草稿箱的产物字节一致；缩放只是视觉变换，不改载荷。

**定时任务**

<p><img src="assets/screenshots/06-schedule.png" alt="定时任务界面：计划卡片显示 RRULE 原文、人类可读翻译与下次运行时间，右上角有新建定时按钮" width="720"></p>

RRULE 规则与下次运行时间人类可读展示（规则原文收进悬停提示，不再占版面），可暂停/恢复。

**设置**

<p><img src="assets/screenshots/07-settings.png" alt="设置界面：公众号、模型服务、图片供应商、API 代理、发布纪律分组配置，凭据输入框回显掩码" width="720"></p>

公众号凭据、模型服务、图片供应商链、API 代理分组配置；AppSecret 只回显掩码，连接测试在此。

## 功能亮点

- **主题写作 + 热门榜选题**：固定主题直写，或从热榜选题。内置 Hacker News（官方 Algolia 索引，无需 key），支持自定义聚合源（DailyHotApi 兼容形态，配 URL 即启用）。单源失败只标记该源，不影响其余源展示。
- **逐条 AI 速览**：点开热榜条目，后台抓取原文（8 秒超时 / 2MB 上限 / 仅 text/html）、抽出正文，LLM 输出中文速览（这条在讲什么 + 具体要点）；抓不到原文自动降级为标题解读与写作角度。点开才生成，按条当日缓存。
- **AI 选中改写**：编辑器里选中一段文字，浮条点「AI 改写」，一句话指令只重写选中段（四个快捷方向：更口语 / 精简一半 / 扩写细节 / 更有数据感），原位替换、Ctrl+Z 可撤销，全文其余部分不动。
- **侧边栏直进**：不进任何会话，点侧边栏底部「打开写作台」即全屏铺开完整工作台，Esc 收起；会话内「写作台」tab 保留，双入口并存。
- **Markdown 编辑器 + 微信预览**：CodeMirror 编辑器改稿，右侧实时微信预览（host 侧渲染，预览 HTML 与推送载荷字节一致，所见即所推）。三套排版主题：professional-clean / tech-dark / minimal-gray。
- **质量门禁**：成稿先过门禁（内容质量校验 + 编号配图一致性校验），门禁未过会阻断默认推送路径；你可以改稿重过，或显式覆盖。
- **RRULE 定时，默认进草稿箱**：RRULE 规则（如每个工作日 04:00）定时跑管线，产物恒定推草稿箱，运行历史完整可审计。错过计划时刻不补偿，下次启动时提示错过数。
- **9 家图片供应商，gpt-image-2 优先**：openai（gpt-image-2）→ doubao → dashscope → jimeng → minimax → azure_openai → gemini → openrouter → replicate 的 fallback 链。单家失败自动降级下一家，产物标注实际使用的供应商；全部失败时无图推进，不阻塞成稿。缺省只配 openai 一家，其余按需在设置页增排。
- **模型走 DSH 原生配置**：不另建模型账号体系。管线文本步直接用宿主 `ctx.llm`（即 DSH 设置页里配的模型），也可对单次运行覆盖 provider/model。

## 架构

单包双端（host + client），DSH Cordis 插件形态：

<p><img src="assets/diagram/architecture.png" alt="dsh-wewrite 架构图：DSH Web 工作台经 RPC 到宿主插件（写作管线/定时调度/微信草稿箱/图片生成），落本地存储/凭据/DSH 模型，草稿箱指向公众号" width="768"></p>

<details>
<summary>文字版</summary>

<pre>
DSH Web UI（React 18，http://127.0.0.1:3080）
  ├─ 侧边栏「打开写作台」入口（sidebar.footer.action）→ shell.overlay 全屏浮层
  └─ wewrite 工作台 tab（conversation.view，双入口并存）
       │  选题（热榜 + 逐条 AI 速览）│ 编辑器（Markdown + AI 选中改写）│ 微信预览
       │  运行历史 │ 定时计划 │ 设置
       │  connection.rpc（仅 loopback 回环，authority 校验）
       ▼
DSH Host（Node + Cordis）
  └─ dsh-wewrite 宿主插件：WeWriteService（唯一写权威，操作串行化）
       ├─ pipeline/   六步引擎：选题→大纲→成稿→门禁→渲染→配图
       │               文本步调 ctx.llm，确定性步骤纯代码执行
       ├─ scheduler/  RRULE 归一化 → durable occurrence claim → 派发 run
       ├─ wechat/     token / uploadimg / material / draft
       │               apiBaseUrl 可配 = 代理缝（全部调用统一走该地址）
       └─ providers/  9 家图片供应商 + fallback 编排
  凭据：ctx.credentials（~/.dsh 本地）   数据：storageDomain（~/.dsh 本地）
</pre>

</details>

设计细节见 `docs/tech-architecture.md`（ADR-001~009 收录于该文档 §10）。

## 配置说明

全部在工作台「设置」页配置，无需手改文件。机密项（AppSecret、各图片供应商 API Key）只经 DSH 凭据服务落本地 `~/.dsh`，非机密项落插件 storage domain。

**公众号凭据**

| 项 | 说明 |
|---|---|
| AppID / AppSecret | 公众平台「设置与开发 → 基本配置」获取；Secret 保存后界面只回显掩码 |
| 作者名 | 草稿作者字段 |
| 微信 API 地址 | 缺省 `https://api.weixin.qq.com`（直连）。出口 IP 不在白名单时改为你的 relay 地址（见 [tools/wechat-relay](tools/wechat-relay/README.md)） |

**图片供应商链**

- 缺省链只含 openai（模型锁定 `gpt-image-2`，凭据引用 `WEWRITE_IMG_OPENAI`）。
- 可增排其余 8 家（doubao / dashscope / jimeng / minimax / azure_openai / gemini / openrouter / replicate），每家可配专属 API Key、模型名与 base URL；顺序即 fallback 顺序。
- 单图上限 10MB，单篇正文图上限 10 张。

**API 代理**

微信服务端接口有 IP 白名单约束（官方文档：仅白名单 IP 可用 AppSecret / access_token 调用）。本插件把「微信 API 地址」做成一等公民配置项：配成 relay 地址后所有微信调用统一走 relay，无直连混合路径。自建 relay 的最小配置（Caddy 一行）见 [tools/wechat-relay/README.md](tools/wechat-relay/README.md)。

**热榜源**

- 内置：Hacker News（官方 Algolia API，无需 key，恒启用）。
- 自定义：填一个 DailyHotApi 兼容的聚合 API URL 即并入选题面板（条目取 `title` / `url` / `name` 字段）。
- 逐条 AI 速览的原文抓取由本插件进程发起（8 秒超时、2MB 截断、仅接受 text/html），不经过任何第三方中转；抓取失败只影响该条的速览降级，不影响榜单本身。

**其他**

| 项 | 缺省 | 说明 |
|---|---|---|
| 默认主题 | professional-clean | 三套：professional-clean / tech-dark / minimal-gray |
| 默认图尺寸 | 1024x1024 | 可选 1024x1536 / 1536x1024 / 1344x768 / 768x1344 |
| 运行历史上限 | 200 | 1–1000，超出自动修剪终态记录 |
| Agent 工具 | 关 | 打开后可在 DSH Agent 会话里用 `wewrite_run` / `wewrite_push_draft` / `wewrite_list_schedules` 三个工具 |
| 调度轮询间隔 | 30 秒 | 宿主级配置项（cordis.patch.yml 层） |

## 安全声明

- **默认只到草稿箱**：v0.1 的推送面只有 draft/add 族端点。freepublish / 群发调用路径在类型层不可达（调度目标 zod literal 直接拒绝 publish/freepublish/mass，测试套件另有源码树扫描双保险）。群发永远由你在公众平台后台人工执行。
- **凭据只存本地**：AppSecret 与各 API Key 只经 DSH 凭据服务落 `~/.dsh` 本地存储，不进 git，不离开你的机器；插件自身无任何远端上报通道。
- **日志脱敏**：secret / access_token / API key 在日志、错误与运行历史中一律掩码（长值保留前 4 字符 + `****`，短值全掩）。
- **无默认遥测**：不收集、不上报任何使用数据，无埋点。
- **MIT 开源**：代码见 LICENSE。

## FAQ

**推送报 errcode 40164（invalid ip，不在白名单）怎么办？**

这是微信侧约束：调用服务端接口的出口 IP 必须在公众号白名单里。点设置页「连接测试」，诊断会显示当前出口 IP 与分类指引。两条出路：

1. **出口 IP 加白名单**（适合出口 IP 固定的场景）：公众平台 → 设置与开发 → 基本配置 → IP 白名单，把诊断显示的出口 IP 加入，扫码确认，重测即过。家宽 IP 会变，此路不稳。
2. **自建固定出口 relay**（适合 IP 不固定）：任意有固定公网 IP 的服务器反向代理 `api.weixin.qq.com`（Caddy 一行配置，见 [tools/wechat-relay/README.md](tools/wechat-relay/README.md)），把服务器 IP 加白名单一次，然后设置页「微信 API 地址」改成 relay 地址。本插件不提供也不销售代理服务。

**支持哪个 DSH 版本？装上没激活怎么办？**

见[版本兼容表](#版本兼容表)。DSH v0.1 处于 developer preview 的 breaking changes 窗口，本插件做了 feature detection 防御（storage/connection 服务缺失时警告并降级，而非半死不活）。装上不激活时先确认 DSH 版本在支持列表内；安装输出若出现 "plain dependency" 字样，说明插件声明未被识别，属 DSH CLI 与本插件版本不匹配，请到 [Issues](https://github.com/jerryjiao/dsh-wewrite/issues) 反馈。

**群发功能在哪？**

v0.1/v0.2 没有，这是有意的安全默认（见安全声明）。后续版本会以**显式 opt-in**（默认关闭，逐次确认）的形式评估提供。

**管线失败会留下半成品草稿吗？**

不会。推送是原子操作：任一环节失败即中止，草稿箱不会出现残稿；已完成的文章产物保留在本地，改好可重推。

## 版本兼容表

| dsh-wewrite | DSH | Node | React | 状态 |
|---|---|---|---|---|
| v0.2.0+ | v0.1.x developer preview（2026-08-13 发布） | ^22.19.0 \|\| >=24.0.0 | 18（宿主提供，peer） | 已验证（2026-08-20 基线：358 单测 + E2E fresh/demo 52 用例全绿，含 v0.3 未发版改动） |
| v0.1.0 – v0.1.4 | v0.1.x developer preview（2026-08-13 发布） | ^22.19.0 \|\| >=24.0.0 | 18（宿主提供，peer） | 已验证（2026-08 基线，DSH master@2026-08-17 实测） |

DSH v0.1 是 developer preview，不承诺 API 稳定；DSH 升级后如插件失活，优先检查本表并升级插件版本。

## Roadmap

- 已交付：v0.2.0 工作区化重设计（左栏文章列表 + 编辑器三视图 + 门禁右侧滑出）、v0.2.1 顶栏降级与细节打磨、v0.3 逐条 AI 速览 + 侧边栏直进 + AI 选中改写 + 全局视觉精修
- 评估中
  - freepublish 显式 opt-in（默认关，逐次确认）
  - 多公众号账号（账号切换/凭据集）
  - 数据回流（已发文章阅读/点赞等统计拉回运行历史）

## 开发

```bash
npm install          # 独立克隆直接装（无 install 钩子）
npm test             # 358 个测试（vitest）
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run check:p0     # 视觉门禁扫描（emoji/渐变/占位文案）
npm run build        # 产出 lib/（提交前必跑，产物入库）
```

项目文档在 `docs/`（PRD / Spec / 技术架构 / QA 测试计划），测试即契约（Spec EARS 验收标准的可执行形态）。

### Playwright（e2e 真机驱动）

本仓库**不自带** playwright 安装（避免重复下载浏览器与依赖膨胀）。在 worktree 跑 e2e 真机驱动（`npm run test:e2e`）时，复用 workspace 主仓的安装，两种方式任选：

```bash
# 方式一：NODE_PATH 指向 workspace 的 node_modules（runner 从那里解析 playwright）
NODE_PATH=/Users/mac/Documents/workspace/node_modules npm run test:e2e

# 方式二：直接用 workspace 里 playwright CLI 的绝对路径起驱动/装浏览器
/Users/mac/Documents/workspace/node_modules/.bin/playwright install chromium
```

策略原因：worktree 是共享 .git 的轻检出，浏览器二进制与依赖全局只留一份（workspace）；CI 侧由流水线自行安装，与本地策略互不干扰。

## CI 与发版

三条 GitHub Actions 流水线，全绿是合入与发版的前置：

| Workflow | 触发 | 做什么 |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | push / PR 到 main | 插件门禁：lint → typecheck → 全量测试 → P0 视觉扫描 → build → `lib/client.js` 加载契约标记校验 + dist-committed 一致性（rebuild 须与提交的 `lib/` 字节一致，防「改源码忘 build」）；另跑官网构建校验（base 前缀验证） |
| [`website.yml`](.github/workflows/website.yml) | push main（`website/**` / logo 变更）+ 手动 | 构建官网并自动部署到 GitHub Pages：https://jerryjiao.github.io/dsh-wewrite/ |
| [`release.yml`](.github/workflows/release.yml) | push tag `v*` | 复用同一套插件门禁 → build → 打包 `lib/` + `cordis.patch.yml` + README/LICENSE 为 zip → 创建 GitHub Release（自动生成 notes）并附产物 |

发版流程（workflow 不改版本号，bump 属本地动作）：改 `package.json` version → 同步 README 安装命令与官网的版本 pin → commit → `git tag vX.Y.Z` → `git push origin main --tags`，`release.yml` 接管门禁与 Release 产物。

## English

**What.** dsh-wewrite is a plugin for DeepSeek Harness (DSH) that turns a WeChat official-account AI writing pipeline—topic, outline, draft, quality gates, render, images, draft box—into a local web workbench. Models and credentials stay yours: text generation uses your DSH model config, secrets never leave `~/.dsh`. Since v0.3: per-item AI digest for trending topics (fetches the linked article and summarizes it in Chinese, falls back to title-only), selection-based AI rewrite in the editor (rewrites only what you highlight, undoable), and a sidebar entry that opens the full workbench as an overlay—no session required.

**Install.** `npx @deepseek-ai/dsh plugin --profile web add github:jerryjiao/dsh-wewrite#v0.2.0`, then `npx @deepseek-ai/dsh web` and open http://127.0.0.1:3080 . Fill in your official-account AppID/AppSecret in the workbench settings, run the connection test, pick a topic, and push your first draft. Requires DSH v0.1.x developer preview and Node ^22.19.0 || >=24.0.0.

**Safety.** v0.1 pushes to the draft box only; there is no code path for mass publishing (freepublish), by design. Credentials are stored locally via the DSH credentials service and masked in logs; no telemetry is collected. MIT licensed.

## License

[MIT](LICENSE) — Copyright (c) 2026 Jerry Jiao
