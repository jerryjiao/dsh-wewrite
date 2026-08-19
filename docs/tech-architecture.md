# dsh-wewrite 技术架构文档

| 项 | 内容 |
|---|---|
| 产品 | dsh-wewrite — DeepSeek Harness（DSH）微信公众号 AI 写作插件 |
| 版本 | v0.1 架构（对应产品 v0.1.0） |
| 作者 | 高见远（MVP 专家团架构师），2026-08-18 |
| 上游 | `docs/FACTS.md`（Phase 0 事实包）、`docs/prd.md`（PM PRD）、DSH 官方仓库与本机实测（见 §2 事实清单） |
| 下游 | 开发（目录树/契约直接开工）、QA（验收基线）、设计师（UI 槽位边界） |

> 本文所有平台事实均带来源标注：`source:` 为官方仓库文档/源码或本机实测；`ASSUMPTION` 为推测，待首版开发期验证；`UNKNOWN` 为文档未覆盖项，附探测方案。事实与推测严格分离。

---

## 0. 选型例外声明（对 mvp-stack.md 锁定的偏离登记）

workspace ADR 锁定的默认技术栈为 Astro + Cloudflare Workers/Hono/D1/R2（自托管产品线）。**本项目不适用该锁定**：

- 依据：FACTS.md 硬约束第 5 条 + Jerry 明确指令「基于 DeepSeek Harness 开发」。DSH 插件形态由 DSH 平台 dictates——插件运行在宿主的 Cordis 加载器与 Web 客户端内，无独立部署层、无独立数据库选型权。
- 因此本项目的「部署/数据库/前端框架」三层全部跟随 DSH 平台（TypeScript/Node ESM/Cordis/React 18/storage domain），本文按 mvp-stack.md 论证规则登记此偏离。自托管产品线不受影响。

---

## 1. DSH 插件 API 关键事实清单（本轮调研核心产出）

以下事实已逐条查实，标注来源。开发阶段直接引用，不再重新调研。

### 1.1 插件包结构与 dsh.bundle

| # | 事实 | 来源 |
|---|---|---|
| F1 | Cordis 插件入口：导出 `name`、`inject`（string[]）、`Config`（Schema）、`apply(ctx, config)`；也有对象/Service 类形式 | source: `docs/user/develop/basic/index.zh.md`；本机 dsh-automation `lib/types/index.d.ts` |
| F2 | `package.json` 的 `dsh` 字段有两类 manifest，互斥：**`dsh.bundle`**（组合包，`{ "patch": "./cordis.patch.yml" }`，声明本包贡献一个配置层）与 **`dsh.profile.bundles`**（profile 组成清单，由 `dsh plugin` 命令自动维护，不手写） | source: `docs/user/develop/basic/publish.zh.md` |
| F3 | 无 `dsh.bundle` 的包可安装但只作普通依赖，不激活（CLI 警告 plain dependency） | source: 同上 + FACTS.md 本机实测 |
| F4 | patch 层格式：YAML 数组，`- insert: [{ id, name: <包名>, config: {...} }]`；后应用层整体替换目标行 config（不深合并）；用户可在自己 profile 的 `cordis.patch.yml` 覆盖组合包行 | source: publish.zh.md + 本机 `@dsh-external/dsh-automation/cordis.patch.yml` 实测 |
| F5 | 安装：`dsh plugin --profile web add github:<owner>/<repo>#<tag|sha>`（pnpm 装进 `~/.dsh/profiles/web`）；git 安装**不跑 build 脚本**，要么自带自包含 `prepare`（需用户在 `pnpm-workspace.yaml` 授权 `allowBuilds`），要么**npm 发布预构建 `lib/`**（免授权，首选）；建议 pin commit/tag | source: publish.zh.md + FACTS.md |
| F6 | Node 引擎要求（参照插件实测）：`^22.19.0 || >=24.0.0` | source: dsh-automation `package.json` engines |

### 1.2 Web UI 贡献方式（client 侧）

| # | 事实 | 来源 |
|---|---|---|
| F7 | client 插件声明：`package.json` 中 `dsh.client: { platform: 'web', inject?: string[], immediately?: boolean }`（inject 为 informational 依赖边），且 `exports["./client"]` 导出构建好的 bundle；宿主经 `GET /plugins/<id>/client.js?rev=<hash>` 提供 | source: `docs/subsystems/client-modules.zh.md` + dsh-automation `package.json` 实测 |
| F8 | DSH Web 前端框架为 **React ^18.2.0**（`@deepseek-ai/dsh-client-web-react` dependencies 实测） | source: `packages/client/web-react/package.json` |
| F9 | **UI 挂载点 = 会话级视图环**：`conversation.view` slot 以 `{ id, order, label, locale }` 注册，渲染为会话页顶部 tab；官方明言「plugins such as ui-trajectory contribute tabs through `ctx.slots.register`」；dsh-automation 即以此注册 Automations tab | source: `packages/client/ui-conversation/README.md`；本机 dsh-automation `lib/types/client/contracts.d.ts`（`slots.register({ name: 'conversation.view', ... })`） |
| F10 | 其他可用槽位：`conversation.session.header.actions` / `conversation.session.header.utilities`（会话头）、`conversation.input.dock` / `conversation.input.plan` / `conversation.input.model`（输入区）、`conversation.composer`（chain 型接管输入框）、`conversation.chat.node`（自定义会话事件行渲染器，配 `ctx.conversationEvents` 注册 ConversationNodeDefinition） | source: `packages/client/ui-conversation/README.md` |
| F11 | ClientContext 可用服务面：`connection.rpc`、`sessions.refresh/open`、`locale.register/bind`（zh/en 词典）、`slots.inject/register`、`effect`（清理钩子） | source: 本机 dsh-automation `lib/types/client/contracts.d.ts` 实测 |
| F12 | 是否存在**非会话级**的全局页面/路由槽位：UNKNOWN。文档只见会话作用域槽位与 root slot（引擎层）。探测方案：查 `packages/client/ui-layout`、`packages/client/web` 的 slot 声明（Phase 1 首日确认）。MVP 采用已证实的 `conversation.view` tab 形态即可满足需求 | — |

### 1.3 RPC（client ↔ host）

| # | 事实 | 来源 |
|---|---|---|
| F13 | client 调用：`connection.rpc.call(channel, endpoint, payload, signal)`；host 注册：`connection.rpc.handle(channel, handler, { authority: 'loopback' | 'trusted-host' })`；控制无人值守写面的通道声明为 `loopback`（仅本机 Web） | source: 本机 dsh-automation `lib/types/client/contracts.d.ts` + `rpc.d.ts`（"Loopback-only Host RPC adapter ... because it controls unattended writes"） |
| F14 | host 侧连接服务注入名：`connection` | source: dsh-automation host inject 清单实测 |

### 1.4 持久化（storage domain）

| # | 事实 | 来源 |
|---|---|---|
| F15 | `ctx.storage`：backend 注册表 + `StorageForms` 挂载点；`ctx.storageDomain.open(spec): Promise<Domain>`；spec 由 `defineDomain({ name, version, global?, tables })` + `domainTable(schema)`（zod）声明，模块加载即校验；unit 名须匹配 `UNIT_NAME_RE`（具体正则未公开——UNKNOWN 细节，运行时报错兜底）；**记录键是任意字符串，绝不进入文件路径** | source: `docs/subsystems/storage.zh.md` |
| F16 | Domain API：`table(name)` 句柄 `get/entries/keys/size`（同步内存读）、`put/delete/update(key, fn)`（原子读改写，写链排队：先持久化再更新内存最后发事件）、`global.set`；变更事件 `domain/changed`（进程内通知，非事务） | source: 同上 |
| F17 | 后端两个：`json`（每 unit 原子整文件重写，人类可读，适合低频写）与 `sqlite`（单库每行一文档，适合频繁更新）；选择由消费方插件 config 的路由（`backend` + 按领域 `routes` 覆盖）决定，非全局唯一 | source: 同上 |
| F18 | 调用方持有 Domain 句柄，须在自己的 `ctx.effect` disposer 中 `close()`；介质落盘根目录由后端拥有（`~/.dsh/storages/` 本机存在），**插件不应依赖具体磁盘路径** | source: storage.zh.md + 本机 `~/.dsh/storages/` 实测 |

### 1.5 凭据（credentials）

| # | 事实 | 来源 |
|---|---|---|
| F19 | `ctx.credentials` 四操作：`resolve(ref)` / `describe(ref)` / `set(ref, value)` / `unset(ref)`；`CredentialRef` 为品牌化的 POSIX 环境变量名；`describe` 返回 `{configured, source?, writable}`，**永不暴露值**；每次操作重新解析（热更新，凭据轮换无需重启）；事件 `credentials/updated` | source: `docs/subsystems/credentials.zh.md` |
| F20 | 官方先例：模型密钥本体存 `$DSH_HOME/.credentials.yaml`，settings 只存引用；Web UI「保存后只收到脱敏描述符，永远不会收到明文密钥」 | source: `docs/user/guide/providers.zh.md` |

### 1.6 模型（LLM）

| # | 事实 | 来源 |
|---|---|---|
| F21 | `ctx.llm`：`registerAdapter(providers, adapter)`、`listProviders()`、`listModels(provider)`、`resolveModelInfo(provider, model)`、`stream(options: GenerateOptions): AsyncIterable<StreamChunk>`（**无非流式 generate**，chunk 需 `BlockAssembler` 组装）；`GenerateOptions` 含 `purpose`（辅助调用标注）、`sessionId`；无 tool_choice/top_p | source: `packages/llm/llm/README.md` |
| F22 | **宿主插件可脱离 Agent 循环直接调 `ctx.llm.stream()`**：官方存在「independently logged auxiliary calls」先例（compaction、标题生成）；失败以终端 `finish` chunk 的 error/aborted 形式出现而非抛异常 | source: 同上 |
| F23 | 用户模型供应商配置在 DSH 原生设置页：settings.yaml `llm-pi-ai.providers.<id>: { apiKeyEnv | apiKey, api: openai-completions, baseURL, models[] }`，支持任意 OpenAI 兼容网关；模型发现走 `GET /models`；**变更即时生效** | source: `docs/user/guide/providers.zh.md` |
| F24 | llm-retry 为可选执行器包；dsh-llm 本身不做重试/缓存/限流 | source: `packages/llm/llm/README.md` |

### 1.7 Agent / Session / 事件流

| # | 事实 | 来源 |
|---|---|---|
| F25 | 起新 Agent+Session 完整模式（参照插件源码实证）：`ctx.agents.withoutInitiator(() => ctx.agents.create({ sessionId, meta: { cwd, agentPreset }, agentOptions: { provider, model }, setup: async (agentCtx) => {...} }))` → `handle.agent.followup(userMessage)`（source 可标 `kind: 'automation'` 类似自定义来源）→ `whenIdle()` / `cancel()` → `ctx.sessions.flush(session)` → 读 `session.events`（`{seq, type, data}`）汇总 | source: 本机 dsh-automation `lib/index.js` 行 21668-21725 反编译实证 |
| F26 | 参照插件 host inject 清单：`storageDomain, agents, sessions, workspaceRegistry, agentDefaultModel, agentPresets, tools, connection` | source: 同上（inject 数组实测） |
| F27 | 工具注册：`ctx.tools.register(definition)`（agent 作用域）；运行时工具闸门：`agentCtx.tools.guard((exec) => reason? | undefined)` | source: dsh-automation `tools.d.ts` + `index.js` 实测 |
| F28 | Session = append-only 事件流，seq 单调；`SESSION_FORMAT_VERSION = 0`（**pre-release，官方明言无兼容承诺**）；未知事件类型需 `ignorable` 标记否则读取方拒构；支持 resume/fork/replay | source: `docs/persistence-catalog.md` |
| F29 | 官方调度 `@deepseek-ai/dsh-schedule` 仅 session-local：after/at/every（≥300s）三型，**明确不支持 RRULE/cron**，冷会话不触发，无外部通知——只适合「回到当前会话提醒」，不适合后台定时管线 | source: `docs/subsystems/schedule.zh.md` + `examples/web-schedule/README.md` |

### 1.8 微信公众平台 API（源管线 + 官方）

| # | 事实 | 来源 |
|---|---|---|
| F30 | 草稿箱 API 族端点：`/cgi-bin/token`（client_credential 换 access_token）、`/cgi-bin/media/uploadimg`（正文图，返回微信 CDN URL）、`/cgi-bin/material/add_material`（封面，得 thumb_media_id）、`/cgi-bin/draft/add`、`/cgi-bin/draft/get`、`/cgi-bin/draft/update` | source: `workspace-writer/wewrite/scripts/publish_article.mjs`（已在真实生产使用验证） |
| F31 | **IP 白名单**：官方文档明言「仅白名单中的 IP 才可调用公众号/服务号的服务端接口，即通过 AppSecret 或者 access_token 调用服务端接口时，需将访问来源 IP 设置为 IP 白名单」，违规返回 errcode 40164 | source: developers.weixin.qq.com《API IP 白名单》操作指南 |
| F32 | 源管线已把 API base URL 参数化（`DEFAULT_WECHAT_API_BASE_URL = "https://api.weixin.qq.com"` + `--api-base-url`），代理缝天然存在；现行代理形态为固定 IP 云主机 SSH 中转（push_to_draft.mjs scp+ssh 编排，凭据用完即删） | source: `push_to_draft.mjs` + `publish_article.mjs:11` |

### 1.9 事实修正（对 FACTS.md 的勘误建议）

| # | 修正 | 证据 |
|---|---|---|
| C1 | FACTS.md 称 image_gen.mjs 为「9 家图片供应商带 fallback」——**实测当前 mjs 版仅实现 zhipuai + openai 两家**（`Unknown provider: ... Supported: zhipuai, openai`）。9 家矩阵完整存在于 `config.example.yaml` 文档与 Python 原版。插件需从零实现全矩阵（gpt-image-2 优先），属工作量项而非阻断项 | `image_gen.mjs:270`、`config.example.yaml` |
| C2 | md2html.mjs 渲染真身在 `@cf-studio/shared-ops/md-html`（workspace 私有包），插件需**平移内置**（vendored），不能依赖 workspace | `md2html.mjs:7` |

---

## 2. 技术选型表

| 层 | 选型 | 理由 | 备选与否决理由 |
|---|---|---|---|
| 语言/运行时 | TypeScript + Node ESM（Node ≥22.19 / ≥24） | DSH 平台即 TS/Cordis/ESM；参照插件 engines 实测 | Python：平台无宿主 Python 插件运行时（python/sdk 是 Agent 侧 SDK，不是宿主插件形态）——否决 |
| 插件框架 | Cordis（`@deepseek-ai/cordis`），host + client 双端单包 | 平台唯一插件形态；dsh-automation 验证了 host/client 同包结构可行 | 双包（host/client 分仓）：维护成本翻倍，无收益——否决 |
| 前端 | React 18.2（peerDep，不捆绑）+ DSH `ui-primitives` 标准件优先 | 平台锁定（F8）；peerDep 与宿主共享 React 单实例 | 自带 React 副本：双实例破坏 slots 上下文——否决 |
| 图标库 | **lucide-react**（tree-shakeable SVG，MIT，React 18 兼容） | P0 视觉门禁要求全项目锁一套 SVG 库；DSH ui-primitives 有自带图标但未公开完整清单（UNKNOWN），lucide 兜底且生态最大 | heroicons：同等可用的备选，无决定性差异 |
| 状态/样式 | 组件本地态 + RPC 快照订阅；样式跟随 DSH web-styling 约定（`docs/web-styling.md`）+ 少量自定义 CSS（Indigo/Slate 纯色 token，禁紫粉渐变） | 不引入状态库/组件库，减少与宿主样式冲突 | tailwind：宿主未用，引入成本高——否决（MVP） |
| 校验 | zod v4 | 与 DSH storage domain/参照插件一致（dsh-automation 依赖 zod ^4.1.5） | — |
| RRULE | rrule（RFC 5545）+ Intl 时区 | 标准实现；参照插件自研归一化但未开源为库 | 自研（luxon 手写）：重复造轮——否决 |
| 渲染 | vendored convertArticle（md→微信 HTML，内联样式+主题） | 源管线经真实生产使用检验；无npm等价物可替代微信内联样式要求 | doocs/md 渲染核：它是编辑器应用非库，抽取成本高于平移自有已验证代码——否决 |
| LLM 接入 | **复用 `ctx.llm`（DSH 原生供应商体系）** | 用户已在 DSH 配好模型（F23）；我们零凭据管理成本，模型选择器直接列原生 providers | 自建 LLM 配置面：重复平台能力且割裂用户体验——否决 |
| 图片生成 | 自建 `ImageProvider` 抽象（9 家 + gpt-image-2 第一） | 图片供应商与文本 LLM 供应商集合并集很小（仅 openai/azure/gemini 交叉）；DSH llm 服务是文本流协议（StreamChunk），装不下图片二进制返回——必须自建 | 挂到 ctx.llm adapter：协议不匹配——否决 |
| 持久化 | DSH storage domain（sqlite 路由优先，json 兜底，见 ADR-005） | 平台唯一受支持通道（F15-F18）；自带 SQLite 文件违反插件边界 | 自写文件到 `~/.dsh`：绕过平台、卸载不清理——否决 |
| 凭据 | `ctx.credentials`（CredentialRef） | 平台只写+脱敏描述符机制就是为本场景设计（F19/F20） | 自加密存储（age/DPAPI）：重复且差于平台机制——否决 |
| 调度 | 自建宿主调度服务（dsh-architecture 模式：durable occurrence claim + run 记录） | 官方 dsh-schedule 仅 session-local 无 RRULE（F29）；参照插件同路线自研并已验证 | 系统 cron / node-cron 库：无持久化、无恢复语义——否决 |
| 发布 | npm 发布预构建 `lib/`（用户免 build 授权）+ github tag pin 备选 | F5 的免授权安装路径；开源 MIT | 仅 git 安装：要求用户配 allowBuilds，信任门槛高——作为备选保留 |

---

## 3. 总体架构与模块划分

```
┌─────────────────────────── DSH Web (React 18, 127.0.0.1:3080) ───────────────────────────┐
│  conversation.view 视图环                                                                  │
│  ┌─────────────────────────── wewrite 工作台 tab（本插件 client）─────────────────────┐    │
│  │  选题面板 │ 编辑器(MD) │ 微信预览 │ 运行历史 │ 调度管理 │ 设置(微信/图片/模型)      │    │
│  └───────────────│ connection.rpc.call('dsh-wewrite', endpoint, payload) ─────────────┘    │
└──────────────────│ loopback only ─────────────────────────────────────────────────────────┘
                   │
┌──────────────────▼──────── DSH Host（Cordis，Node）────────────────────────────────────────┐
│  dsh-wewrite host plugin                                                                   │
│  ┌─────────┐  ┌────────────────────────── WeWriteService（唯一 authority）──────────────┐  │
│  │ rpc.ts  │→ │  pipeline/  引擎：选题→大纲→成稿→门禁→渲染→配图→(草稿箱)                │  │
│  │ tools.ts│→ │    │ ctx.llm.stream()（文本步）     │ ImageProvider fallback（图片步）   │  │
│  └─────────┘  │  scheduler/  RRULE clock→occurrence claim→派发 run                      │  │
│               │  wechat/    token/uploadimg/material/draft（apiBaseUrl 可配=代理缝）     │  │
│               └──────│ storageDomain.open(dsh-wewrite domain)  │ ctx.credentials ──────┘  │
└──────────────────────▼──────────────────────────────▼─────────────────────────────────────┘
                  ~/.dsh（storages 介质 + .credentials.yaml）
```

模块职责（依赖只能向下，单文件 ≤300 行）：

| 模块 | 职责 | 依赖 |
|---|---|---|
| `host/index.ts` | 入口装配：inject 声明、Config schema、apply 组装各模块（<100 行，无业务） | — |
| `host/service.ts` | WeWriteService：host 级唯一服务（对外 `ctx.wewrite`）；串行化写操作；聚合下述子模块 | domain, pipeline, scheduler, wechat, providers |
| `host/domain.ts` | storage domain spec（zod）+ 句柄生命周期（ctx.effect close） | shared |
| `host/pipeline/` | 步骤编排引擎：run 生命周期（queued→running→succeeded/failed/cancelled）、每步事件记录、AbortSignal 贯穿 | domain, providers, wechat, ctx.llm |
| `host/providers/` | ImageProvider 抽象 + 9 家实现 + fallback 编排（重试一次→降级下一家） | ctx.credentials, shared |
| `host/wechat/` | 微信 API 客户端（F30 端点族）+ 出口模式（直连/代理 base URL）+ 40164 诊断 | ctx.credentials, shared |
| `host/scheduler/` | RRULE 归一化、下次触发计算、misfire 宽限、durable occurrence claim、run 派发（dsh-automation §3.1 模式） | service, domain |
| `host/rpc.ts` | `connection.rpc.handle('dsh-wewrite', ..., {authority:'loopback'})` 适配层（薄，只做 payload 校验+转发 service） | service, shared |
| `host/tools.ts` | Agent 交互工具注册（`wewrite_run` / `wewrite_push_draft` / `wewrite_list_schedules`，可选启用） | service |
| `client/` | 工作台 tab（React）：视图环注册 + 面板组件 + RPC 封装 + zh/en 词典 | shared |
| `shared/` | 双端契约：zod schema（RPC payload/view model）、provider id 联合类型、能力协商常量 | — |
| `render/` | vendored md→微信 HTML（convertArticle + inline styles + themes），host 侧渲染，预览 HTML 经 RPC 返回（保证预览=产物） | — |

**管线执行形态（ADR-003）**：管线由宿主服务**代码驱动**，文本步直接调 `ctx.llm.stream()`（F22 辅助调用先例），确定性步骤（选题抓取/门禁/渲染/配图/推送）纯代码执行。不经 Agent 循环编排——真实生产使用的管线是确定性步骤流，交给 LLM 自主编排会引入不确定性并浪费编排 token。Agent 交互面降级为可选工具（tools.ts）。

---

## 4. 插件包结构（目录树）

```
dsh-wewrite/
├── package.json               # 见 §4.1 manifest 示例
├── cordis.patch.yml           # - insert: [{ id: wewrite, name: dsh-wewrite, config: {...} }]
├── tsconfig.json
├── README.md / README.zh-CN.md
├── src/
│   ├── shared/
│   │   ├── contract.ts        # RPC 端点 request/response zod schema（机器可读契约）
│   │   ├── view-models.ts     # ArticleViewModel / RunViewModel / ScheduleViewModel / ConfigView
│   │   └── image-provider-ids.ts
│   ├── host/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   ├── domain.ts
│   │   ├── rpc.ts
│   │   ├── tools.ts
│   │   ├── pipeline/
│   │   │   ├── engine.ts
│   │   │   ├── events.ts
│   │   │   └── steps/
│   │   │       ├── topic.ts         # 热门榜聚合（微博/头条/百度，平移 fetch_hotspots）或固定主题
│   │   │       ├── outline.ts       # 大纲（ctx.llm）
│   │   │       ├── draft.ts         # 成稿（ctx.llm）
│   │   │       ├── gates.ts         # quality_validate --strict + validate_numbering 门禁
│   │   │       ├── render.ts        # convertArticle + 主题
│   │   │       └── images.ts        # 封面+正文图（providers fallback）
│   │   ├── providers/
│   │   │   ├── types.ts             # ImageProvider 接口
│   │   │   ├── registry.ts          # 注册表 + fallback 编排
│   │   │   ├── openai.ts            # gpt-image-2（第一供应商）
│   │   │   ├── doubao.ts / dashscope.ts / jimeng.ts / minimax.ts
│   │   │   ├── azure-openai.ts / gemini.ts / openrouter.ts / replicate.ts
│   │   ├── wechat/
│   │   │   ├── client.ts            # token / uploadimg / add_material / draft add|get|update
│   │   │   ├── egress.ts            # 出口模式：direct | proxy-base-url
│   │   │   └── diagnostics.ts       # 40164 特判与配置指引文案
│   │   └── scheduler/
│   │       ├── service.ts
│   │       └── rrule.ts
│   ├── client/
│   │   ├── index.tsx                # client 入口 apply(ctx)
│   │   ├── view.tsx                 # conversation.view 注册 + WorkbenchView 骨架
│   │   ├── rpc.ts
│   │   ├── panels/
│   │   │   ├── topic-panel.tsx / editor-panel.tsx / preview-panel.tsx
│   │   │   ├── runs-panel.tsx / schedules-panel.tsx / settings-panel.tsx
│   │   ├── locales/{zh,en}.ts
│   │   └── styles/tokens.css        # Indigo/Slate 纯色 token（P0 视觉门禁）
│   └── render/                      # vendored 渲染真身（自 shared-ops/md-html 平移）
│       ├── convert.ts / inline-styles.ts / themes/*.ts
├── tools/                           # relay 参考实现（自托管微信代理，一行 docker）
│   └── wechat-relay/                # 仅透传 api.weixin.qq.com + 固定出口 IP，README 引导
└── docs/
    ├── tech-architecture.md         # 本文
    └── decisions/                   # ADR 落位（本文 §10 为源，后续按文件拆出）
```

### 4.1 package.json manifest（关键段）

```json
{
  "name": "dsh-wewrite",
  "type": "module",
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" },
    "./shared": { "types": "./lib/types/shared/index.d.ts", "default": "./lib/shared.js" }
  },
  "peerDependencies": { "react": "^18.2.0", "@deepseek-ai/cordis": "*" },
  "peerDependenciesMeta": { "react": { "optional": true } },
  "dependencies": { "rrule": "^2.8.1", "zod": "^4.1.5" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-conversation"
      ]
    }
  }
}
```

（`@deepseek-ai/cordis` peer 版本范围在首版开发时以本机 `~/.dsh/profiles/web` 实测锁定，见 §8。）

---

## 5. 数据模型（storage domain schema）

单一 domain `dsh-wewrite`，version 1（介质版本不符时 open 拒绝，天然迁移闸门）。全部记录带 `v` 字段做记录级演进。zod schema 即权威，下为字段说明。

```
DomainSpec
├─ global: SettingsRecord
├─ table articles   (ArticleId  → ArticleRecord)
├─ table runs       (RunId      → RunRecord)
├─ table schedules  (ScheduleId → ScheduleRecord)
└─ table images     (ImageId    → ImageRecord)
```

**SettingsRecord**（global，非机密项；机密一律走 credentials）

| 字段 | 类型 | 说明 |
|---|---|---|
| wechatAppId | string | 公众号 appid（非机密） |
| wechatApiBaseUrl | string | 默认 `https://api.weixin.qq.com`；IP 白名单场景改自托管 relay 地址（F31/F32） |
| wechatAuthor | string | 默认署名 |
| defaultTheme | string | 排版主题（professional-clean 等） |
| defaultImageSize | enum | 1024x1024 等 |
| llmDefault | { provider?, model? } | 管线文本步默认模型；空则跟随 DSH 当前默认 |
| imageProviders | ImageProviderConfig[] | **有序 fallback 列表**（gpt-image-2/openai 永远默认第一）；每项 { providerId, model?, baseUrl?, credentialRef } |
| agentToolsEnabled | boolean | 是否向 Agent 注册交互工具（默认 false） |
| runHistoryLimit | number | 默认 200，参照 dsh-automation historyLimit |

**ArticleRecord**

| 字段 | 类型 | 说明 |
|---|---|---|
| v / id / slug / title / digest | — | digest 为摘要（必填，draft/add 需要） |
| status | 'editing' \| 'rendered' \| 'pushed' \| 'failed' | |
| markdown | string | 正文源 |
| theme | string | 本篇排版主题 |
| coverImageId? / bodyImageIds | string[] | 指向 images 表 |
| wechatMediaId? / thumbMediaId? | string | 推送草稿成功后回填 |
| lastRunId? | string | 产生本文的 run |
| createdAt / updatedAt | string | |

**RunRecord**（管线运行史，含调度触发与手动触发）

| 字段 | 类型 | 说明 |
|---|---|---|
| v / id | — | |
| trigger | 'manual' \| 'schedule' | |
| scheduleId? / articleId? | string | |
| paramsSnapshot | RunParams | 触发时参数快照（topicMode: 'hotspots'\|'fixed'、topic、theme、imageCount、llm provider/model 覆盖）——参照 dsh-automation 的 prompt/target snapshot 原则：run 保留触发时刻的意图 |
| status | 'queued' \| 'running' \| 'succeeded' \| 'failed' \| 'cancelled' \| 'interrupted' | interrupted = 宿主停机打断（启动时恢复扫描） |
| steps | StepRecord[] | { name, status, startedAt, finishedAt?, error?{code,message}, metrics?（token 用量/图片供应商命中）} |
| error? / summary? | — | 终态摘要 |
| startedAt / finishedAt? | string | |

**ScheduleRecord**

| 字段 | 类型 | 说明 |
|---|---|---|
| v / id / revision | — | 每次更新递增 revision；运行保留当时快照 |
| name / enabled | — | |
| rrule | string | RFC 5545（如 `FREQ=DAILY;BYHOUR=4`），存储前归一化校验 |
| timeZone | string | IANA |
| params | RunParams | 调度触发的管线参数 |
| publishTarget | 'draft' | **v0.1 恒为 draft（产品价值观，freepublish 不做）** |
| nextRunAt / lastRunAt? | string | nextRunAt 是投影非权威（由 rrule+当前时刻计算），权威只在 rrule |
| createdAt / updatedAt | — | |

**ImageRecord**

| 字段 | 类型 | 说明 |
|---|---|---|
| v / id / articleId | — | |
| kind | 'cover' \| 'body' | |
| mime | string | |
| base64 | string | 二进制入库（ADR-005）；单张 ≤10MB 上限 |
| provider / model / prompt | string | 生成溯源（fallback 命中哪家的审计链） |
| wechatUrl? / wechatMediaId? | string | 上传微信后回填（uploadimg CDN URL / thumb media id） |
| createdAt | — | |

索引/查询策略：DSH KvTable 为全内存快照迭代（F16），MVP 量级（百级文章、千级 run）无索引问题；`runHistoryLimit` 修剪终态记录保活跃+最新 N 条（dsh-automation prune 模式）。

---

## 6. UI ↔ Host RPC 接口契约（端点级）

**通道**：`dsh-wewrite`，authority `loopback`（F13——控制无人值守写面的通道按平台先例只开本机回环）。
**契约载体说明**：本产品无独立 HTTP 服务，DSH client↔host 走平台 RPC 通道，故以本表 + `src/shared/contract.ts` 的 zod schema 作为前后端唯一契约（OpenAPI 不适用；契约变更流程：改 shared schema → 双端同步重生成，走 Team Lead 通报）。payload/response 全部过 zod 双端校验。

| endpoint | request | response | 说明 |
|---|---|---|---|
| `snapshot` | `{}` | `Snapshot { articles[], runs[], schedules[], config: ConfigView, serverNow, capabilities }` | 首拉全量；capabilities 做版本协商（§8） |
| `hotspots/fetch` | `{ limit? }` | `HotspotItem[] { title, source, rank, url }` | 微博/头条/百度聚合（F30 同源逻辑平移） |
| `article/list` | `{}` | `ArticleListItem[]` | 列表轻量视图 |
| `article/get` | `{ id }` | `ArticleDetail` | 含 markdown |
| `article/save` | `{ id?, slug, title, digest, markdown, theme }` | `ArticleDetail` | 创建/更新 |
| `article/delete` | `{ id }` | `{ deleted: boolean }` | |
| `article/preview` | `{ id }` 或 `{ markdown, theme }` | `{ html }` | host 侧渲染返回（预览=产物一致性） |
| `run/start` | `{ articleId? , params: RunParams }` | `{ runId }` | 手动跑管线 |
| `run/cancel` | `{ runId }` | `{ ok }` | AbortSignal 贯穿 |
| `schedule/save` | `{ id?, name, rrule, timeZone, params, enabled }` | `ScheduleViewModel` | 创建/更新（revision++） |
| `schedule/delete` / `schedule/toggle` / `schedule/runNow` | `{ id }` / `{ id, enabled }` / `{ id }` | 对应视图 | |
| `config/get` | `{}` | `ConfigView`（全脱敏：settings 非机密项 + credentials describe() 描述符 + imageProviders 有序表） | |
| `config/set` | `Partial<SettingsRecord>` | `ConfigView` | 非机密项写 |
| `credentials/set` | `{ ref, value }` | `{ ok }` | 直通 `ctx.credentials.set`（只写） |
| `credentials/describe` | `{}` | `Record<ref, {configured, writable}>` | UI「已配置」徽标 |
| `llm/options` | `{}` | `{ providers: [{id, models[]}] }` | 透传 `ctx.llm.listProviders/listModels` 供模型选择器 |
| `wechat/pushDraft` | `{ articleId }` | `{ mediaId, thumbMediaId }` | **用户显式动作**；全链路校验（标题/图数/CDN URL，同 publish_article 验证器） |
| `wechat/diagnose` | `{}` | `{ reachable, ipWhitelisted?, errcode? , hint }` | 40164 特判（F31）给配置指引 |

推送约束（响应产品价值观）：管线运行**不自动群发**；调度触发默认产物止步「渲染完成 + 待确认」，是否自动 `pushDraft` 由 ScheduleRecord 显式字段控制（v0.1 默认 false→仅手动推送；「自动进草稿箱」为 enabled 时的白名单动作，仍只是草稿箱）。

---

## 7. Provider 抽象接口

### 7.1 图片（自建，对齐源管线 fallback 矩阵 + gpt-image-2 第一）

```ts
// src/host/providers/types.ts
export interface ImageGenRequest {
  readonly prompt: string;
  readonly size: ImageSize;            // '1024x1024' | '1024x1536' | ...
  readonly n: number;                  // 默认 1
  readonly signal?: AbortSignal;
}
export interface ImageGenResult {
  readonly images: readonly { readonly buffer: Buffer; readonly mime: string }[];
  readonly model: string;              // 实际命中的 model id（审计）
}
export interface ImageProvider {
  readonly id: ImageProviderId;        // 'openai' | 'doubao' | 'dashscope' | 'jimeng' | 'minimax'
                                       // | 'azure_openai' | 'gemini' | 'openrouter' | 'replicate'
  generate(req: ImageGenRequest, cfg: ResolvedProviderConfig): Promise<ImageGenResult>;
  // 错误约定：抛 ImageProviderError { providerId, code: 'AUTH'|'RATE_LIMIT'|'TIMEOUT'|'PROVIDER'|'NETWORK', retryable: boolean, message }
}
```

- **默认 fallback 顺序**（用户可在设置里重排/删减）：`openai(gpt-image-2) → doubao → dashscope → jimeng → minimax → azure_openai → gemini → openrouter → replicate`。
- fallback 编排（registry.ts）：按序尝试，单家重试 1 次（仅 retryable 错误），切换下一家前记录「尝试史」进 StepRecord.metrics；全部失败 → 步骤失败带完整尝试链。gpt-image-2 的 API 形态（参数名/size 支持）为 ASSUMPTION——首版开发期以 openai images API 实测校准（探测：curl 一次 `/v1/images/generations`）。
- 每家实现单文件（≤300 行规则），jimeng 的 access_key_id+secret_key 双凭据、azure 的 deployment+base_url 等差异封装在各实现内，`ResolvedProviderConfig` 统一携带 `{ apiKey(ref 解析后), baseUrl?, model?, extra? }`。
- 与源脚本行为对齐：b64_json 与 url 两种返回形态都支持（image_gen.mjs 先例）、水印关闭参数按家适配。

### 7.2 文本 LLM（复用 DSH 原生）

不建自有抽象层。管线文本步（大纲/成稿）：

```ts
const stream = ctx.llm.stream({
  provider, model,                    // 来自 config.llmDefault 或 run 参数覆盖；F23 用户原生配置
  purpose: 'wewrite-pipeline',        // 辅助调用标注（F22）
  messages: toMessages(promptStep),
  temperature, maxTokens,
});
for await (const chunk of stream) { /* BlockAssembler 组装 */ }
```

模型选择器数据源 = `llm/options` RPC（透传平台 providers）；用户换模型零迁移成本（F23 即时生效）。失败（终端 finish error）→ run 步骤失败，不入 fallback（文本步跨供应商 fallback 属产品语义混乱，v0.1 不做——用户显式选模型）。

---

## 8. 安全设计

| 面 | 方案 |
|---|---|
| 凭据存储 | 微信 secret、9 家图片 key 全走 `ctx.credentials`（CredentialRef：`WEWRITE_WECHAT_SECRET`、`WEWRITE_IMG_OPENAI`…POSIX 命名）；**值永不入 storage domain、永不进 settings 记录、永不出 host**（F19/F20 平台机制）。appid/baseUrl/署名等非机密项才入 SettingsRecord |
| UI 凭据面 | 设置页只显 `credentials/describe` 描述符（已配置/可写徽标）；录入框只写（set 后清空），无「查看密码」 |
| RPC 边界 | 通道 authority `loopback`（F13 先例）：本机 Web 专属，控制面不暴露给 trusted-host 级调用 |
| 日志脱敏 | 三条硬规则：① Authorization/api_key/secret 值不进日志（logger 统一 redact 过滤器，键名匹配即替换 `[redacted]`）；② 微信 token 响应只记 errcode 不记 access_token；③ provider 错误消息截断 500 字符并剥离 header 回显 |
| 代理配置 | `wechatApiBaseUrl` 显式配置项（硬约束 2）：`direct`（用户 IP 已白名单）/ 自托管 relay（tools/wechat-relay 参考实现：反代 api.weixin.qq.com，用户把 relay 服务器 IP 加白名单；docker 一行部署）。relay 鉴权：可选 bearer token（env 注入），防止开放代理被滥用。SSH 云主机模式**不进 v0.1**（源管线形态对插件用户过重），README 记迁移指引 |
| 群发防线 | v0.1 不实现 freepublish 任何调用路径；ScheduleRecord.publishTarget 恒 'draft'（类型层面即不可表达群发） |
| 二进制上限 | 单图 ≤10MB、单篇正文图 ≤10 张（uploadimg 上限内），超限即拒 |
| 日志与产物边界 | 渲染 HTML/图片入 domain 记录（平台介质内），不向 workspace 工作目录写文件（不污染用户代码树） |

---

## 9. v0.1 兼容防御策略（平台 pre-release 现实）

1. **能力探测（feature detection）**：`apply()` 内不假设服务存在——inject 声明（storageDomain/connection 等）缺失时 Cordis 直接拒载（loud failure，优于半活）；client 侧 `slots.register` 包 try/catch，槽位名不存在时降级为「仅 Agent 工具可用」并 console 警告。
2. **storage 后端降级**：路由首选 sqlite，`ctx.storage` forms/backends 探测不到 sqlite 时回落 json（F17 路由由本插件 config 决定，属声明式降级）。探测点：`open()` 的 `backend-not-found` 错误捕获。
3. **版本协商**：`snapshot.capabilities` 返回 `{ contractVersion: 1, features: [...] }`；client 校验不认识即提示升级插件，不盲目渲染。
4. **不依赖无承诺面**：SESSION_FORMAT_VERSION=0 无兼容承诺（F28）→ 权威数据只落自有 domain（自管 version），session log 仅在可选 Agent 工具路径中使用且不做回放依赖；磁盘路径不做任何假设（F18）。
5. **peerDeps + README 声明**：`@deepseek-ai/cordis` peer 范围、README「已验证 DSH 版本」章节（首个 release 对齐本机 master@2026-08-17 实测），后续 DSH 升级以 CI 装 DSH 冒烟（装插件→dump-config→快照 RPC 打通）。
6. **记录级演进**：全部记录 `v` 字段 + domain `version`，升级时 open 拒绝旧介质 → 显式迁移函数（读旧→写新→version++），不做隐式漂移。

---

## 10. 关键决策记录（ADR 摘要，MADR 格式；正式拆出至 docs/decisions/）

**ADR-001 技术栈跟随 DSH 平台（对 workspace 自托管栈的例外）** — Status: Accepted
Background：FACTS 硬约束 5 + Jerry 指令。Decision：TS/Node ESM/Cordis/React18/storage domain，见 §0/§2。Consequences：正向—零部署运维、搭平台便车（凭据/UI/RPC）；负向—绑定 pre-release 平台 API，须做 §9 防御。

**ADR-002 host+client 双端单包** — Status: Accepted
Decision：单包双入口（`.` / `./client` / `./shared`），dsh-automation 已验证结构。Consequences：发布/安装单命令；代价是构建管线要同时产出两 bundle。

**ADR-003 管线=宿主服务直调 ctx.llm，非 Agent 编排** — Status: Accepted
Background：F22 证明可行；源管线是确定性步骤流。Decision：engine 代码驱动，Agent 工具为可选交互面。Consequences：确定可测、token 省；放弃 Agent 自主性（对写作管线是优点不是损失）。

**ADR-004 自建 RRULE 调度器** — Status: Accepted
Background：F29 官方 schedule 不满足（无 RRULE、不冷启动、session-local）。Decision：dsh-automation 模式（durable occurrence claim + run 记录 + revision 快照 + misfire 宽限）。Consequences：多一个自维护模块；换来无人值守+可审计。

**ADR-005 数据落 storage domain，图片 base64 入库，sqlite 优先 json 兜底** — Status: Accepted
Background：F15-F18；二进制无官方文件 API。Decision：见 §5/§8。Consequences：避开 UNKNOWN 磁盘路径约定；代价是 json 后端时大记录整文件重写（MVP 量级可接受，量级上来后 sqlite 路由已覆盖）。

**ADR-006 凭据全走 ctx.credentials** — Status: Accepted（无悬念，平台机制即为此设计）

**ADR-007 微信出口=可配 apiBaseUrl（direct/proxy 两模式），SSH 中继不进 v0.1** — Status: Accepted
Background：F31/F32。Consequences：用户需自备 relay 或白名单本机 IP；提供 docker 参考实现降低门槛。

**ADR-008 发布走 npm 预构建产物** — Status: Accepted
Background：F5 allowBuilds 信任门槛。Consequences：发布流程要求 build+publint 校验；git tag pin 作备选路径。

**ADR-009 图标锁 lucide-react** — Status: Accepted（P0 视觉门禁：一套 SVG 库、无紫粉渐变、Indigo/Slate 纯色 token）

---

## 11. 可行性结论

**总裁决：技术可行，无不可行项。** 全部核心功能（主题写作+热门榜选题、供应商配置、编辑+预览、RRULE 定时到草稿箱、gpt-image-2 优先的图片 fallback）在 DSH v0.1 插件 API 下均有已查实的实现路径（§1 事实清单 + §2-§8 设计）。

风险分级（全部为「成本高+替代方案」级，无「完全不可行」级）：

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 图片 9 家 provider 全量实现（源 mjs 仅 2 家，C1） | 中（工作量） | 每家独立文件可并行开发；先交付 openai+doubao+dashscope 三家首发，其余按序补齐（fallback 矩阵渐进生效） |
| R2 | gpt-image-2 API 形态未实测（参数/size 支持） | 低 | 开发首日 curl 探测校准 openai.ts；不行则以 doubao 顶首位并标注 |
| R3 | UI 仅会话级 tab，无全局页（F12 UNKNOWN） | 低-中 | conversation.view 已被 dsh-automation/ui-trajectory 证实可用；工作台单 tab 内分面板即可承载；探测 root 级槽位留 Phase 2 |
| R4 | 插件 storage 磁盘路径无文档（F18） | 低 | 架构只用 API 不碰路径（ADR-005），天然免疫 |
| R5 | 微信代理依赖用户自备（F31） | 低（体验门槛） | 直连/relay 双模式 + docker 参考实现 + diagnose 端点 40164 指引 |
| R6 | DSH pre-release breaking（F28 等） | 中（时间维度） | §9 六项防御 + README 版本声明 + CI 冒烟 |

**对下游的开工指令**：开发可直接按 §4 目录树 + §5 schema + §6 契约 + §7 接口开工；QA 以 §6 端点表与 §8 安全规则为验收基线；设计师以 F9-F11 槽位边界 + ADR-009 视觉门禁做 UI 规范。
