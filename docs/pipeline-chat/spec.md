# Spec — dsh-wewrite 对话深度结合（chat-integration）

> 生成日期：2026-08-20 ｜ 项目总监：Jarvis（mvp-dev-team 编排）
> 基于：PRD（docs/pipeline-chat/prd.md）+ 架构（docs/pipeline-chat/architecture.md，含勘误 1/2）+ UIUX（docs/pipeline-chat/uiux.md）
> 状态：**已确认**（Jerry 08-20 拍板：三期全量做；OD-1=宿主审批面板 pre-execute）
> 本文是开发与 QA 的唯一契约。与 PRD/架构冲突时：技术载体以 architecture.md 为准、验收语义以本文 §9 为准。

---

## 1. 产品定义

- **一句话**：把 dsh-wewrite 从「独立浮层写作台」改造成「对话是驾驶舱，写作台是精修车间」——在 DSH 对话框里说一句话，看着管线选题→大纲→成稿→过门禁→进草稿箱，全程卡片呈现，一键跳写作台精修。
- **目标用户**：已安装 dsh-wewrite 的 DSH 用户（技术型公众号号主）。
- **核心问题**：插件能力被锁在浮层里，agent 是瞎子（loopback RPC 绕过 agent），产物不可见，开源演示吃亏。

## 2. 范围（锁定——三期全量，Jerry 08-20 拍板）

| 里程碑 | 功能 | 验收摘要 | RICE |
|---|---|---|---|
| M1 | C1 工具默认启用+推送审批（pre-execute ask，fail-closed） | AC-M1-01~12 | 40.0 |
| M1 | C2 声明式工具卡（presentCall/presentResult，generic+text） | AC-M1-07~11 | 20.0 |
| M1 | C3 工具面扩充：wewrite_run 扩参 / wewrite_list_articles 新增 / wewrite_rewrite（对齐写作台既有改稿能力） | AC-M1-03~04 | 14.0 |
| M2 | C4 草稿即对话卡：toolview 运行卡 + turnTail 产物行（deliverables 官方模式，**零自定义 session 事件**） | AC-M2-01~08（载体修正版，§9） | 5.4 |
| M2 | C6 卡片点击→打开写作台并定位文章（overlay 桥扩展） | AC-M2-04 | 12.8 |
| M3 | C7 `/wewrite` slash 命令（host ctx.commands + commandview 卡） | AC-M3-01 | 6.0 |
| M3 | C8 composer「写作」按钮（conversation.input.right，**直开写作台，无菜单**——Spec 裁决，见 §13） | AC-M3-02（简化版） | 9.6 |
| M3 | C9 `@` 文章引用源（ctx.inputTriggers + ReferenceCodec） | AC-M3-03 | 1.3 |
| M3 | C10 选题交互 = 新增工具 `wewrite_suggest_topics`（热榜 top-N 带 AI 速览）+ agent 原生问答工具呈现候选（**Spec 裁决：不直接用 ctx.userQuestions，见 §13**） | AC-M3-04 | 5.3 |

## 3. 明确不做（Out-of-Scope，锁定）

PRD §6 全部 10 条照锁（并行线范围 / 不移除写作台 / 不群发 / 不 DOM 覆盖 / 不做对话内编辑器 / 定时不进对话 / 不回填旧会话 / 不拆管线分步 / 不做多账号 / 不做遥测）。Spec 级追加：

1. **不做插件自定义 session 事件**（勘误 1，写入会毁会话；解锁条件登记 OPEN-DECISIONS，architecture §2.4）。
2. **不做 diff 卡伪文件路径**（ADR-012：文章非 workspace 文件，不硬凹宿主 diff 语义）。
3. **不动 loopback RPC 既有 22 端点与写作台三入口**（architecture §7 三条保证）。

## 4. 技术架构（锁定 — 版本锚定）

| 层 | 技术 | 版本 | 锁定原因 |
|---|---|---|---|
| 宿主 | DSH（@deepseek-ai/dsh） | **0.1.0-rc.7 精确 pin**（类型参照包锁精确版不用 ^） | rc 期破坏性变更窗口 |
| 插件 client | React（peer，构建 external，**禁双实例**） | 宿主携带 React 18 | 坑#react-dual-instance |
| 插件 host | TypeScript + Cordis 静态插件 | 既有 | 不变 |
| 构建 | esbuild + tsc（lib/ committed，build 必跑） | 既有 | 不变 |
| 工具定义 | 手构结构体，dsh-tools 仅 devDep | ADR-011 | 不扩大运行时依赖面 |

关键决策：ADR-010（chat 载体=工具生命周期+client Definition）、ADR-011、ADR-012、ADR-013（运行态=3s 轮询）——全文见 architecture.md §10；**OD-1 定案：wewrite_push_draft 经 tools/pre-execute ask 裁决触发宿主审批面板，降级 fail-closed（实现细节以 architecture §4.4 补充节为准）**。

## 5. 契约清单（开发唯一依据，真源=architecture.md）

**工具面 5 个**（architecture §4.2 规格表 + 本 Spec 增补第 5 个）：

| 工具 | 参数 | 对接 service | timeoutMs | 卡片 |
|---|---|---|---|---|
| wewrite_run | topic(必填)/image_count(0-10,默认0)/theme? | startRun→runCompletion；abort→cancelRun | 600000 | generic |
| wewrite_rewrite | text(1-8000)/instruction(1-200)/title? | rewriteText（45s 语义保留） | 60000 | generic |
| wewrite_push_draft | article_id(必填) | pushArticleDraft；**执行前经 pre-execute ask 审批** | 120000 | generic |
| wewrite_list_articles | limit?(默认10) | listArticles 轻投影 | 15000 | 默认 |
| wewrite_suggest_topics（M3 新增） | count?(默认3,上限5) | hotspots 列表+digestHotspotItem 逐条速览 | 60000 | generic（来源+标题+速览摘要） |

**RPC 新增端点 1 个**：`run/detail`（request {runId} → response RunDetail=RunSummary+steps[]+topic；**信封 {ok,value}/{ok,error} + 通道前导斜杠**，坑#dsh-rpc-envelope）。

**E2 meta schema**：`src/shared/agent-tool-contract.ts`（zod，architecture §2.3 为真源；suggest_topics 补一条 SuggestTopicsMeta：{tool:'wewrite_suggest_topics', topics:[{title,source,digest}]}）。硬约束：meta 无损 JSON（stringify→parse 等值测试）。

## 6. 数据契约（E1/E2/E3 三层，无 DB 变更）

E1 进度=RunRecord.steps（engine 零改，仅加 await done 句柄）；E2 终局=tool result canonical+meta（known 事件，回放安全）；E3 Turn 聚合=client ConversationNodeDefinition `'wewrite-deliverables'`（match 自家 tool/result，状态机 drafted→pushed，decline-before-mount）。真源 architecture §2/§5。

## 7. UI 面清单（锁定）

| UI 面 | 槽位/机制 | 视觉真源 |
|---|---|---|
| 运行卡（六步进度→成稿卡） | tool.call.toolview keyed `wewrite_run` | uiux §1/§3 |
| 改写卡/推送卡 | toolview keyed `wewrite_rewrite`/`wewrite_push_draft` | uiux §1 |
| Turn 产物行 | conversation.chat.turnTail + Definition | uiux §1/§4 |
| 命令行卡 | conversation.chat.commandview keyed `wewrite` | 宿主 fallback 先行（uiux advisory） |
| composer 按钮 | conversation.input.right（28px pen-line，直开写作台） | uiux §5 |
| @ 引用源 | ctx.inputTriggers name `wewrite-articles`；serialize=标题+摘要+前N字；失败**阻塞发送不静默**（S11） | uiux §5 |
| 卡片↔写作台联动 | overlay-bridge 扩展 intent {articleId}；App 挂载 consumeOverlayIntent→navigate | uiux §4 |

**收敛规则（OD-2 定案）**：timeline 运行卡=toolview（工具行升级）；turn 末产物=turnTail 行；两者互斥不双份（architecture §5.2）。

## 8. Design Token（锁定）

追加 4 个 layout token：`--ww-chat-head-h:36px`、`--ww-stage-seg-w:20px`、`--ww-stage-track-h:4px`、`--ww-composer-entry-h:28px`。**零新增颜色**；token 作用域三域（.dsh-wewrite-panel / .ww-chat-node / .ww-composer-entry）单一定义。图标沿用 Icon.tsx（lucide 名），不新开库。

## 9. 验收标准（EARS，QA 测试唯一依据）

以 PRD §4 全部 EARS 为基线，以下**修正/裁决后版本为准**：

| 编号 | 修正后 EARS | 原因 |
|---|---|---|
| AC-M2-01 | When 管线经 agent 工具运行，then 进度经 RunRecord.steps + run/detail RPC 可被运行卡消费；终局投影持久化于 tool/result 的 canonical/meta（不写任何自定义 session 事件） | 勘误 1 |
| AC-M2-02 | When 时间线摄入 wewrite 工具事件，then the system shall 以 toolview 卡+turnTail 产物行呈现（同一 run 单一权威呈现，§7 收敛规则） | 勘误 1+OD-2 |
| AC-M2-03 | When 重新打开历史会话，then settled 卡按持久化 callView/resultView/meta 原样回放，不重复不丢卡 | 勘误 1 |
| AC-M2-05 | 并入 AC-M2-02（收敛规则定案后无独立验收面） | OD-2 定案 |
| AC-M2-07 | If meta 含未知字段或 schema 不符，then 卡片降级为 resultView 文本兜底，不破坏会话加载 | 勘误 1 |
| AC-M3-02 | Where composer 挂件存在，the system shall 在输入框右侧提供 28px 笔形按钮，点击**直接打开写作台浮层**（无菜单） | Spec 裁决（克制原则） |
| AC-M3-04 | When 用户请求选题建议，then agent 经 `wewrite_suggest_topics` 工具获热榜候选（含来源与速览）并以其原生问答能力呈现候选；用户选择后以所选主题进入管线 | Spec 裁决（工具承载，替代直接调 ctx.userQuestions） |

其余 EARS（AC-M1-01~12、AC-M2-04/06/08、AC-M3-01/03）按 PRD 原文执行。

## 10. 边界与约束

- 降级矩阵 D1-D14（architecture §6）全数实现；降级底线=写作台全功能不受影响。
- 性能：run/detail 3s 活跃轮询；卡片渲染不阻塞时间线；presenter 纯函数（live/replay 共用）。
- i18n：卡片文案 zh 为主 en 预留，走既有 locale ns（坑#dsh-slot-props-t：一律 bind 本插件 ns，忽略 props.t）。
- P0 视觉门禁三条（emoji/紫粉渐变/AI 模板味）机械化扫描必过（npm run check:p0）。
- 工程门禁：单文件 ≤300 行、入口零业务、npm install 一律 `--legacy-peer-deps`、build 后 lib/ committed。

## 11. 内嵌已知坑（pitfalls.jsonl 技术栈指纹交集 + 本线新坑）

| 坑 | 指纹 | 修法 |
|---|---|---|
| react 双实例炸宿主 slots | react/vite | peer 声明+构建 external（坑#4） |
| RPC 信封+前导斜杠 | dsh/rpc | run/detail 照抄 v0.1.4 信封（坑#10） |
| props.t 是 common 命名空间 | dsh/locale | 卡片 t 用本插件 ns（坑#11） |
| module 未定义 | dsh/esbuild | build.mjs 工厂壳 var module 声明（坑#9） |
| cordis patch **替换不深合并** | cordis | agentToolsEnabled 翻 true 后，存量显式 false 用户的保持语义必须实测验收（AC-M1-12）；patch 行 config 全量写（坑#3） |
| （本线新）插件自定义 session 事件毁会话 | dsh/session | 禁用；E1/E2/E3 三层载体（勘误 1） |
| （本线新）tools.ts 旧形状与 rc.7 契约不符 | dsh/tools | 按真契约重写，非翻开关（勘误 2） |
| e2e 视口毒化/toast 残留 | playwright/e2e | 沿用坑#13/17 修法（既有 runner 纪律） |

## 12. 端到端验证（总口径=PRD §10 九步；worktree 执行版）

1. `npm install --legacy-peer-deps` && `npm run lint && npm run typecheck && npm test && npm run check:p0 && npm run build` 全绿。
2. QA 测试套件（§architecture §8 七个测试文件）全绿，含 meta 无损 JSON、abort 转发、审批 fail-closed、replay 归并。
3. 冒烟（**独立 DSH profile，禁止碰 ~/.dsh/profiles/web**）：从 ~/Documents/projects/dsh-sandbox 起 `dsh web --profile <独立profile>`，走 PRD §10 第 2/3/5 步（对话直写→审批→发布卡→开关恢复）。
4. 回归：写作台三入口 + 既有 358 用例不退。

## 13. 变更记录

| 日期 | 变更 | 原因 | 影响 |
|---|---|---|---|
| 08-20 | Jerry 拍板三期全量（C9/C10 从选做转必做） | 范围确认 | M3 增 @ 源与 suggest_topics 工具 |
| 08-20 | OD-1 定案：pre-execute 宿主审批面板，降级 fail-closed | Jerry 拍板 | push 工具 execute 前置审批；补 D14 |
| 08-20 | M2 载体勘误：自定义 session 事件→E1/E2/E3 三层 | 架构师宿主核实（勘误 1） | AC-M2-01/02/03/05/07 重述 |
| 08-20 | AC-M3-02 简化为直开写作台（无菜单） | 设计裁决（克制+RICE C8 Effort） | composer 按钮实现面缩小 |
| 08-20 | C10 改工具承载（suggest_topics+agent 原生问答） | ctx.userQuestions 是插件侧接管 composer 的重机制，工具+原生问答更贴 agent 驾驶范式 | 新增第 5 工具 |
