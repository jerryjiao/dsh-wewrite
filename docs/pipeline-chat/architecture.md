# dsh-wewrite 对话深度结合：技术架构（三期）

| 项 | 内容 |
|---|---|
| 产品线 | chat-integration（feat/chat-integration 分支）——「对话是驾驶舱，写作台是精修车间」 |
| 作者 | 高见远（MVP 专家团架构师），2026-08-20 |
| 上游 | `docs/reviews/2026-08-20-dsh-wewrite-chat-integration-research.md`（方向结论）；`docs/tech-architecture.md`（v0.1 总架构，本文是其 chat 线增量） |
| 宿主真源 | `~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/`（v0.1.0-rc.7，下文 `<N>`）。**本文全部宿主结论已逐条到类型面核实**，与调研报告不一致处以本文为准（见 §1 勘误表） |
| 下游 | 开发（§3 文件级设计直接开工）、QA（§8 测试挂点）、并行线协调（§9 冲突面） |

---

## 0. 对调研报告的两条技术勘误（已亲自核实，方向不翻案）

调研报告的三期框架（一期工具卡片化 / 二期草稿即对话卡片 / 三期 composer 与命令）**方向维持**。但两条关键技术结论经宿主类型面复核后必须修正，直接影响二期的实现载体：

### 勘误 1（P0 阻断）：插件自定义事件**不可**写入 session log

报告称「自定义事件：SessionEventMap 合并扩展——插件事件可作为自定义卡片进时间线」「历史会话回放安全（replay 三路摄入官方已处理）」。核实结果：**live 摄入确实可用，但持久化回放路径会拒绝含插件事件的整个日志**——写入即把用户会话变成不可恢复。

证据链（rc.7 实测）：

1. `<N>/dsh-session/lib/types/known-event-types.d.ts`：`KNOWN_SESSION_EVENT_TYPES` 由 harness 仓库生成，**out-of-repo 插件事件按构造就不在集合内**，官方注释明示「a registration surface for them is deferred until such a consumer exists」。
2. `<N>/dsh-session-persistence/lib/index.js:1117-1121` `assertEventsSupported`：读到集合外且未标 `ignorable` 的事件类型 → 抛 `SessionFormatUnsupportedError`（"refusing to interpret the log"）。该检查挂在全部恢复路径上：`readFromCore`(:958)、`readStoredPrefix`(:979)、resume(:994)、(:1291)。
3. `<N>/dsh-session/lib/index.js:1440-1465` `Session.append()` 实现：事件信封只构造 `{type, seq, time, data, ...surfaceMetadata}`——**没有任何公开 API 能给插件事件打 `ignorable: true` 标记**（该字段只在恢复读路径被接受，append 写路径无法设置）。

结论：**二期不做「wewrite 事件族合并 SessionEventMap 并写入 session log」。** 草稿卡改走官方 ui-deliverables 同款载体：`ConversationNodeDefinition`（client-only）匹配**我们自己的 tool/call + tool/result 事件**（均为 known 类型，天然回放安全）+ `conversation.chat.turnTail` 产物行 + `tool.call.toolview` keyed 卡片。官方 `dsh-client-ui-deliverables`（turn-deliverables.d.ts）就是这个模式的现成先例——它同样是零自定义 session 事件。解锁条件与预留方案见 §2.4。

### 勘误 2（P1）：现有 tools.ts 的注册形状与 rc.7 `ToolDefinition` 不符，启用不是翻配置

`src/host/tools.ts:14-19` 本地声明的 `ToolDefinition` 只有 `{name, description, parameters, execute(args)}`。rc.7 真源 `<N>/dsh-tools/lib/types/index.d.ts:106-172`：

- `execute(args, exec: ToolRunContext)` 是**双参**（第二参携带 `exec.signal` / `exec.agent` / `deferContext()`）；
- **必填** `output: ToolOutputDefinition`（`schema: JsonSchemaNode` + `render(args, value): ContentBlock[]` + 可选 `presentationMeta`）——canonical 输出契约，`createSuccessResult` 在 execute 后对返回值做 schema 校验并 render。

当前形状因 `agentToolsEnabled: false` 从未真正注册执行过，问题被掩盖。**一期第一件事是按真契约重写工具面**（§4），不是把 cordis.patch.yml 的开关改 true（只改开关，首次模型调用即会因缺 `output` 失败）。

### 宿主 seam 核实总表（本文引用的全部真源）

| # | Seam | 真源 | 结论 |
|---|---|---|---|
| S1 | `ToolDefinition` / `defineTool` / `ToolRunContext` | dsh-tools `lib/types/index.d.ts:106-172`、`schema.d.ts:178-239` | output 必填；execute 双参；`presentCall/presentResult` 纯函数（live + 回放共用） |
| S2 | `ToolCallView`（generic/terminal/diff）、`ToolResultView`（六种卡） | dsh-tools `lib/types/presentation.d.ts` | 声明式 render intent 词汇表；diff 卡语义绑定「文件」（FileLocation/FileDiff） |
| S3 | 工具卡客户端宿主计算 | dsh-client-runtime `sessions/conversation.d.ts:161-186` | `ToolResultNode.callView/resultView` 是 host 计算后随 wire 下发（null=通用 JSON 卡）；`meta` 持久化进 tool/result，回放同卡 |
| S4 | `tool.call.toolview`（keyed 按 wire 工具名） | dsh-client-ui-tool `contract/slots.d.ts:20-45` | 对自己的工具纯增量；owner props `{callId, toolName, block, cwd?, openFile, inspect?}` |
| S5 | `ConversationNodeDefinition`（match/start/update/buildViewNode） | dsh-client-runtime `contract/conversation.d.ts:151-200` | 事件→业务节点状态机；client 经 `ctx.conversationEvents.register` 注册（client-runtime `client/index.d.ts:111`） |
| S6 | 官方 deliverables 先例 | dsh-client-ui-deliverables `client/turn-deliverables.d.ts` | client-only Definition 匹配 tool/result、按 render intent 识别、发布 TurnData、turnTail 链选择器挂载前裁决（decline-before-mount） |
| S7 | `conversation.chat.node`（keyed）/ `turnTail`（chain）/ `commandview`（keyed）/ `assistant-actions`（list） | dsh-client-ui-conversation `contract/slots.d.ts:84-131` | 见 §5；root 槽禁注册（dsh-client-runtime `client/slots.d.ts:21-29`） |
| S8 | `conversation.input.left/right`（list，InputZone owner） | 同上 slots.d.ts:216-232 | 小控件席位；owner 是 point-in-time 快照，禁止自订阅 |
| S9 | `ctx.commands.register`（host slash 命令，handler 不进模型） | dsh-commands `lib/types/index.d.ts:25-40,77` | `CommandDefinition {name, description, input?, recordInput?, handler}`；command/run 是 known 事件，未注册 commandview 也有通用卡兜底 |
| S10 | `ctx.commandUi.register/decorate`（client 命令菜单 popupSelect） | dsh-client-ui-commands `client/contract.d.ts:11-50` | 与 host 目录按名合并，撞名 fail-loud |
| S11 | `ctx.inputTriggers`（`@`/`/` 补全源 + ReferenceCodec） | dsh-client-ui-input-trigger `types/types.d.ts:125-198`、`client/index.d.ts:15` | 候选/挑选/enter-space 裁决/lexicon；codec.serialize 进模型可见文本，失败阻塞发送（不静默降级） |
| S12 | `Agent` 句柄（`session`/`followup`/`inject`/`steer`/`whenIdle`） | dsh-agent `lib/types/runtime-types.d.ts:60-130` | 工具 execute 内经 `exec.agent` 拿 live session 与 inbox |
| S13 | `Session.append` / 持久化已知集 | dsh-session `lib/types/index.d.ts:212`、见勘误 1 | 插件事件写 log = 会话不可恢复，禁用 |

---

## 1. 三期总架构

```
┌─────────────────────────── DSH Web（React 18）──────────────────────────────┐
│  对话时间线（官方 ui-conversation 渲染）                                      │
│  ┌─ wewrite_run 工具行（tool.call.toolview keyed，本插件 client）──────────┐ │
│  │  运行态：六步进度卡（run/detail RPC 轮询）   ←──── 二期 M2              │ │
│  │  完成态：成稿卡（host 计算 resultView + meta）                            │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│  ┌─ Turn 末产物行（conversation.chat.turnTail 链，deliverables 模式）──────┐ │
│  │  本回合产出：《标题》 [成稿|已推送] → 点击打开写作台浮层并定位            │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│  composer：input.right「写作」按钮 ─ /wewrite 命令 ─ @ 文章引用源   ←─ 三期  │
│  侧栏入口 + shell.overlay 写作台浮层（既有，不动）                            │
└────────────▲──────────────────────────────┬─────────────────────────────────┘
             │ run/detail 等新增 RPC（loopback）│ ①工具调用 tool/call+tool/result
┌────────────┴──────────────────────────────▼─────────────────────────────────┐
│  DSH Host（Cordis）                                                          │
│  agent-tools/（一期重写）：defineTool 形状 ×4 工具                             │
│    wewrite_run / wewrite_rewrite / wewrite_push_draft / wewrite_list_articles│
│    presentCall/presentResult 声明式卡片（纯函数，回放共用）                    │
│  WeWriteService（唯一 authority，不动）：pipeline engine 六步                  │
│    topic→outline→draft→gates→render→images（RunRecord.steps 即事件族真身）    │
└──────────────────────────────────────────────────────────────────────────────┘
```

数据流两句话：**host 侧**工具 execute 驱动 service（管线照旧跑在 RunRecord，事件族=steps 状态机），返回 canonical value，presentCall/presentResult 把进度/成稿投影成 render intent 随 tool 事件持久化；**client 侧**toolview/turnTail 从 wire 上的 `callView/resultView/meta` 渲染卡片，运行态细节经 loopback RPC 轮询补足。host 写入与 client 渲染天然解耦（与既有双端包结构一致）。

---

## 2. wewrite「事件族」schema（载体修正版）

### 2.1 事件族的真身：RunRecord.steps + tool result canonical/meta

「事件族」不落 session log（勘误 1），由三层构成：

| 层 | 载体 | 写入时机 | 消费方 |
|---|---|---|---|
| E1 进度事件族 | `RunRecord.steps[]`（既有 domain，engine.patchStep 每步写） | 见 §2.2 挂点表 | client 经新增 RPC `run/detail` 轮询（M2 卡片运行态）；snapshot 既有 |
| E2 终局投影 | tool result canonical value + `output.presentationMeta`（随 `tool/result` 事件持久化，known 类型） | 工具 execute 返回时 | presentResult（host 计算 resultView）→ 通用卡兜底；toolview/meta → 富卡 |
| E3 Turn 聚合 | client ConversationNodeDefinition 状态机（匹配 E2 的 tool/result 事件） | client 摄入时 | turnTail 产物行 |

**硬约束（写进代码注释）**：E2 的 `meta` 必须无损 JSON（`Session.append` 对 `tool/result` 的 meta 跑 `isJsonValue` 运行时校验，非 JSON 直接在写入点抛错）——meta schema 用 zod 钉死并过序列化测试（§8）。

### 2.2 管线六步挂点表（E1/E2 写入时机）

engine 六步序列锁定 `topic → outline → draft → gates → render → images`（`src/host/pipeline/engine.ts:15`）。挂点**零改 engine**（增量全在 service/工具封装层）：

| 管线步 | RunRecord.steps 转移（既有） | 聊天卡可见什么（toolview 运行态） | settle 后 meta 字段（E2） |
|---|---|---|---|
| begin | run: queued，六步全 pending | 「已提交，排队中」 | — |
| topic | topic: running→succeeded（metrics.topicSource/topicUrl） | 第 1 步点亮（热榜模式显示来源） | `topic` |
| outline | outline: running→succeeded（metrics.chars） | 第 2 步点亮 | `outlineChars` |
| draft | draft: running→succeeded（metrics.chars） | 第 3 步点亮 | `draftChars` |
| gates | gates: running→succeeded（metrics.report） | 第 4 步点亮；失败=整 run failed 阻断 | `gatePassed` |
| render | render: succeeded；`onProduced` 落 article（既有） | 第 5 步点亮 | `articleId`, `slug`, `title`, `digest` |
| images | images: succeeded/failed（AC-9 失败仍 run succeeded） | 第 6 步点亮/带「无图推进」标记 | `coverImageId?`, `bodyImageCount` |
| 终态 | run: succeeded/failed/cancelled（finishRun 既有） | 终态卡 | `status`, `error?` |

### 2.3 E2 schema：`src/shared/agent-tool-contract.ts`（新增，zod）

```ts
// wewrite_run 的 canonical value（execute 返回，过 output.schema 校验）
RunToolValueSchema = z.strictObject({
  ok: z.boolean(),
  runId: z.string(),
  status: z.enum(['succeeded','failed','cancelled','interrupted']),
  articleId: z.string().optional(),   // render 步产出后
  title: z.string().optional(),
  digest: z.string().optional(),      // <=200 字，卡面摘要
  gatePassed: z.boolean().optional(),
  error: z.strictObject({ code: z.string(), message: z.string() }).optional(),
})
// presentationMeta（回放用投影，无损 JSON，字段是 value 的子集+卡片冗余）
RunToolMetaSchema = RunToolValueSchema.extend({
  tool: z.literal('wewrite_run'),     // E3 识别用标记
  topic: z.string(),                  // presentCall 侧的入参快照
})
// wewrite_push_draft
PushToolMetaSchema = z.strictObject({ tool: z.literal('wewrite_push_draft'),
  articleId: z.string(), title: z.string(), ok: z.boolean(),
  mediaId: z.string().optional(), error: z.strictObject({...}).optional() })
// wewrite_rewrite
RewriteToolMetaSchema = z.strictObject({ tool: z.literal('wewrite_rewrite'),
  charsIn: z.number().int(), charsOut: z.number().int(), ok: z.boolean(), error: ...optional() })
```

### 2.4 被阻断路径的预留（OPEN-DECISIONS 登记，不写代码）

「wewrite/* 直接进 session log」保留为 DSH 侧解锁后的升级路径。解锁条件（任一）：DSH 开放插件事件注册面（known-event-types.d.ts 注释中承诺的 registration surface）；或 `Session.append` 提供 `ignorable` 设置 API。届时：host 侧 `session-log-writer.ts`（按 run 事件把 §2.2 表投影成 `wewrite/run-*` 事件）+ client 侧 `SessionEventMap` 合并 + `conversation.chat.node` keyed 卡——本期架构的 E1/E2/E3 分层不变，只换 E1 的订阅源。登记进 `docs/decisions/OPEN-DECISIONS.md`。

---

## 3. 三期模块与文件级设计

单文件 ≤300 行、入口零业务、npm install 一律 `--legacy-peer-deps`、`lib/` committed（每个 milestone 交付时 `npm run build` 必跑并提交产物）。**「新增」文件全部是新目录，与并行线（AI改稿/UI专业化，动 src/client/components|panels|styles）物理隔离；「修改」文件清单与冲突预案见 §9。**

### M1 一期：工具面重写 + 声明式卡片（零 React，纯 host 侧）

| 文件 | 新增/改 | 职责 | 行数预算 |
|---|---|---|---|
| `src/host/agent-tools/index.ts` | 新增 | 装配：`registerAgentTools(ctx, service, {enabled})`，保留现有 roots()+agent/created 双挂载与 try/catch 降级骨架；返回 disposer 列表 | ~90 |
| `src/host/agent-tools/output-helpers.ts` | 新增 | `jsonSchema()`（object-root JsonSchemaNode 构造）+ `textBlocks()`（ContentBlock = `{type:'text',text}`，dsh-llm types.d.ts:39-42）+ `toolMeta()` 组装 | ~80 |
| `src/host/agent-tools/run-tool.ts` | 新增 | `wewrite_run` 定义：参数/execute（startRun→await 终态，转发 exec.signal→cancelRun，timeoutMs 10min）/presentCall/presentResult/presentationMeta | ~180 |
| `src/host/agent-tools/edit-tools.ts` | 新增 | `wewrite_rewrite`（调 service.rewriteText，45s 既有语义）+ `wewrite_push_draft`（pushArticleDraft）两个定义 | ~200 |
| `src/host/agent-tools/list-tool.ts` | 新增 | `wewrite_list_articles`（article/list 轻投影，供模型选 article_id） | ~80 |
| `src/host/agent-tools/push-approval.ts` | 新增 | OD-1：`tools/pre-execute` waterfall 审批闸（§4.4）；armed 标志导出供 list 挂接 | ~80 |
| `src/host/tools.ts` | **删除** | 被 agent-tools/ 取代（勘误 2） | -90 |
| `src/host/platform.ts` | 改 | `ToolsService.register` 形状对齐真契约（definition 含 output/execute(args,exec)）；`AgentScope` 补 `session?`；`HostContext.get` 保留 | +30 |
| `src/host/index.ts` | 改 | import 换 registerAgentTools（入口仍零业务） | ±5 |
| `src/host/service.ts` | 改 | 补 `runCompletion(runId): Promise<RunRecord|undefined>`（engine 侧 Map<runId,done> 暴露）；补 `runDetail(runId)` | +25 |
| `src/host/pipeline/engine.ts` | 改 | `PipelineEngine` 增 `await done` 句柄（begin 时登记 promise，终态后清理）；六步编排零改 | +15 |
| `src/shared/agent-tool-contract.ts` | 新增 | §2.3 schema | ~120 |
| `src/host/views.ts` | 改 | `runToDetail()`（RunRecord→含 steps 的投影） | +25 |
| `src/shared/view-schemas.ts` / `contract.ts` / `host/rpc.ts` | 改 | 新端点 `run/detail`（request `{runId}`，response RunDetail：RunSummary + steps[] + topic） | +45（三文件合计） |
| `cordis.patch.yml` | 改 | `agentToolsEnabled: true`（用户可在自己 profile 覆盖回 false） | ±1 |
| `tests/host/agent-tools.test.ts` 等 | 新增 | 见 §8 | ~350 |

### M2 二期：聊天卡（toolview 运行态卡 + turnTail 产物行 + 浮层联动）

| 文件 | 新增/改 | 职责 | 行数预算 |
|---|---|---|---|
| `src/client/chat/overlay-bridge.ts` | 新增（自 index.tsx 抽取并扩展） | 既有 overlayOpen/listeners 桥 + `overlayIntent: {articleId?}` 与 `consumeIntent()`；订阅式 | ~80 |
| `src/client/chat/run-detail-hook.ts` | 新增 | `useRunDetail(rpc, runId, active)`：active 3s/停轮询（对齐 App.tsx POLL_ACTIVE_MS 语义），失败静默保留末次快照 | ~90 |
| `src/client/chat/run-tool-card.tsx` | 新增 | `tool.call.toolview` keyed `wewrite_run` 渲染器：running=六步进度（复用 steps 数据，样式独立 `ww-chatcard`）；settled=从 block.meta 渲染成稿卡 + 「打开写作台」按钮 | ~280 |
| `src/client/chat/edit-tool-cards.tsx` | 新增 | keyed `wewrite_rewrite` / `wewrite_push_draft` 两卡（settled 即终态，无需轮询；meta 驱动） | ~150 |
| `src/client/chat/deliverables.ts` | 新增 | ConversationNodeDefinition `'wewrite-deliverables'`：match/start/update 状态机 + ConversationTurnDataMap 合并 + `selectWewriteArticles(owner)` 选择器（decline-before-mount） | ~160 |
| `src/client/chat/deliverables-row.tsx` | 新增 | turnTail 产物行组件：文章列表 + 状态 chip（成稿/已推送）+ 点击→overlay bridge | ~130 |
| `src/client/chat/register-chat.ts` | 新增 | M2 装配：3×toolview register + conversationEvents.register + turnTail register，全部独立 try/catch | ~120 |
| `src/client/index.tsx` | 改 | overlay 桥抽走改 import；apply 末尾追加 `registerChat(ctx, rpc)` 一行；既有三槽注册不动 | 净 -30 |
| `src/client/App.tsx` / `store.tsx` | 改 | 挂载时 consumeOverlayIntent→navigate({kind:'article',id})（一次性） | +18 |
| `src/client/lib/context.ts` | 改 | 补 toolview/turnTail/conversationEvents 最小结构类型（沿用「窄面刻意」注释纪律） | +45 |
| `src/client/styles/chatcard.css` | 新增 | 聊天卡样式（token 沿用既有 --ww-*，Indigo/Slate 纯色） | ~120 |
| `src/client/locales/{zh,en}.ts` | 改 | 卡片文案键 | +30 |
| `tests/client/*.test.tsx` | 新增 | 见 §8 | ~300 |

### M3 三期：composer / 命令 / 引用（Jerry 2026-08-20 拍板全量定案，含 @ 引用；§3 文件设计即按全量给出，无新增风险点）

| 文件 | 新增/改 | 职责 | 行数预算 |
|---|---|---|---|
| `src/client/composer/wewrite-button.tsx` | 新增 | `conversation.input.right` 席位：pen-line 图标按钮，点击开写作台浮层（InputZone 快照只读，不自订阅——S8 纪律） | ~70 |
| `src/host/agent-tools/commands.ts` | 新增 | `ctx.commands.register('wewrite')`：handler 解析 `/wewrite [topic]`→startRun，返回 runId（handler 不进模型，S9）；recordInput true | ~100 |
| `src/client/composer/commandview-wewrite.tsx` | 新增 | `conversation.chat.commandview` keyed `wewrite`：命令行卡片，复用 run-detail-hook 展示进度 | ~120 |
| `src/client/composer/at-source.ts` | 新增 | `ctx.inputTriggers` 注册 `@` 源（name `wewrite-articles`）：candidates 走 article/list RPC（warm 预热）；codec.clipboardText=`@slug`、serialize=标题+摘要+正文前 N 字（模型可见引用，失败按 S11 阻塞发送而非静默） | ~180 |
| `src/client/composer/register-composer.ts` | 新增 | M3 装配（同 register-chat 模式） | ~80 |
| `src/client/index.tsx` | 改 | 追加 registerComposer 一行 | +3 |
| `package.json` | 改 | `dsh.client.inject` 增补 `@deepseek-ai/dsh-client-ui-commands`、`@deepseek-ai/dsh-client-ui-input-trigger`（informational 边，M3 才加） | +2 |

依赖方向不变：`client/chat|composer → lib/context + lib/rpc + shared`；`host/agent-tools → service + shared`。host 与 client 之间只有 shared 契约与 loopback RPC。

---

## 4. agent 工具面定义（M1 交付物）

### 4.1 注册形状：手构 `ToolDefinition` 结构体（不运行时依赖 dsh-tools）

决策：`@deepseek-ai/dsh-tools` 只进 devDependencies（类型 + `defineTool` 参考），运行时**手构结构体**——与既有 `platform.ts`「宿主类型与业务逻辑解耦、测试不打真 DSH」纪律一致，避免对宿主内部包的运行时依赖（esbuild external 面不扩大）。四工具共用的形状：

```ts
interface WewriteToolDefinition {  // platform.ts 扩展，结构兼容宿主 ToolDefinition
  readonly name: string;
  readonly description: string;                     // 发给模型的中文说明
  readonly parameters: Record<string, unknown>;     // ParameterSchemaSpec 风格：
                                                    // { topic: { type:'string', required:true, description } }
  readonly output: {
    readonly schema: Record<string, unknown>;       // object-root JsonSchemaNode
    render(args: unknown, value: unknown): { type:'text'; text:string }[];  // 模型面文本
    presentationMeta?(args: unknown, value: unknown): unknown;              // E2 meta
  };
  readonly timeoutMs?: number;
  execute(args: unknown, exec: { signal: AbortSignal; agent?: { session?: unknown; id: unknown } }): Promise<unknown>;
  presentCall?(args: unknown): ToolCallView | undefined;   // S2 词汇表
  presentResult?(args: unknown, result: { content: unknown[]; isError: boolean; meta?: unknown }): ToolResultView | undefined;
}
```

### 4.2 四工具规格

| 工具 | 参数 | execute 对接 service | timeoutMs | presentCall | presentResult | meta |
|---|---|---|---|---|---|---|
| `wewrite_run` | `topic`(必填)、`image_count`(0-10)、`theme?` | `startRun({trigger:'manual',params})` → `runCompletion(runId)`（abort: `exec.signal.addEventListener('abort')→cancelRun`） | 600000 | generic：title `正在写《topic》`，kind `execute`，rawInput `{topic,image_count}` | generic：title `《title》成稿`/`写作管线失败`；content=textBlocks(digest 或 error)；失败 isError 卡 | RunToolMeta（§2.3） |
| `wewrite_rewrite` | `text`(1-8000)、`instruction`(1-200)、`title?` | `rewriteText`（既有 45s AbortController 语义保留） | 60000 | generic：title `AI 改写选中段落`，kind `edit` | generic：title `改写完成（N→M 字）` 或失败卡 | RewriteToolMeta |
| `wewrite_push_draft` | `article_id`(必填) | `pushArticleDraft` | 120000 | generic：title `推送草稿箱：article_id`，kind `execute` | generic：成功 `已进草稿箱（mediaId 尾4位）`/失败带 describeRpcFailure 同源文案 | PushToolMeta |
| `wewrite_list_articles` | `limit?`(默认 10) | `listArticles` 轻投影 | 15000 | 不提供（默认 generic） | 不提供（raw 结果即列表文本） | 无 |

**不做 diff 卡（决策记录）**：S2 的 DiffCallView/FileDiff/FileLocation 语义绑定 workspace 文件与编辑器 follow-along；我们的文章不是 workspace 文件，`openFile` 会走空。硬套伪路径是跟平台语义打架（generated-code-failure-modes：不硬凹宿主契约）。成稿正文在通用卡 content 里给 digest，全文走「打开写作台」。写作台内的 diff 展示属并行线（AI改稿）职责。

**模型面文案（output.render）**：四工具 render 都返回简短 text block（run 给 runId+status+title+digest；rewrite 给改写全文——模型需要看到改写结果才能继续对话；push 给 ok/mediaId；list 给紧凑列表）。render 是纯函数，禁访问 service。

### 4.3 装配与降级（沿用既有骨架）

`registerAgentTools` 保留 `src/host/tools.ts` 的三段式：`ctx.agents?.roots?.()` 已有 agent 逐个 mount + `ctx.on('agent/created')` 后建 agent 补 mount + 全程 try/catch warn 降级。新增：`exec.signal` 转发（run 工具）；`enabled=false` 时零注册（既有语义，cordis.patch.yml 默认翻 true 后用户仍可关）。

### 4.4 推送审批（OD-1，Jerry 2026-08-20 拍板：wewrite_push_draft 走宿主审批面板）

**① 触发机制：不是 ToolDefinition 声明字段，是插件自注册 `tools/pre-execute` waterfall 监听器。** 宿主 `ToolDefinition` 全形状（dsh-tools `lib/types/index.d.ts:106-172`）没有审批声明字段；审批入口是 cordis Events 上的 waterfall 事件：

```ts
// <N>/dsh-tools/lib/types/index.d.ts:38
'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>;
// :417-427
type PreToolDecision = { kind: 'allow' } | { kind: 'deny'; reason: string } | { kind: 'ask'; reason?: string };
```

实现（`src/host/agent-tools/push-approval.ts`，注册进 host `apply`）：

```ts
export function armPushApproval(ctx: HostContext, service: WeWriteService): () => void {
  const stop = ctx.on('tools/pre-execute', (exec: { name: string; arguments: unknown }, next: () => unknown) => {
    if (exec.name !== 'wewrite_push_draft') return next();          // waterfall 纪律：他人调用必须透传
    const title = service.lookupArticleTitle(exec.arguments);        // 内存表同步查，compose 进 reason
    return Promise.resolve({ kind: 'ask', reason: `即将把《${title}》推送到微信公众号草稿箱（仅草稿，不群发）` });
  });
  return stop;  // disposer 交入口统一回收；armed 标志（stop 为函数且未抛错）导出给注册耦合（见 ②）
}
```

`ask` 的解析链（全部宿主侧，我们零额外代码）：注册表 `serviceAsk`（index.d.ts:784-794）opportunistic `ctx.get('approval')` → `ApprovalService`（服务名 `approval`，dsh-user-approval `lib/types/index.d.ts:13-14`）→ Web 端 `PendingApproval` 经 `conversation.composer` 链接管 composer 渲染审批面板（ui-conversation `contract/slots.d.ts:599-628`：面板显示 `toolName` + `reason`，用户答 `allowed-once`/`rejected`）→ `allowed-once` 才 dispatch 工具体，其余一律 deny。审计：`approval/asked`/`approval/decided` log-only 事件（dsh-user-approval index.d.ts:37-48）。注意 ：31-36 注释——异步闸必须观察 `exec.signal`（我们的 reason 组装是同步内存查，天然满足）；agent-less 执行同样降级为 deny（我们的工具是模型驱动，必有 agent，不受影响）。

**② 降级 = fail-closed（双层）**，见 §6 D14。宿主原生降级已是拒绝语义（"missing approval support turns `ask` into denial"，index.d.ts:30-31；serviceAsk "keeps the historical degrade to deny"，:785-787）——与 PRD「确认前零微信 API 调用」天然同向。但我们自己的监听器注册也可能失败（宿主改事件名/ctx.on 抛错），故加注册耦合双保险：**`armPushApproval` 未成功武装（stop 非函数或抛错）→ `wewrite_push_draft` 整个不注册**（其余三工具照常），模型侧看不到推送工具；且工具 execute 体内再查 armed 标志，false 即返回 isError「审批通道不可用，已拒绝推送」。两层任何一层生效，未确认的微信 API 调用在构造上不可达。

**③ 备选机制（一句话）**：pre-execute 通道不可用时，推送唯一路径回落写作台既有手动推送按钮（`wechat/pushDraft` RPC，逐次显式点击，本身即用户确认）。

---

## 5. ConversationNodeDefinition 状态机（M2）

### 5.1 状态机：`wewrite-deliverables`（client-only，deliverables 官方模式）

```
kind: 'wewrite-deliverables'      target: 省略（不发布 view node，只发布 TurnData——S6 官方同款）

match(event):
  event.type === 'tool/result'
  && event.data.message.name ∈ {wewrite_run, wewrite_push_draft}     ← 只认自己的工具
  → 解析 meta（JSON.parse 容错），meta.tool 存在才算数
  role='start'  id=`turn:${turn 的 articleId 集合}` …实际实现：
    id = articleId（run 产出或 push 目标）；run 的 articleId 缺失（失败）→ 不 match
  role='update' 同 articleId 的后续事件（push 覆盖状态）

start(context, match):  { articles: [{articleId, title, digest, runId, state: 'drafted'}] }
update(context, match): state 转移矩阵 ↓
buildLocationData:      ConversationTurnDataMap 合并键 'wewrite'
                        → { articles: [...] }（发布到 Turn.data，turnTail 行消费）

文章状态机（卡片 chip 即此状态）：
  drafting（run 工具 running——由 toolview 卡承载，turnTail 只在 turn 完成后渲染，不进此状态）
    → drafted     （tool/result ok，gates 过，article 落库）
    → failed      （run 失败——产物行显示失败占位或不显示，取 failed 不入列表，理由：产物行只列产出）
  drafted → pushed（wewrite_push_draft ok）
  drafted → draft-failed（push 失败，保留 drafted + 可重试提示）
```

选择器 `selectWewriteArticles(owner: TurnTailOwnerProps): Article[] | null`：读 `owner.turn.data.get('wewrite')`，空 → null（decline-before-mount，turnTail 渲染零成本）；非空 → 传给 DeliverablesRow。

### 5.2 时间线内运行态卡：toolview（非 ConversationNodeDefinition）

运行中的管线进度在**工具行**呈现（`tool.call.toolview` keyed `wewrite_run`），不另做 chat node——同一个 tool/call 事件若同时被我们的 Definition 和官方 `tool-call` Definition 匹配会渲染两行。规则：**timeline 卡 = 官方工具行升级（toolview）；turn 末产物 = 自有 Definition（turnTail）**，两者职责互斥（S4/S6/S7）。

- running：block（RunningToolCall）解析 argsRaw 得 runId → useRunDetail 轮询 → 六步进度；断连/RPC 失败 → 降级显示「运行中（详情见写作台）」，终不炸。
- settled：block（ToolResultNode）直接读 `meta`（§2.3 schema 安全解析，schema 不符→按 resultView 文本兜底）→ 成稿卡 + 动作按钮。
- 回放：settled 形态即回放形态（callView/resultView/meta 全部持久化，S3），零额外逻辑。

### 5.3 卡片点击 → 打开写作台浮层并定位（M2 联动机制）

复用既有 overlay 桥（index.tsx:27-48 模块级事件桥），扩展为带 intent：

1. 卡片按钮 `onClick` → `openOverlayWithArticle(articleId)`（overlay-bridge.ts：`setOverlayOpen(true)` + `overlayIntent = {articleId}`，广播 listeners）。
2. `shell.overlay` 渲染的 WewriteOverlay（既有）打开；`WewriteApp` 挂载的 `useEffect` 里 `consumeOverlayIntent()` → `navigate({ kind:'article', id })`（既有纯状态路由，router.ts）→ 消费后清空（一次性，防重复跳转）。
3. 无 intent 时行为与现状完全一致（侧栏入口、tab 入口不受影响）。
4. 降级：overlay 槽注册失败的环境（三路 try/catch 之一失败）卡片按钮隐藏（`overlayAvailable` 由桥暴露）。

---

## 6. 降级矩阵（每个 seam 宿主不支持/变化时）+ 版本 pin

| # | Seam（期） | 探测方式 | 降级行为 | 用户感知 |
|---|---|---|---|---|
| D1 | `ctx.tools.register`（M1） | 装配 try/catch（既有骨架） | 工具不注册，warn 日志 | 对话里模型无 wewrite 工具；写作台全功能不受影响 |
| D2 | `output.schema` 校验失败/宿主改 output 契约（M1） | execute 后宿主抛 ToolOutputError → catch 返回 isError 结果 | 该次工具调用失败卡 | 对话内失败可见，管线本体（service）已照常完成，写作台可查 |
| D3 | `tool.call.toolview` 槽缺失（M2） | register-chat try/catch | 不注册 → 官方通用工具行 + **presentCall/presentResult 声明式卡仍然生效**（host 计算 callView/resultView 随 wire 下发，S3） | 卡片朴素但信息完整——声明式卡是回放与降级的统一兜底 |
| D4 | `ctx.conversationEvents` 缺失（M2） | register 前 `ctx.get` 探测 | 无产物行；toolview 卡不受影响 | 少一行产物汇总 |
| D5 | `conversation.chat.turnTail` 槽缺失（M2） | register try/catch | 产物行缺席 | 同上 |
| D6 | `run/detail` RPC 失败（M2） | run-detail-hook catch | 卡片保留末次快照/首帧，显示「详情见写作台」 | 进度不刷新，终态仍由 tool/result 驱动 |
| D7 | `conversation.input.right` 缺失（M3） | register try/catch | 无按钮；`/wewrite` 命令仍可用 | 入口少一个 |
| D8 | `ctx.commands.register` 缺失（M3） | try/catch warn | 无 slash 命令；input.right 按钮仍可用 | 同上 |
| D9 | `ctx.commandUi` 缺失（M3） | `ctx.get` 探测 | 无 popupSelect 菜单装饰 | 裸命令仍可手输 |
| D10 | `ctx.inputTriggers` 缺失（M3） | `ctx.get` 探测 | 无 `@` 源；手输文字仍可 | 补全缺，功能可用 |
| D11 | `exec.agent`/`session` 缺失（M1） | execute 内可选链 | 工具不依赖 agent 状态（设计上 execute 只用 service+signal），天然免疫 | 无 |
| D12 | 宿主升级改 render intent 词汇表（S2 枚举增删）（跨期） | presentCall/presentResult 返回后宿主桥接 | 我们只用 `generic` 卡 + text content，词汇表最稳定子集 | 无 |
| D13 | SessionEventMap 合并路径 | **不使用**（勘误 1） | — | — |
| D14 | `tools/pre-execute` ask 裁决（M1，OD-1） | `armPushApproval` 注册 try/catch + execute 体内 armed 复查 | **fail-closed 双层**：①宿主侧无 ApprovalService/agent-less → ask 原生降级为 deny（宿主语义，index.d.ts:30-31/:785-787）；②我方监听器未武装 → `wewrite_push_draft` 不注册 + execute 兜底 isError 拒绝。未确认的微信 API 调用构造上不可达；推送回落写作台手动按钮 | 模型看不到推送工具/收到拒绝理由；写作台手动推送不受影响 |

**版本 pin 策略**：

1. devDependencies 中 `@deepseek-ai/dsh-client-ui-primitives` 已 pin `^0.0.1-rc.1`；chat 线引入的类型参照包（`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-client-runtime` 等）**锁 `0.1.0-rc.7` 精确版**（与 `~/.dsh` 实装一致性优先，rc 期不用 `^`）。
2. README「已验证 DSH 版本」章节记录 `0.1.0-rc.7 @ 2026-08-20`；宿主升级 SOP：`npx @deepseek-ai/dsh web` 换新 → 重跑 §8 seam 探测用例（S 表逐条）+ `npm test` + e2e smoke。
3. `snapshot.capabilities.features` 追加 `'agentTools'`（M1）、`'chatCards'`（M2）——client 校验不认识的能力即提示升级插件（既有 §8.3 机制延伸）。

---

## 7. 与既有面的关系（不破坏 v0.2.x 的三条保证）

1. **loopback RPC 面不动**：22 端点原样；`run/detail` 是纯新增（RPC_ENDPOINTS 数组 append，contract.test.ts 的端点清单测试自动扩）。
2. **写作台三入口不动**：conversation.view / sidebar.footer.action / shell.overlay 注册逻辑原样；overlay 桥扩展向下兼容（无 intent 行为=现状）。
3. **管线引擎零改**：六步编排、AbortSignal、AC-4/AC-9 语义原样；engine 只加 `await done` 句柄（begin 时既有 promise 登记，无行为变化）。

---

## 8. 测试策略挂点（延续 vitest 14 文件 358 用例风格：host 纯单测 + service-harness 假件 + shared 契约钉死）

| 测试文件 | 层 | 覆盖（风险定向：压在本次改动的旧行为与新增契约上） |
|---|---|---|
| `tests/host/agent-tools.test.ts`（新，M1） | host 单测 | ① 四定义形状钉死（parameters/output/render 纯函数——同 args 同 value 同输出）；② execute 对 service-harness 假 service 的对接（startRun 参数透传、abort→cancelRun 转发、rewrite 45s 超时路径）；③ presentCall/presentResult 卡片断言（generic 卡字段、失败 isError）；④ 注册降级（ctx.agents 缺失/抛错→warn 不炸）；⑤ push-approval：非本插件工具名透传 next、ask reason 含标题、ctx.on 失败→push 工具不注册且 execute 兜底 isError（fail-closed 断言） |
| `tests/shared/agent-tool-contract.test.ts`（新，M1） | shared | RunToolMeta/Push/Rewrite schema：round-trip、strict 拒未知字段、**JSON.stringify→parse 等值**（E2 无损 JSON 硬约束，防 session 写入点抛错） |
| `tests/shared/contract.test.ts`（改） | shared | RPC_ENDPOINTS 增 `run/detail`；request/response schema 钉死 |
| `tests/host/pipeline-engine.test.ts`（改） | host | await done 句柄：begin→done resolve 顺序、cancel 后 done 仍 settle、runId 未知的 await 返回 undefined |
| `tests/client/chat-run-card.test.tsx`（新，M2） | client（@testing-library，若仓库尚无 React 测试基建则先落 RTL devDep——登记进 M2 开工清单） | 卡片三态：running（假 rpc 轮询断言→steps 渲染）、settled ok（meta→标题/动作）、settled schema 不符→resultView 文本兜底；按钮点击调 overlay 桥 |
| `tests/client/chat-deliverables.test.ts`（新，M2） | client 纯逻辑 | Definition 状态机：合成 tool/result 事件序列（drafted→pushed；push 失败保留 drafted；无 meta 不 match；他工具不 match）；selector 空→null |
| `tests/e2e`（改） | e2e | runner.mjs 增 chat-integration smoke case：宿主起后 dump 22+1 端点可达 + agentToolsEnabled 翻 true 后 `Tool.listTools` 可见 wewrite_run（沿用既有 hostctl/lib 会话脚手架） |

影响图（test-discipline §2）：本次改动波及的旧行为=① 工具注册面（原 dead code，测「新即旧」）② RPC 端点清单（契约测试自动扩）③ overlay 桥（原开合行为回归：无 intent 路径必须全绿）。管线/调度/微信面零波及——不加泛化测试。

---

## 9. 与并行线（AI改稿 / UI专业化，动 src/client UI）的冲突面评估

| 共享文件 | 本线改动 | 并行线预期改动 | 冲突等级 | 隔离手段 |
|---|---|---|---|---|
| `src/client/index.tsx` | M2：overlay 桥抽取（-50 行改 import）+ 追加 registerChat/registerComposer 各一行 | 低（他们动 UI 内部） | **高**（本线结构性编辑） | 本线的桥抽取**先落**（M2 第一个 PR，独立小 commit）；之后 index.tsx 只追加单行 import+调用，append-only 合并零冲突 |
| `src/client/store.tsx` / `App.tsx` | +18 行（consumeOverlayIntent） | 中（UI 重构大概率动） | 中 | intent 消费封装成 `useOverlayIntent(navigate)` hook 放 chat/ 目录，store/App 各 +3 行调用 |
| `src/client/lib/context.ts` | +45 行纯增量类型 | 低 | 低 | 只 append 新 interface，不动既有声明 |
| `src/client/styles/*` | 新增 chatcard.css | 高（他们重做样式体系） | 低（不同文件） | 命名空间 `ww-chatcard` 前缀隔离，token 只引用既有 --ww-* 变量名 |
| `src/client/components/*` / `panels/*` / `components/editor/*` | **不碰** | 他们的主战场 | 无 | 物理隔离：本线全部新代码住 `chat/`、`composer/` 新目录 |
| `src/host/*` | M1 重写工具面 | 无（他们在 client） | 无 | — |
| `src/shared/contract.ts` 等 | append 端点 | 低 | 低 | 端点数组 append；schema 新文件 agent-tool-contract.ts |

协调机制建议（给 Team Lead）：两条线约定「index.tsx 只许 append 装配行，结构性重构集中在各自 register-*.ts」；M2 的桥抽取 PR 提前打招呼；lint 的 import 边界（chat/ 不得 import components/editor/*）写进 eslint config 一行 restriction。

---

## 10. 决策记录（MADR 摘要；正式条目落 docs/decisions/）

**ADR-010 chat 载体 = 工具生命周期 + client Definition，不写插件 session 事件** — Accepted
Background：勘误 1 三条证据（known-set 生成性质 / assertEventsSupported 拒构 / append 无 ignorable API）。Decision：E1/E2/E3 三层（§2），deliverables 官方模式。Consequences：正向——回放安全、零宿主私有面、与工具面一期天然衔接；负向——调度/手动触发的 run 不进时间线（本就在写作台 ProgressCard 覆盖内，产品上可接受）；DSH 开放注册面后可平移（§2.4）。

**ADR-011 工具定义手构结构体，dsh-tools 仅 devDep** — Accepted
Decision：§4.1。Consequences：不扩大运行时宿主依赖面；代价是宿主契约变化靠 §6 pin + seam 测试兜。

**ADR-012 声明式卡为兜底、toolview 为增强** — Accepted
Decision：presentCall/presentResult 只用 generic+text（词汇表最稳子集）；富卡全部在 toolview。Consequences：任何宿主 UI 环境都有完整信息；不用 diff 卡的伪文件语义（负向=成稿无行内 diff，由「打开写作台」承接，写作台内 diff 属并行线）。

**ADR-013 运行态进度 = client 轮询而非事件推送** — Accepted
Background：无合法 session 事件通道（ADR-010），loopback RPC 既有。Decision：run/detail 3s 活跃轮询（对齐 App.tsx 既有节奏）。Consequences：实现简单、复用既有轮询范式；代价=秒级粒度（写作管线单步以十秒计，粒度足够）。

**ADR-014 推送确认 = 宿主审批面板（tools/pre-execute ask），fail-closed 双层** — Accepted（OD-1，Jerry 2026-08-20）
Background：PRD 硬约束「确认前零微信 API 调用」。Decision：插件自注册 `tools/pre-execute` waterfall 监听器对 `wewrite_push_draft` 返回 `ask`（§4.4，ToolDefinition 无审批声明字段，事件 seam 是唯一入口）；降级=宿主原生 ask→deny + 我方注册耦合（未武装不注册）双层 fail-closed。Consequences：正向——审批 UI/审计全由宿主承担、面板文案可带文章标题；负向——依赖 waterfall 事件名稳定（pin rc.7 + seam 测试兜底）。

---

## 11. 可行性结论与开工顺序

总裁决：**三期全部技术可行**，无不可行项。一期零 React、纯 host；二期两卡一行零宿主私有事件面；三期全是已核实的公开 seam（S8-S11）。风险最高点已前置消化（勘误 1/2 若未发现，会分别在「用户会话不可恢复」「启用即炸」两处暴雷）。

开工顺序：M1（agent-tools 重写 → run/detail → patch 翻 true → build+test）→ M2（桥抽取 PR 先行 → toolview 卡 → deliverables → 联动）→ M3（时间盒：input.right → /wewrite → @ 源）。每个 milestone 独立可交付、独立可回滚（feature 面各自独立降级，§6）。

## 参照清单（mvp-dev-team/references/01-standards/）

- `code-organization.md` — §3 文件级设计：分层依赖向下、单文件 ≤300 行、入口只装配、新功能新分包（chat/ composer/ agent-tools/）
- `spec-as-contract.md` — §2/§4 schema 与文件点名即契约：zod 钉死、版本 pin（§6）、范围外明说（§7 不动清单）、坑内嵌（勘误 1/2）
- `test-discipline.md` — §8 影响图先行、回归压旧共享行为（overlay 桥/端点清单）、不为覆盖率补泛化测试
- `generated-code-failure-modes.md` — §4.2 不硬凹宿主契约（diff 卡否决）、§6 全 seam try/catch 降级
- `open-decisions-register.md` — §2.4 session 事件路径登记解锁条件
