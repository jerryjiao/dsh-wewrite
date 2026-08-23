# 对话深度结合 UI/UX 设计方向（pipeline-chat 线）

> 日期：2026-08-20 ｜ 设计师：颜好看（MVP 开发专家团）
> 输入：`docs/reviews/2026-08-20-dsh-wewrite-chat-integration-research.md`（方向已定，不翻案）+ `docs/DESIGN.md` v1.2.0 + `docs/design/design-tokens.json` v1.2.0 + `src/client/` 现有组件
> 地位：本文件是 pipeline-chat 功能线的**增量设计方向**，不是设计系统重写。`docs/DESIGN.md` 仍是全项目设计契约主文件（Master + Overrides 模式），本文只写「对话内卡片」这一新表面的差异与新增。
> 寄存器：Product（不变）。三轴刻度：Variance=3 / Motion=3 / Density=6（继承 DESIGN.md，对话表面额外加一条「访客纪律」，见 §0）。

---

## 0. 总原则：对话流是宿主的客厅，卡片是访客

1. **宿主语言优先**：卡片结构、折叠交互、行高节奏向 DSH 原生 chat 行（tool row / command row）看齐，不向写作台面板看齐。判据：Linear/Raycast 熟手扫过对话流时，wewrite 卡片应当被读成「一条业务消息」，而不是「一个塞进聊天的网页」。
2. **克制三不**：不整块彩色底（状态只经 StateDot + 文字标签 + 小面积语义元素传达）、不加阴影（chat 是平面流，阴影只属于浮层）、不用渐变（全项目零 gradient 构造保证延伸到 chat CSS）。
3. **机器味走等宽**：slug / run id / 分数 / 时间戳一律 `--ww-font-code` + CodeChip 语言——这是写作台已有的视觉签名，chat 卡片原样继承，是两个表面最强的血缘纽带。
4. **一 run 一卡**：一次管线运行对应一张随事件推进状态机的卡（运行中→大纲→成稿→门禁→已发布/失败），不是每个阶段炸出一张新卡。重试产生新 run = 新卡，旧卡沉为终态历史。这与宿主 replay 三路摄入按 (kind,id) 归并的机制天然对齐。
5. **写作台仍是重编辑的家**：卡片只做「状态可读 + 单击可达」，微信预览/排版门禁/封面裁剪永不进对话流。

---

## 1. 对话卡片设计（六状态）

### 1.0 卡片解剖（所有状态共用骨架）

```
+----------------------------------------------------------------------+
| [StateDot] 写作管线  《文章标题不折行省略》          3/6 · 初稿写作  v |
+----------------------------------------------------------------------+
|  (展开体：随状态变化，见下)                                            |
+----------------------------------------------------------------------+
|  (动作行：ghost 按钮，右对齐，仅需要动作的状态出现)                     |
+----------------------------------------------------------------------+
```

- **头行（永远存在，高 36px = `--ww-chat-head-h`，与写作台 rail 行高同语言）**：
  - 左：`StateDot`（宿主官方件，ongoing/done/warning/error 四态）——状态的第一载体；
  - 次左：卡片种类标签（12px `--ww-fg-tertiary`，如「写作管线」）；
  - 主：文章标题，`《》` 书名号包裹，14px `--ww-fg`，500 字重，超长省略 + title 提示；
  - 右：阶段位（running）/ 分数（gate）/ 时间戳（终态），等宽 `--ww-fg-tertiary`；
  - 最右：chevron-down/chevron-right（有展开体时），16px，热区扩到整行。
- **容器**：`--ww-surface` 底 + 1px `--ww-border` + `--ww-radius-lg` 8px 圆角，**无阴影**。与写作台卡片同配方（血缘），差异只有两条：不叠 `--ww-shadow-card`（chat 是平面流）、台面从 `--ww-bg-page`（蓝灰台面）换成宿主 chat 的 `--dsw-alias-bg-base`（卡片浮在宿主自己的底上）。hover 只变 `border-color: var(--ww-border-strong)`，不加发光。
- **头行即折叠态**：整卡可点（键盘 Enter/Space 可达，`role="button"` + `aria-expanded`），点击切换展开。

### 1.1 running（运行中）

信息层级：状态（进行中）> 当前阶段 > 主题 > 次要参数。

```
+----------------------------------------------------------------------+
| (ongoing) 写作管线  《从零搭建个人知识库的五个坑》     3/6 · 初稿写作  v |
| [####][####][####][ <-> ][    ][    ]   预计 3–5 分钟 · 模型 deepseek |
+----------------------------------------------------------------------+
```

- **展开体只有两行**：六段分轨 + 一行元信息。这是全状态里最「活」的卡，但总高预算 ≤ 72px。
- **六段分轨**：6 段 × 20px 宽 × 4px 高（`--ww-stage-seg-w` × `--ww-stage-track-h`），段间距 4px（`--ww-space-1`）。
  - 已完成段：`--ww-fg-secondary`（灰蓝实心，安静）；
  - 当前段：`--ww-accent`（全卡唯一 accent 位——注意力只给正在发生的事）；
  - 未开始段：`--ww-border`（空心感弱底）；
  - 失败段（转 failed 后回看）：`--ww-danger`。
  - 分轨永不单独达意：右侧必有「3/6 · 阶段名」文字（不以颜色为唯一载体）。
- 元信息行：预计耗时 + 模型名（等宽 CodeChip）。
- 无动作行（取消/重试在二期由事件族支持后进动作行；一期 running 卡由 agent 工具卡承载，见 §2）。
- 阶段名沿用 `PipelineStepper` 的六步：选题分析 / 研究与提纲 / 初稿写作 / 质量门禁 / 排版转换 / 配图生成。

### 1.2 outline（大纲就绪）

信息层级：标题 > 章节结构 > 字数预算。

```
| (ongoing) 写作管线  《从零搭建个人知识库的五个坑》        大纲 · 5 节  v |
| -------------------------------------------------------------------- |
| 01  为什么多数人的知识库活不过三个月            预计 600 字        |
| 02  坑一：只收藏不加工                          预计 800 字        |
| 03  坑二：工具先行，问题缺席                    预计 800 字        |
| 04  坑三：分类系统过度设计                      预计 700 字        |
| 05  坑四和坑五：不复盘 / 不输出                 预计 900 字        |
+----------------------------------------------------------------------+
```

- 章节行：行高 32px，序号等宽两位（`01` `02`，`--ww-fg-caption`）+ 节标题（13px `--ww-fg`）+ 右侧预计字数（12px `--ww-fg-tertiary`）。
- 超过 8 节：列表内部滚动（max-height 256px），不撑高对话流。
- 每节行 hover `--ww-interactive-hover`，点击 = 打开写作台并定位到该节（联动见 §4）。
- StateDot 保持 ongoing（大纲是中间态，不是终态）。

### 1.3 draft（成稿）

信息层级：标题 > 摘要 > 机器元信息（字数/slug/门禁分）> 动作。

```
| (done) 写作管线  《从零搭建个人知识库的五个坑》   2,847 字 · 88/100 v |
| -------------------------------------------------------------------- |
| 收藏夹里躺着 200 篇「以后有用」的文章，真正被第二次打开的不超过 5%。   |
| 问题不在自律，在流程——这篇文章拆五个常见坑，每个给出一个当天就能…    |
| -------------------------------------------------------------------- |
| slug  personal-knowledge-pitfalls   门禁 88/100   模型 deepseek-chat |
|                                    [在写作台打开] [查看改动 diff]     |
+----------------------------------------------------------------------+
```

- 摘要两行截断（line-clamp 2），13px `--ww-fg-secondary`，行高 1.7——中文阅读材质，不是 UI 材质。
- 元信息行走等宽语言：slug、门禁分、模型名全部 CodeChip 风（`--ww-code-bg` 底）。
- 动作行：ghost 按钮 `square-pen` 图标「在写作台打开」+ ghost「查看改动 diff」（AI 改稿后出现，展开体内嵌官方 `DiffBlock` primitive 渲染）。
- StateDot 用 done（成稿本身是里程碑）；门禁未过时头行分数染 `--ww-warn` 文字色提示。

### 1.4 gate（门禁结果）

信息层级：判定 > 分数 > 未过规则 > 修复动作。

```
| (warning) 写作管线  《从零搭建个人知识库的五个坑》   门禁 72/100     v |
| -------------------------------------------------------------------- |
| 88 → 72  本轮降分                                                  |
| [!] 段落过长   ww-r-014   第 02 节 780 字超 600 上限                |
| [!] 禁用词命中 ww-r-003   「赋能」出现 2 次                          |
| [!] 标题党风险 ww-r-009   「五个坑」句式需人工确认                  |
| -------------------------------------------------------------------- |
|                                [AI 修这稿] [打开完整门禁报告]        |
+----------------------------------------------------------------------+
```

- 头行 StateDot warning + 分数（等宽）。展开体首行给趋势（`88 → 72`，等宽；首轮无前值则省略）。
- 规则行：`triangle-alert` 16px（`--ww-warn`）+ 规则中文名（13px `--ww-fg`）+ 等宽规则 ID（CodeChip，`--ww-fg-caption`）+ 定位摘要（12px `--ww-fg-secondary`）。
- 通过态（gate passed）：整卡退化为 1.6 published 前的安静形态——头行 `(done) 门禁 88/100 通过`，展开体只有一行「已过 14 项 / 未过 0 项」，无动作行。门禁通过不庆祝，绿色只留给发布终态。
- 「AI 修这稿」是全卡唯一可用 accent 文字的按钮（`wand-sparkles` 图标 + outline 变体）——门禁未过是唯一「卡片必须催促行动」的状态，允许这一处强调；同屏多张 gate-failed 卡时每卡仍只 1 处。

### 1.5 published（已发布/已进草稿箱）

信息层级：终态事实 > 时间 > 去处。**最安静的卡**。

```
+----------------------------------------------------------------------+
| (done) 写作管线  《从零搭建个人知识库的五个坑》   草稿箱 08-20 14:32  |
+----------------------------------------------------------------------+
```

- 默认无展开体、无 chevron、无动作行——进草稿箱是既成事实，卡片退化为一条带边框的消息行（36px）。
- hover 显露动作：头行右侧淡入 ghost 图标钮 `square-pen`（aria-label「在写作台打开」），鼠标移开即隐。这是「终态卡不打扰、需要时可达」的折中。
- 「已发布」语义按现行发布纪律只有「已进草稿箱」（群发永远人工后台），卡片措辞禁「已群发/已发表」。

### 1.6 failed（失败）

信息层级：失败事实 > 失败阶段 > 原因分类 > 出路动作。

```
| (error) 写作管线  《从零搭建个人知识库的五个坑》      失败 · 配图     v |
| -------------------------------------------------------------------- |
| 图片供应商连续 3 次超时（freepik 上游 504）。前五阶段产物已保留。     |
| 出路：重试本阶段（沿用成稿）或去设置切换图片供应商。                  |
| err  WW-IMG-504-TIMEOUT                                             |
| -------------------------------------------------------------------- |
|                                          [重试本阶段] [打开设置]      |
+----------------------------------------------------------------------+
```

- StateDot error + 失败阶段名（不是干巴巴的「失败」——阶段名是最有用的定位信息）。
- 原因行 = 一句人话 + 一句出路（沿用 ErrorNote 的「分类 + 出路」纪律）；错误码走 CodeChip。
- 动作行：`rotate-ccw`「重试本阶段」ghost + 按错误类型给第二出路（设置/检查凭据）。
- 失败卡默认展开且**不自动收起**（需要人处理的卡不自我隐藏），直到用户手动收起或重试成功。

### 1.7 折叠策略（「默认收得多紧」的定量答案）

| 状态 | 默认 | 展开预算 |
|---|---|---|
| running | 展开（头行 + 分轨，≈72px） | 72px 封顶 |
| outline | 收起（36px）；事件落地瞬间展开，下一条用户消息后自动收起 | ≤320px（8 节内滚动） |
| draft | 收起（36px） | ≤320px（diff 展开另计，内部滚动） |
| gate 未过 | 展开（催行动） | ≤320px |
| gate 通过 | 收起（36px，一行） | ≈64px |
| published | 收起（36px，无展开体） | — |
| failed | 展开，不自动收 | ≤200px |

- **历史回放一律按上表默认态渲染**（replay 安全：默认态是状态的纯函数，不依赖本地记忆）；用户手动展开/收起是本地临时态，刷新即回默认。
- 对话流里同屏可见的 wewrite 卡超过 3 张时，非最新一张的卡全部强制收起（驾驶舱不堆尸体）。

---

## 2. 一期：工具卡片（presentCall/presentResult 声明式）设计策略

一期的渲染权在宿主：我们只返回 `ToolCallView` / `ToolResultView` 数据，卡是宿主画的。设计杠杆只剩三处——**title 文案、content 的 markdown 结构、diff 卡的语义借用**。策略：不伪造 UI，把字段限制当排版纪律用。

### 2.1 字段盘点与映射

| 工具 | presentCall | presentResult |
|---|---|---|
| `wewrite_run` | generic：`kind:'execute'`（长任务执行语义，宿主给执行类图标）；title `写作管线启动：《主题》`；rawInput `{ mode, llm, theme }`；content 一行 text block：`选题 → 大纲 → 成稿 → 门禁 → 排版 → 配图` | generic：title `管线完成：《主题》`；content markdown ≤6 行（见 2.2） |
| `wewrite_outline` | generic：`kind:'other'`；title `生成大纲：《主题》` | **diff 卡**：path `wewrite/articles/<slug>/outline.md`，oldText null / newText 大纲全文 |
| `wewrite_rewrite` | **diff 卡**（call 期）：path `wewrite/articles/<slug>.md`，oldText null（调用期无前像）/ newText 新文 | **diff 卡**（result 期）：同 path，oldText 旧版 / newText 新版——宿主渲染成上下文 hunk diff |
| `wewrite_push_draft` | generic：`kind:'other'`；title `推送草稿箱：《标题》` | generic：title `已进草稿箱`；content 3 行（见 2.2） |

### 2.2 content 的 markdown 排版纪律

宿主把 content 渲染成 markdown，所以我们用结构化短文补偿字段贫乏：

- **run 完成卡**（6 行封顶）：
  ```
  《标题》 2,847 字 · 门禁 88/100 · 用时 4 分 12 秒
  - 成稿：`wewrite/articles/personal-knowledge-pitfalls.md`
  - 排版：主题「ink」已应用
  - 配图：1 张已嵌入（第 03 节）
  下一步：在写作台精修，或直接说「推草稿箱」。
  ```
- **push 完成卡**（3 行封顶）：
  ```
  《标题》已进入公众号草稿箱（08-20 14:32）
  - 媒体 ID `MEDIA_ID_xxx`
  - 群发仍需你在公众平台后台人工执行。
  ```
- 纪律：等宽反引号只包机器值（slug / 路径 / media_id / 分数）；不用 markdown 装假 UI（无 ASCII 框、无伪造按钮文字、不用 `- [x]` 勾选符——在部分渲染器里是字面文本，等于模板味）；每卡最后一句是真实下一步引导，不写空话。

### 2.3 虚拟路径与诚实原则

- diff 卡的 `path` 是展示标签：统一用 `wewrite/articles/<slug>.md` 虚拟命名空间，让文章在对话里获得「文件感」（与宿主 edit 工具同构，熟手零学习成本）。
- **`locations` 只在有真实落盘路径时填**。服务端若把文章 markdown 持久化在 workspace 下，就填真实路径（宿主 follow-along/点击打开直接可用）；没有就整体省略——宁可少一个能力，不做点了报错的假链接。

### 2.4 一期不做的事

- 不注册 `tool.call.toolview`（那已是一期半/二期手段）；不往 content 里塞进度百分比模拟（管线进度在聊天里的实时呈现是二期 chat node 的事，一期工具卡只表达「已启动/已完成」两个诚实快照）。

---

## 3. 二期：chat node 卡片完整视觉方案

### 3.1 与写作台 PanelChrome 的血缘关系

| 维度 | 写作台（面板） | chat 卡片 | 结论 |
|---|---|---|---|
| 台面 | `--ww-bg-page`（蓝灰 tint 台面） | 宿主 `bg-base`（不引入自己的底） | 卡片「住」宿主的地面 |
| 卡片底 | `--ww-surface` + 1px `--ww-border` | 同左 | **复用** |
| 圆角 | `--ww-radius-lg` 8px 上限 | 同左 | **复用** |
| 阴影 | `--ww-shadow-card` 微投影 | 无（chat 平面流） | 唯一减法 |
| 状态语言 | StateDot 四态 + 文字标签 | 同左 | **复用**（bits.tsx 的 StatusBadge 逻辑直接搬） |
| 机器味 | CodeChip 等宽带 | 同左 | **复用**（CodeChip 组件直接搬） |
| 图标 | Icon.tsx（lucide 16/20/12px） | 同左（二期是自由 React，直接 import） | **复用** |
| 字阶 | 14 基准 | 13/14 为主，chat 卡内不出现 16px 以上字号（分数用 2xl 24px 单点例外） | 收窄 |
| accent 限额 | 每屏 ≤2 | **每卡 ≤1**（running 的当前段 / gate 未过的修复钮，二选一） | 收紧 |
| 动效 | fast/base/slow 三档 | 同档，但 chat 卡新增动效仅两处：折叠展开（base）、当前阶段段的呼吸（fast，reduced-motion 关） | 收窄 |

### 3.2 Token 作用域扩展（实现层前置决策）

`--ww-*` 目前定义在 `.dsh-wewrite-panel` 作用域（tokens.css），而 chat node 渲染在宿主对话树里、面板容器之外。方案：**tokens.css 的作用域选择器扩为 `.dsh-wewrite-panel, .ww-chat-node, .ww-composer-entry`**——同一份定义、三个挂载域，单一真源不分裂。绝大多数 token 本就指向宿主全局 `--dsw-*`，在 chat 域同样解析成立；自有值 token（border 族/台面族）在新域由 dark 覆写块同规则生效。

### 3.3 组件构成（client 侧新增）

```
components/chat/
  WewriteRunNode.tsx      # conversation.chat.node keyed 渲染器（状态机总控，§1 骨架）
  RunStageTrack.tsx       # 六段分轨 + 文字位（§1.1）
  OutlineDigest.tsx       # 大纲节列表（§1.2）
  DraftDigest.tsx         # 摘要 + 元信息 + DiffBlock（§1.3）
  GateDigest.tsx          # 分数趋势 + 规则行（§1.4）
  ChatNodeActions.tsx     # ghost 动作行 + hover 显隐逻辑（§1.5）
styles/chat-node.css      # 挂 .ww-chat-node 作用域，全部 var(--ww-*)
```

- 复用不加改：`Icon`、`CodeChip`、`StateDot`（官方）、`DiffBlock`（官方）、`DisclosureRow`（官方，gate 通过折叠行）。
- 状态机：`ConversationNodeDefinition` 按 §1 七态映射事件族（run-start→running；outline→outline；article-updated→draft；gate-passed/gate-failed→gate；draft-pushed→published；run-failed→failed）。

### 3.4 交互细节

- 整卡 hover：`border-color` 变 `--ww-border-strong`；cursor 仅在「点击=开写作台」的卡（draft/gate/published/failed 终态）为 pointer，running/outline 卡点击=展开/收起（不打断正在跑的东西）。
- 键盘：头行是真按钮（Enter/Space 切换展开）；动作钮 Tab 序在头行之后；全部带 `--ww-focus-ring`。
- aria：头行 `aria-expanded` 指向展开体 id；StateDot aria-hidden 由相邻文字兜底；终态落地时头行文字进 `aria-live="polite"` 区域（沿用面板 GenerationLayer 的播报模式）。

---

## 4. 卡片 ↔ 写作台联动

### 4.1 正向：点击卡片 → 开浮层定位

- 走现有模块级事件桥（`src/client/index.tsx` 的 overlay 桥），payload 扩成结构化定位指令：
  `{ type: 'ww-open', articleId, focus?: { kind: 'gate-rule', ruleId } | { kind: 'section', heading } | { kind: 'diff' } }`
- 写作台侧路由到 `{ kind:'article', id }`（现有），focus 三种落点全部复用既有机制：gate-rule → 自动展开 GateOverlayPanel（rail 门禁标记的 AC-4 同款）；section → 编辑器滚动定位；diff → 打开改稿 diff 视图。
- 打开瞬间源卡片给一次**定位回执**：头行底色闪 `--ww-accent-subtle`（一次性 200ms class 切换，reduced-motion 下就是无动画的直接切换），告诉用户「就是这张卡对应的文章」。
- running 卡与 outline 卡不绑 ww-open（点击语义已占用为展开/收起）；其头行在管线进入 draft 态后自动获得点击打开能力。

### 4.2 反向：浮层里改完 → 卡片怎么同步

- **只走事件，不走指令**：浮层内的保存/门禁重跑/推送由 host 侧 service 发 `wewrite/article-updated` 等事件写入 session log，chat 卡片作为事件投影自然刷新（状态机按 (kind,id) 归并，replay 与 live 同源）。不在卡片上做「推送刷新」类命令式补丁。
- 状态回退可见：已到 draft 的文章在浮层里大改后门禁重跑降分，卡片头行分数与展开体趋势行（`88 → 72`）随事件更新——降分是必须被看见的事实，不静默。
- published 是单向终态：进草稿箱后浮层再编辑产生新版本记录，卡片保持 published 终态并更新时间戳行（`已进草稿箱 · v2`），不开倒车。

---

## 5. composer 入口 + /wewrite 命令

### 5.1 composer 入口按钮（`conversation.input.right`）

```
| ...宿主工具行 chrome...        [pen-line] [模型选择] [发送] |
                                  28px 图标钮
```

- 图标钮：`pen-line` 16px（与写作台 TopBar 写作 Tab 同图标——同一语义同一形），高度 28px（`--ww-composer-entry-h`，对齐宿主工具行控件档），默认 `--ww-fg-secondary`，hover `--ww-fg` + `--ww-interactive-hover` 底，focus 环同款。
- 点击 = 直接开写作台浮层（重编辑入口）；**不抢输入框焦点、不插入任何文本**。Tooltip（aria-label 同文）：「打开写作台」。
- 刻意不做菜单（新文章/最近文章的下拉）：composer 工具行是寸土寸金的常驻 chrome，一个图标一个确定性动作，比一个藏着三层的菜单诚实。新文章走 /wewrite 或对话直接说。

### 5.2 /wewrite 命令

- 命令菜单条目（宿主 `/` 菜单）：名称 `/wewrite`，描述「启动写作管线：选题/大纲/成稿/门禁，进度以卡片出现在对话里」，icon 位用 pen-line（若宿主命令源支持 icon 字段则填，不支持则裸文本，不强求）。
- 参数提示：`/wewrite <主题或指令>`；支持子语 `{话题}`、`选题`（进选题模式）、`改 <文章>`（进改稿）——描述文案里写清，输入框不做 ghost-text 劫持（三期再评估 inputTriggers ghost text，本期不做）。
- 时间线内呈现：一期用宿主 `conversation.chat.commandview` 的 fallback 通用卡（够用、零成本）；二期若注册自定义 commandview 行，形态 = 一行等宽命令原文（`/wewrite 个人知识库`）+ pen-line 16px + 右侧执行状态点——与 §1 头行同语言，高 36px。

### 5.3 @ 引用（三期预留）

引用 chip：`file-text` 12px + 文章标题（14px `--ww-fg`）+ slug（等宽 12px `--ww-fg-tertiary`），底 `--ww-accent-subtle`、1px `--ww-border`、胶囊圆角——与 rail 筛选 chip--on 同款语言。ReferenceCodec 序列化进模型，视觉上就是个「被引用的文件」。

---

## 6. design-tokens.json 新增 token（追加，不重写）

全部是 layout 维度增量，**零新增颜色**（chat 卡片复用现有 30 色），零新增阴影/动效值。同步动作：`meta.cssScope` 改为多作用域声明（§3.2），`meta.guarantees` 追加一条「chat 表面零阴影零渐变」。

```jsonc
{
  "layout": {
    // ---- pipeline-chat v0.3 追加（docs/pipeline-chat/uiux.md §6）----
    "chat-head-h":      { "value": "36px", "type": "dimension", "usage": "chat 卡片头行高（与 rail 行高同档，折叠态即此一行）" },
    "stage-seg-w":      { "value": "20px", "type": "dimension", "usage": "running 卡六段分轨单段宽" },
    "stage-track-h":    { "value": "4px",  "type": "dimension", "usage": "分轨段高（done=fg-secondary / current=accent / pending=border / failed=danger）" },
    "composer-entry-h": { "value": "28px", "type": "dimension", "usage": "composer 工具行入口钮高度（对齐宿主工具行控件档）" }
  }
}
```

meta 层两处追加（非 token）：

```jsonc
{
  "meta": {
    "cssScope": ".dsh-wewrite-panel（面板容器）；.ww-chat-node（对话流卡片）；.ww-composer-entry（composer 工具行控件）——tokens.css 单一定义三域生效",
    "guarantees": [
      "…既有条目不动…",
      "chat 表面（.ww-chat-node/.ww-composer-entry）零阴影、零渐变、每卡 accent ≤1 处（pipeline-chat uiux.md §3.1）"
    ]
  }
}
```

---

## 7. 反 AI 模板自检清单（本功能线专用）

| # | 检查项 | 本设计的对策 |
|---|---|---|
| 1 | emoji 扫描：chat 组件/文案零 emoji（正则 `[\x{1F300}-\x{1F9FF}]` 等） | 状态全走 StateDot + Icon.tsx（lucide）；本文档与后续组件 CSS 全域扫描零命中 |
| 2 | 零 linear-gradient（含 chat CSS、content markdown 里也不伪装渐变分隔） | 零 gradient token 构造保证延伸到 chat-node.css；stylelint 豁免域不扩大 |
| 3 | 紫粉四色不出现 | 无新增颜色，构造上不可能 |
| 4 | 无 Lorem ipsum / 「欢迎使用」/ 空洞占位 | §1/§2 所有文案是真中文实义句；空态复用 DESIGN.md §9 文案纪律 |
| 5 | 无 >1px 彩色侧边框卡（AI 左边框套路） | 状态由 StateDot + 头行文字承载，边框永远 1px 中性 |
| 6 | 无渐变文字 / 发光 / 毛玻璃 | 卡片平面语言；唯一动效是分轨当前段呼吸 + 折叠，reduced-motion 全关 |
| 7 | 不把面板 UI 硬塞对话（「访客纪律」） | 卡片总高预算表（§1.7）；同屏 >3 卡强制收非最新卡 |
| 8 | 不伪造可交互元素 | 一期 content 无假按钮；locations 无真实路径就不填 |
| 9 | 示例数据用有机真实值 | 文案示例「2,847 字」「88 → 72」「4 分 12 秒」，禁整数化虚构 |
| 10 | 图标统一 lucide 一套 | 新增表面沿用 Icon.tsx 映射表，禁止任何内联 SVG 旁路 |
| 11 | 状态不以颜色为唯一载体 | 分轨配「3/6 · 阶段名」文字；StateDot aria-hidden + 文字标签 |
| 12 | 对比度 | 头行 fg on surface ≈17:1；fg-tertiary 仅 ≥12px 非关键元信息（沿 DESIGN.md §8） |

---

## 参照清单（知识库引用）

1. `skills/mvp-dev-team/references/design-systems/design-commands.md` §1 寄存器判断——Product 寄存器标杆（赢得熟悉感 / Restrained 调色 / 150-250ms 状态动效）是「访客纪律」的依据。
2. `skills/mvp-dev-team/references/design-systems/token-standard.md`——四层 Token 体系与「Master 不整篇重写、只追加条目」纪律（§6 的追加式增量、本文档作为 DESIGN.md 的 Override 层）。
3. `skills/mvp-dev-team/references/industries/ai-native.md`——AI 产品「生成进度可见、失败给出路、结果可信」交互基线；其中「AI 标识渐变细线」建议被本项目零渐变构造保证**显式否决**（项目契约优先于行业基线）。
4. `skills/mvp-dev-team/agents/designer.md`——P0 三铁律、组件 9 态、状态覆盖 5 态、认知负荷（动作 ≤2/卡、同屏卡数上限）。
5. 项目内真源：`docs/DESIGN.md` v1.2.0（视觉契约）、`docs/design/design-tokens.json`（token 唯一真源）、`src/client/components/{Icon,bits,PipelineStepper,GateReport}.tsx`（复用组件事实）、`@deepseek-ai/dsh-tools/lib/types/presentation.d.ts`（一期声明式卡字段面）、`@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`（chat node / input 槽位契约）。

---

## RoleVerdict

```
verdict: pass
blocking: []
advisory: [
  {建议项: "locations 真实路径判定", 理由: "一期 diff 卡的虚拟路径 wewrite/articles/<slug>.md 依赖「服务端是否把文章落盘到 workspace」这一事实，施工前需由后端确认；无真实路径则按 §2.3 整体省略 locations"},
  {建议项: "commandview 自定义行降级顺序", 理由: "三期 /wewrite 时间线行先落宿主 fallback 通用卡，自定义行等二期 chat node 稳定后再注册，减少一次性 seam 面积（rc 版破坏性变更风险）"}
]
evidence: [
  {artifact_ref: "docs/pipeline-chat/uiux.md §1", line: 0, 说明: "六状态卡片信息层级 + ASCII 线框 + 定量折叠预算表"},
  {artifact_ref: "docs/pipeline-chat/uiux.md §2", line: 0, 说明: "一期声明式卡字段映射与 content markdown 排版纪律（含虚拟路径诚实原则）"},
  {artifact_ref: "docs/pipeline-chat/uiux.md §3", line: 0, 说明: "二期 chat node 视觉方案：与写作台 token 血缘表 + 作用域扩展决策"},
  {artifact_ref: "docs/pipeline-chat/uiux.md §4", line: 0, 说明: "卡片↔写作台双向联动（事件驱动同步，无命令式补丁）"},
  {artifact_ref: "docs/pipeline-chat/uiux.md §5-6", line: 0, 说明: "composer 入口/命令呈现 + 追加式 token 清单（零新增颜色）"},
  {artifact_ref: "docs/pipeline-chat/uiux.md §7", line: 0, 说明: "12 项反 AI 模板自检，P0 三条全过"}
]
```

P0 三条自检：1) emoji 扫描本文档及所设计文案零命中（状态图标全走 lucide Icon 映射）；2) 零渐变（无任何 linear-gradient 出现，紫粉四色不在任何值中）；3) 零模板味（无 Lorem/Welcome/占位空话，示例数据有机真实）。
