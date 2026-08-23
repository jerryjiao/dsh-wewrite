# dsh-wewrite 对话深度结合 PRD（chat-integration）

| 项 | 内容 |
|---|---|
| 产品 | dsh-wewrite — DSH 微信公众号 AI 写作插件，「对话深度结合」功能线 |
| 版本 | chat-integration PRD（里程碑 M1/M2/M3；发版号由总监在发版时定，预计并入 v0.4.x 序列） |
| 作者 | 许清楚（MVP 专家团 PM），2026-08-20 |
| 状态 | Draft → 待项目总监裁决 |
| 上游输入 | 调研报告 `workspace/docs/reviews/2026-08-20-dsh-wewrite-chat-integration-research.md`（技术通道已确证，方向 Jerry 已拍板「混合式」，本文不翻案）；`docs/prd.md`（v0.1 PRD，用户画像与产品价值观沿用不重述）；worktree `feat/chat-integration` 源码现状 |
| 下游 | 架构师（seam 落地/确认机制选型）、设计师（卡片视觉）、QA（EARS 验收基线） |
| 边界 | 既有项目加能力；「AI 改稿、UI 专业化」属并行开发线，与本线正交，**不在本 PRD 范围** |

---

## 1. 问题陈述

**谁**：已安装 dsh-wewrite 的 DSH 用户（技术型公众号号主为主，见 v0.1 PRD §2）。

**什么痛点**：插件的全部能力被锁在一个独立全屏「写作台」浮层里，与用户花时间最多的**对话流**完全割裂：

1. **入口断裂**：想出稿必须「点侧栏按钮 → 进浮层 → 找面板」，而用户 80% 的时间停在对话框。写作意图发生在对话里，执行却要跳出去。
2. **agent 是瞎子**：插件与对话的唯一通信是 loopback RPC 直达插件 service（`src/shared/contract.ts:35-36`，20 个端点），完全绕过 agent。用户对 DSH 说「写一篇 XX」，agent 不知道插件存在；生成内容直调 `ctx.llm.stream`，不进任何对话历史。
3. **产物不可见**：管线跑完，结果只在浮层里。对话里既看不到进度也看不到成稿，「我刚让它写的呢？」
4. **开源演示吃亏**：生态共识（约 9000 个插件仓库扫描，调研报告 §三）是独立浮层是最割裂的形态，最热的项目全把插件 UI 放进对话流。我们的核心卖点「一条命令装进 DSH」在演示里退化成「装了个弹窗」。

**为什么现在解决**：调研已确证 DSH 官方给齐了对话深度结合的全套一等公民通道（chat node / toolview / presentCall / composer 挂件 / slash 命令 / inputTriggers / userQuestions），且写作领域无人做过 chat 内嵌写作管线——空位明确，先发窗口在。

**Jerry 已拍板的方向（本文的一切判断服从它）**：**混合式**——对话框变成**驾驶舱**（选题/大纲/成稿/发布都以对话内卡片呈现与驱动），写作台保留为**精修车间**（微信预览/排版门禁/封面裁剪不可对话化）。不是「去掉写作台」，是「把 chat 变成主入口，写作台变成深加工位」。

---

## 2. 产品定位与差异化

### 2.1 定位宣言

> 在 DSH 对话框里说「写一篇 XX」，看着它选题、成稿、过门禁、进草稿箱——全程不离开对话。需要精修时，一张卡片跳进写作台，所见即所推。

公众号写作 = 轻生成（选题/大纲/改稿，chat 承载极佳）+ 重编辑（微信预览/排版门禁/封面，写作台不可替代）。产品形态据此分工：

| 职责 | 承载地 | 理由 |
|---|---|---|
| 意图发起（写什么） | 对话框 | 用户意图天然发生在这里 |
| 执行与进度（管线六步） | 对话内卡片 | 过程可见、可追问、可分享 |
| 结果确认（成稿摘要/门禁/发布） | 对话内卡片 | 产物停留在上下文里，形成「对话即工作日志」 |
| 精修（改稿/预览/排版/封面） | 写作台浮层 | 预览与推送产物字节一致、门禁报告、AI 选中改写——重编辑场景，对话流装不下 |
| 定时/批量运营 | 写作台运行历史 | 无人值守场景与对话流天然异步（M2 边界，见 §7/§10） |

### 2.2 生态格局基线（引自调研报告，不重述论证）

调研报告 §三确认七种「对话结合」实现模式（A 草稿即对话卡片 / B 工具结果富卡片 / C composer 书写视图 / D 面板+对话同屏 / E 内容注入 / F DOM 覆盖 / G chat 内交互表单），本 PRD 只采用官方正道：**A + B + 官方 composer/命令/补全通道**；明确拒绝 F（DOM 覆盖，维护成本公认高）。写作领域无现成 chat 内嵌写作管线插件（最接近的是 composer-expand / markdown-preview / open-app，均非管线）——**dsh-wewrite 做成后是 DSH 生态该品类第一个**。

### 2.3 差异化（用户为什么用对话版而不是去写作台点按钮）

1. **心智零迁移**：写作意图直接说出口，不用学任何面板导航——使用门槛从「学会一个工作台」降到「会说一句话」。
2. **过程与产物沉淀在会话里**：每篇稿子的出生记录留在对话流，天然的工作日志与复盘素材；历史会话回放可见（replay 安全由官方三路摄入机制背书）。
3. **agent 成为管线驾驶员**：DSH 的 agent 能力（追问、多轮修正、结合会话上下文）第一次接到写作管线上——「把上次那篇的观点换个角度重写」这类跨文章指令只有对话形态做得出来。
4. **演示即卖点**：一条连续录屏（说→卡→稿→草稿箱）比任何功能列表都有说服力，直接服务开源传播。

---

## 3. 用户旅程与用户故事

### 3.1 完整旅程：从「写一篇 XX」到发布（主线场景 A）

主角画像沿用 v0.1 PRD §2.1（技术型号主，本机已配好 DSH 模型与公众号凭据）。

1. **意图发起**：晚上九点，Rose 在 DSH 对话框顺手打：「写一篇讲 Cloudflare Workers 冷启动实测的公众号文，口语一点」。不开任何面板。
2. **执行可视**：agent 调用 `wewrite_run`，对话流出现**管线卡**——主题、六步管线（选题→大纲→成稿→门禁→渲染→配图）、运行中状态。Rose 继续聊别的或干等，对话不被阻塞。
3. **结果停留对话**：管线到终态，卡片更新为**成稿摘要**——标题、字数、门禁结论（通过/未过+分项）、配图数、文章标识。Rose 就地追问「门禁哪几项过了」，agent 基于工具返回作答。
4. **精修车间**：Rose 想改两段——M2 起点卡片上「在写作台打开」直达该文章；M1 期间卡片文案指引从侧栏入口进（功能等价，多一步）。写作台双栏编辑器里 AI 选中改写、微信预览过目（预览与推送产物字节一致），保存。
5. **发布确认**：回对话框说「推草稿箱」→ agent 调推送工具 → **确认提示**（文章标题+门禁状态）→ Rose 确认 → **发布卡**：mediaId、指引「公众平台后台 → 内容与互动 → 图文素材」。未过门禁的文章在确认环节呈现未过项，用户可显式覆盖（语义与写作台一致）。
6. **人工群发**：次日 Rose 在公众平台后台过目，人工点群发。**插件永不群发**（v0.1 产品价值观不变）。

### 3.2 分场景用户故事

**场景 A — 对话直写（M1 起可用）**
> As a 技术号主，I want 在对话框说一句话就看到管线跑完、成稿卡出现，so that 我不用中断对话去学一个工作台的导航。

**场景 B — 对话选热榜（M1 基础 / M3 增强）**
> As a 不知道写什么的号主，I want 在对话里说「从热榜给我挑个题写」，so that 选题从刷半小时手机变成一轮对话。M1：agent 用 run 工具的参数直接指定主题；M3：经 userQuestions 给 3 个候选（带来源与速览）让我点选。

**场景 C — 定时出稿（不进对话，维持现状）**
> As a 日更号主，我配好 RRULE 后早上一睁眼后台有稿——这个旅程保持「写作台运行历史 + 草稿箱」现状，M2 不把定时事件写进对话流（理由见 §7-O3）。

**场景 D — 跨文章指令（M2 起的进阶价值）**
> As a 复用素材的号主，I want 说「把我上周那篇 MCP 的文章推到草稿箱」或 `@` 引用某篇文章下达指令，so that 已有资产也能被对话驾驶舱调度。

---

## 4. 功能范围与验收标准（三期，EARS）

> 验收句式 EARS：「When [触发], the system shall [响应]」「While [状态]…」「If [非期望条件], then…」「Where [可选特性包含]…」。EARS 条目即 QA 验收基线。系统行为可验收；「模型必然调用某工具」不可验收，模型侧只验「工具可见、描述准确」（见各期首条）。

### M1 一期：工具卡片化（agent 驱动 + 声明式卡片，零自定义 React）

一期目标：对话里说「写一篇 XX」→ 看到管线卡与成稿卡 → 说「推草稿箱」→ 确认后发布卡。**agent 从瞎子变成驾驶员。**

**故事**：As a DSH 用户，I want agent 能代表我驱动写作管线并在对话里看到过程与结果，so that 写作成为对话的一部分而不是旁边的弹窗。

**范围**：
- Agent 工具默认启用（现状 `agentToolsEnabled: false` 翻转，`src/host/tools.ts` / `cordis.patch.yml:6`）
- 工具面：`wewrite_run`（扩参：主题/图数，参数语义与写作台一致）、`wewrite_push_draft`（恒需确认）、新增 `wewrite_list_articles`（轻量查询）
- 声明式工具卡片：`presentCall` / `presentResult`（generic 卡，纯函数，replay 安全）
- 推送安全确认机制（机制选型归架构师：DSH 工具审批 seam 或工具内确认语义，PRD 只锁产品语义）

**EARS**：

- **AC-M1-01** When 插件安装完成且用户未显式关闭 Agent 工具，then the system shall 在全部（含后续新建）agent 会话注册 `wewrite_run`、`wewrite_push_draft`、`wewrite_list_articles` 三个工具，工具描述准确传达用途、参数与「只进草稿箱不群发」的边界。
- **AC-M1-02** When 任一工具注册因宿主 API 缺失而失败，then the system shall 降级（console 警告 + 其余功能不受影响），不得导致插件整体失活或宿主报错。
- **AC-M1-03** When agent 调用 `wewrite_run` 且 topic 非空，then the system shall 启动管线并即时返回 runId；If topic 为空或 `image_count` 越界，then the system shall 返回结构化错误码（不抛异常、不启动管线）。Where `image_count` 缺省，the system shall 以 0 图推进（默认零图片成本）。
- **AC-M1-04** When agent 调用 `wewrite_list_articles`，then the system shall 返回文章轻量清单（id/标题/状态/门禁结论/更新时间），且不含任何凭据或脱敏前字段。
- **AC-M1-05** When agent 调用 `wewrite_push_draft`，then the system shall 先要求用户确认；**未经确认，不得发起任何微信 API 调用**。确认提示须含文章标题与门禁结论。
- **AC-M1-06** When 确认通过且文章已过门禁，then the system shall 推送草稿箱并在工具返回中给出 mediaId/thumbMediaId；If 文章未过门禁，then the system shall 呈现未过项，仅在用户于确认环节显式选择覆盖时执行推送（覆盖语义与写作台一致）。
- **AC-M1-07** When `wewrite_run` 被调用，then the system shall 在对话时间线渲染该工具的运行卡（主题、参数摘要、运行中状态），不得出现原始 JSON 裸块。
- **AC-M1-08** When 管线到达终态，then the system shall 将卡片更新为结果摘要——成功：标题/字数/门禁结论/配图数/文章标识 + 「在写作台查看」文字指引（M1 无跳转按钮，M2 升级）；失败：失败步骤 + 脱敏原因 + 可行动指引（如门禁未过→去写作台改稿重推）。
- **AC-M1-09** When `wewrite_push_draft` 完成或失败，then the system shall 渲染发布结果卡——成功：去向指引（公众平台后台→图文素材）+ mediaId；失败：分类错误与指引（含 errcode 40164 IP 白名单专项，同写作台诊断口径）。
- **AC-M1-10** While 管线运行中（卡片处于运行态），the system shall 不阻塞对话消息收发与时间线渲染。
- **AC-M1-11** If 会话被回放（历史加载/日志重放），then the system shall 以相同卡片形态呈现该次工具调用（presenter 为纯函数，流式与回放共用）。
- **AC-M1-12** When 用户在设置页关闭 Agent 工具总开关，then the system shall 停止向新建 agent 注册工具并回收已注册项；已显式关过的存量用户在版本升级后保持关闭（默认值翻转只影响新安装与从未修改过该设置的用户）。

### M2 二期：草稿即对话卡片（插件 UI 长进对话流，官方正道）

二期目标：管线状态变化以 **wewrite 事件族**写入会话流，client 注册 ConversationNodeDefinition 渲染**草稿状态卡**（大纲→成稿→门禁→发布状态机）；卡片可交互，一键跳写作台。从「工具的两态卡」升级为「全程活卡」。

**故事**：As a 号主，I want 每篇稿子在我的对话流里有一张随管线推进而生长的卡片，so that 我随时回来都能看到它走到了哪一步，并一键跳进精修车间。

**范围**：
- 事件族定义（`wewrite/run-start`、`wewrite/article-updated`、`wewrite/gate-passed`、`wewrite/draft-pushed` 等，host 侧管线各步写入 session log）
- client 注册 ConversationNodeDefinition + `conversation.chat.node` keyed 渲染器
- 卡片交互：点击打开写作台浮层并定位文章（复用现有 overlay 桥，`src/client/index.tsx:27-48`）
- 工具卡与事件卡的收敛（agent 触发路径不出现双份全量卡）

**EARS**：

- **AC-M2-01** When 管线任一步骤状态变化（开始/完成/失败），then the system shall 以 wewrite 事件族写入触发来源所在的会话事件流，事件负载含 runId、articleId 与步骤标识。
- **AC-M2-02** When 会话时间线摄入 wewrite 事件，then the system shall 以草稿状态卡渲染；同 runId 的后续事件归并更新同一张卡（状态机：大纲→成稿→门禁→发布），不重复开新卡。
- **AC-M2-03** When 用户重新打开历史会话，then the system shall 按事件流重建卡片至最终态（replay 三路摄入按 (kind,id) 归并），不重复、不丢卡、不破坏会话加载。
- **AC-M2-04** When 用户点击卡片主区或「在写作台打开」动作，then the system shall 打开写作台浮层并定位到该文章（编辑器载入该文）。
- **AC-M2-05** When 同一管线运行既有工具调用又有事件产生（agent 触发路径），then the system shall 在时间线呈现单一权威进度卡（工具触发行 + 事件状态卡不双份展示全量信息；收敛机制由架构师定）。
- **AC-M2-06** When 管线由调度器触发（定时），then the system shall 不向任何会话写入事件（运行历史照常完整记录）——本线 v1 边界。
- **AC-M2-07** If 事件负载含未知字段或版本不符，then the system shall 以 ignorable 降级渲染为通用卡，不破坏会话加载。
- **AC-M2-08** Where 卡片渲染存在，the system shall 遵守 P0 视觉门禁（图标统一 lucide-react——ADR-009 已锁；无紫粉渐变；空态/错误态给真实引导文案）。

### M3 三期：composer 与命令集成（时间盒选做）

三期目标：把入口做得更浅——`/` 命令直开管线、输入框挂件、`@` 引用已有文章、chat 内选题交互。

**故事**：As a 高频用户，I want 不用打完整句子也能触发写作（`/wewrite`、输入框按钮、`@` 一篇文章），so that 驾驶舱的操作成本趋近于零。

**EARS**（C7/C8 优先做，C9/C10 时间盒内选做）：

- **AC-M3-01**（C7）When 用户在输入框键入 `/`，then the system shall 在补全列表给出 `/wewrite`（描述与参数提示）；When 用户提交 `/wewrite <主题>`，then the system shall 以该主题启动管线，效果等效调用 `wewrite_run`。
- **AC-M3-02**（C8）Where composer 挂件存在，the system shall 在输入框右侧提供「写作」按钮（笔形 SVG 图标，lucide-react），点击展开快捷入口（新文章 / 最近文章 / 去选题中心）。
- **AC-M3-03**（C9，选做）When 用户键入 `@` 并选择一篇文章，then the system shall 将该文章引用序列化进输入（ReferenceCodec），agent 下一轮可感知所引文章。
- **AC-M3-04**（C10，选做）Where 用户在对话中请求选题建议，then the system shall 经 userQuestions 呈现候选选题（含来源与 AI 速览摘要），用户选择后以所选主题进入管线。

---

## 5. RICE 优先级排序

RICE 口径（对齐 v0.1 PRD §5）：Reach=受影响用户占比（1-10，DSH 用户几乎全部使用对话，对话线整体 reach 偏高）；Impact=单用户影响（0.25/0.5/1/2/3）；Confidence=确信度（100%=调研已确证 seam + 源码现状可直接落地；80%=有官方先例但本项目首次落地；50%=直觉）；Effort=人月（1=半天，10=3 个月+）。Score = R×I×C/E。

| ID | 功能 | R | I | C | E | Score | 里程碑 |
|---|---|---|---|---|---|---|---|
| C1 | Agent 工具默认启用 + 推送安全确认 | 10 | 2 | 100% | 0.5 | **40.0** | M1 |
| C2 | 声明式工具卡片（presentCall/presentResult） | 10 | 2 | 100% | 1 | **20.0** | M1 |
| C3 | 工具面扩充（`wewrite_list_articles`、run 参数对齐写作台） | 7 | 1 | 100% | 0.5 | **14.0** | M1 |
| C6 | 卡片交互：打开写作台并定位文章 | 8 | 2 | 80% | 1 | **12.8** | M2（依赖 C4） |
| C8 | composer「写作」挂件 | 6 | 1 | 80% | 0.5 | **9.6** | M3 |
| C7 | `/wewrite` slash 命令 | 6 | 1 | 100% | 1 | **6.0** | M3 |
| C4 | 草稿即对话卡片（事件族 + 状态机渲染，双端） | 9 | 3 | 80% | 4 | **5.4** | M2 |
| C10 | userQuestions 选题交互 | 5 | 2 | 80% | 1.5 | **5.3** | M3 选做 |
| C9 | `@` 文章引用（inputTriggers） | 4 | 1 | 50% | 1.5 | **1.3** | M3 选做 |

**排序说明**：
1. RICE 分数不等于实现顺序——C6（12.8）高于 C4（5.4）但强依赖 C4 的事件族与节点卡，归入 M2。
2. M1 三项（C1/C2/C3）是分数前三且互不依赖并行线，构成最小可演示闭环：「说→卡→确认→发布卡」。
3. C4 是本线产品形态的完全体（Impact 3，改变「插件 UI 在哪」的答案），Effort 最大（host 事件族 + client 节点渲染双端），单独占 M2。
4. M3 全部为入口浅化，时间盒执行：先 C7/C8，余下时间做 C10，C9 兜底（Confidence 50%，做完 C10 还有余量才碰）。

---

## 6. 明确不做（out of scope）

以下事项**本线不做**，写入以防镀金与范围蔓延（前 4 条为边界约束，其余为主动裁剪）：

1. **AI 改稿增强、编辑器/写作台 UI 专业化**——并行开发线范围，与本线正交。合并时共享文件（`src/client/index.tsx`、README、设置页）注意冲突协调（见 §10）。
2. **移除或降级写作台**——混合式已拍板；微信预览（与推送产物字节一致）、排版门禁、封面裁剪只能在写作台承载，永不全盘对话化。
3. **群发 freepublish**——v0.1 产品价值观不变（默认只到草稿箱、群发永远人工），对话路径不新增任何群发调用。
4. **DOM 覆盖 hack（模式 F）**——只走官方 seam；无 seam 的诉求进开放问题登记，不硬做。
5. **对话内富文本编辑器**——对话卡只读 + 动作（跳写作台）；精修车间职责不搬进对话。
6. **定时运行写入对话流**——M2 明确不把调度触发的事件写进任何会话（AC-M2-06）；运行历史承载。用户若强烈要求再评估（OD-3）。
7. **旧会话回填卡片**——事件族只对上线后的新运行生效，不为存量文章/历史 run 回填会话事件。
8. **管线分步对话化（先确认大纲再写正文）**——现有管线是原子六步，拆步是架构级改动且与「agent 驾驶」价值重叠；登记开放问题（OD-4），M3 后按用户反馈评估。
9. **数据回流 / 多公众号账号**——沿用 v0.1 PRD backlog，不因本线改变。
10. **默认遥测 / 卡片交互统计**——延续「无默认遥测」原则（v0.1 PRD §7），本线不新增任何上报通道；成功度量用公开信号与本地可选统计（§8）。

---

## 7. 非功能需求

| 类别 | 要求 | 优先级 |
|---|---|---|
| 安全-推送确认 | agent 路径的草稿推送恒需用户确认（AC-M1-05/06）；确认前零微信 API 调用 | P0 |
| 安全-默认值翻转披露 | Agent 工具默认开启涉及成本面（LLM token、可选图片费），README 与设置页须明示；存量显式关闭的用户不被翻转（AC-M1-12） | P0 |
| 安全-脱敏 | 工具返回、卡片内容、事件负载全链路沿用现有脱敏器（`src/host/redaction.ts`）：secret/access_token/API key 掩码，无明文 | P0 |
| 兼容-平台防御 | DSH v0.1.x 处于 breaking changes 窗口：所有新 seam 调用（slots/events/commands/inputTriggers）包 try/catch 降级（推广 `src/client/index.tsx` 现有三路 try/catch 模式），版本 pin rc.7、宿主升级后复核 | P0 |
| 可用性-降级 | 任一对话集成 seam 失效时，写作台全功能不受影响（对话线是增量，不是依赖项） | P0 |
| 性能 | 卡片渲染不阻塞时间线（AC-M1-10）；管线事件写入不拖慢管线本体（事件为旁路） | P1 |
| 视觉 | P0 视觉门禁三条：图标统一 lucide-react（ADR-009 已锁，不新开库）、禁紫→粉渐变（Indigo/Slate 纯色可用）、禁 AI 模板味文案（卡片空态/错误态给真实引导） | P0 |
| 回放完整性 | 声明式 presenter 纯函数；事件卡 replay 归并正确（AC-M1-11 / AC-M2-03/07） | P0 |
| 国际化 | 对话卡与命令文案中文为主，集中管理（对齐现有 i18n 结构），预留 en | P2 |
| 可访问性 | 卡片键盘可达 + 对比度基本合规 | P2 |

**数据埋点口径**：不做默认遥测（与 v0.1 PRD §7 一致，不重复立项）。事件命名若启用可选本地统计，沿用 `{对象}_{动作}`（如 `chat_card_opened`、`tool_push_confirmed`），只计数不带内容。

---

## 8. 成功指标（开源项目口径）

开源本地插件无遥测，度量以**公开信号 + 可复现走查**为主：

| 维度 | 指标 | 目标与量法 |
|---|---|---|
| 使用门槛降低 | 最短路径长度 | README 快速开始新增「对话直写」路径：装完 → 对话一句话 → 卡片出稿，**不经过写作台导航教学**。验收走查：新用户（或干净 profile 模拟）从安装到首篇 ≤ 5 分钟 |
| 使用门槛降低 | 交互成本对比 | 同一任务（出稿+进草稿箱）：对话路径点击/跳转次数 显著少于 写作台路径（走查记录，演示脚本固化） |
| 演示效果 | 演示资产 | 一条连续录屏（说→进度卡→成稿卡→确认→发布卡→公众号后台草稿截图）成为 README 首屏资产；发布后作为社区传播主物料 |
| 演示效果 | E2E 稳定性 | 演示脚本以 E2E 用例固化，关键链路 **pass³**（连续 3 次独立运行全绿，eval-driven-delivery 口径），杜绝「演示恰好能过」 |
| 差异化 | 生态卡位 | 保持「DSH 生态第一个 chat 内嵌写作管线插件」并兑现：awesome-dash-plugins 收录 PR 合并、README 对比段（对话驾驶舱 vs 独立浮层形态） |
| 差异化 | 公开信号 | 发版后 GitHub stars / release 下载量 / issue 中「对话路径」相关反馈占比环比正增长（代理指标，无遥测前提下的可得信号） |
| 信任底线 | 安全零事故 | 未确认推送发生次数 = 0（E2E 断言 + 发布后 issue 巡检）；无明文凭据进入卡片/日志（grep 验收） |

---

## 9. 风险与开放问题（停车场登记）

| # | 类别 | 事项 | 当前倾向 / 处置 |
|---|---|---|---|
| R1 | 平台风险 | DSH 0.1.0-rc 官方预告破坏性变更，对话线新用 seam 数量多于存量 | 全 seam try/catch 降级 + 版本 pin + 宿主升级复核清单（交架构师）；降级底线=写作台不受影响 |
| R2 | 采纳风险 | Agent 工具默认开：模型在无关对话里误调 `wewrite_run` 造成 token/图片开销 | 工具描述写清触发边界（仅明确写作意图时）；`image_count` 默认 0；设置页一键关；README 明示 |
| R3 | 协同风险 | 与并行线（AI 改稿/UI 专业化）共享 `src/client/index.tsx`、README、设置页 | 本线 M1 尽量只动 host 侧（tools.ts）+ 声明式 presenter（零 React），把 client 侧大改留到 M2 协调合并顺序 |
| OD-1 | design-decision-to-evaluate | 推送确认机制选型：DSH 工具审批 seam（tools/pre-execute）vs 工具内确认语义 vs userQuestions | 交架构师在 spec 阶段定；PRD 只锁产品语义（AC-M1-05/06） |
| OD-2 | design-decision-to-evaluate | M2 工具卡与事件卡的收敛呈现（AC-M2-05）具体机制 | 交架构师；产品底线是时间线单一权威卡 |
| OD-3 | existing-design-boundary | 定时运行不进对话流（AC-M2-06）——用户可能要求「早上定时稿在对话里可见」 | 先守边界；开始咬人（出现真实诉求 issue）再立设计 |
| OD-4 | design-decision-to-evaluate | 管线分步对话化（大纲确认 gate→成稿）——旅程中「先看大纲」是高频候选诉求 | M3 后按用户反馈评估；涉管线原子性，需架构师参与 |
| OD-5 | waiting-on-external-condition | DSH rc.7 之后的 seam 变更（chat.node/presenter 契约） | 版本兼容表机制承载，升级时复核 |

---

## 10. 端到端验证（规格收尾，验收总口径）

在干净 DSH profile 上执行并通过以下全程，才判定对应里程碑交付完成（每期各自跑一遍相适应的子集）：

1. `npx @deepseek-ai/dsh plugin --profile web add github:jerryjiao/dsh-wewrite#<tag>` 安装无 plain dependency 警告；起 `dsh web`。
2. 新建会话，输入「用 wewrite 写一篇关于 X 的文章」→ 时间线出现管线运行卡（主题/参数/运行中）→ 终态更新为成稿摘要卡（标题/字数/门禁/配图数）。（M1）
3. 继续对话「把它推进草稿箱」→ 出现确认（标题+门禁状态）→ 确认 → 发布卡（mediaId + 后台指引）；公众号后台「图文素材」出现新草稿。（M1）
4. **错误流**：a) 模拟 agent 直接调用推送工具（跳过用户确认）→ 断言零微信 API 调用发生；b) 配置错误代理 URL → 发布卡给出 IP 白名单/代理分类指引，无半成品草稿。（M1）
5. 关闭设置页 Agent 工具总开关 → 新会话中工具不可见；重开 → 恢复。（M1）
6. 打开历史会话 → 工具卡/事件卡以相同形态回放，不重复不丢卡；卡片点击打开写作台并定位该文章。（M1 回放项 / M2）
7. `@` 引用一篇文章下发指令 / `/wewrite 主题` 直开管线 / userQuestions 选候选题。（M3，选做项随做随验）
8. grep 全部新代码路径日志与卡片渲染输出：无明文 secret/access_token；视觉走查 P0 三条（无 emoji 功能图标、无紫粉渐变、无占位文案）。
9. 稳定性：第 2-3 步演示脚本以 E2E 固化并 **pass³**。

---

## 附：本 PRD 参照的纪律文档

（`skills/mvp-dev-team/references/01-standards/`）

1. **spec-as-contract.md** — 规格即契约：out-of-scope 显式成节（§6）、已知坑内嵌（DSH rc breaking / DOM 覆盖禁用 / replay 归并 / 单一席位槽位约束，§7/§9）、端到端验证收尾（§10）、活规格维护约定（实现与 PRD 冲突先改文档）。
2. **eval-driven-delivery.md** — 评测驱动交付：成功指标中的演示脚本 E2E 固化 + 关键链路 pass³ 口径（§8）、「轨迹合规」（未确认推送零发生）作为交付门。
3. **open-decisions-parking-lot-register.md** — 悬而未决登记册：§9 以类别（waiting-on-external-condition / design-decision-to-evaluate / existing-design-boundary）登记 5 条开放项，不留工作记忆。
4. （间接）**verifier-critic-pattern.md** — 验收只对照 EARS 与端到端步骤，评审不标风格偏好。

---

## RoleVerdict

```
verdict: pass
blocking: []
advisory: [
  {建议项: "推送确认机制（OD-1）应在架构 spec 阶段第一个定", 理由: "AC-M1-05/06 是本线唯一的安全硬约束，机制选型（审批 seam vs 工具内确认）影响 tools.ts 契约形状，晚定会返工 M1"},
  {建议项: "M1 落地顺序建议 C1→C3→C2", 理由: "先让工具面可用可测（纯 host 侧），presenter 卡片后置，规避与并行线在 client 侧的合并冲突（R3）"},
  {建议项: "C4 的 Effort(4人月) 是全线最大单点，建议架构师在 spec 里把它拆成 host 事件族与 client 渲染两个可独立验收的工作包", 理由: "双端可并行，且 host 事件族先行时 M1 卡片已有兜底呈现"}
]
evidence: [
  {artifact_ref: "/Users/mac/Documents/projects/dsh-wewrite-chat/docs/pipeline-chat/prd.md", line: 1, 说明: "本 PRD 全文（问题/旅程/三期 EARS/RICE/out-of-scope/成功指标/端到端验证）"},
  {artifact_ref: "/Users/mac/Documents/workspace/docs/reviews/2026-08-20-dsh-wewrite-chat-integration-research.md", line: 97, 说明: "三期框架与混合式定位的上游依据（Jerry 已拍板，本文细化未翻案）"},
  {artifact_ref: "/Users/mac/Documents/projects/dsh-wewrite-chat/src/host/tools.ts", line: 21, 说明: "现状工具面实证：仅 wewrite_run（fixed 主题）+ wewrite_push_draft，agentToolsEnabled 默认关，与 PRD 问题陈述一致"},
  {artifact_ref: "/Users/mac/Documents/projects/dsh-wewrite-chat/src/shared/contract.ts", line: 35, 说明: "loopback RPC 绕过 agent 的现状证据"},
  {artifact_ref: "/Users/mac/Documents/projects/dsh-wewrite-chat/docs/prd.md", line: 91, 说明: "v0.1 产品价值观（只进草稿箱/无默认遥测/P0 视觉门禁）沿用引用"}
]
```
