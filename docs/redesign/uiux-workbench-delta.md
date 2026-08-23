# dsh-wewrite UI/UX 工作区 Delta 收口（v2 视觉系统 × 4 Tab 新 IA）

> 作者：颜好看（MVP 开发专家团设计师） | 日期：2026-08-19
> 输入：spec-v0.2 §0 总监裁决（4 Tab 工作区范式定稿）+ prd-layout-v2 §4.2（新 IA）+ uiux-redesign-v2（本人前作，视觉系统真源）
> 性质：**§1 DOM 契约是前端与 QA 的共同施工图，命名一经定稿不改**。本文不推翻 uiux-redesign-v2 任何结论，只做新 IA 下的 delta 映射；与 uiux-redesign-v2 冲突处以本文为准（源头是总监裁决）。
> 三轴刻度不变：Product 寄存器 Variance=3 / Motion=3 / Density=6。

---

## 1. DOM 契约（最优先——前后端 + QA 共同施工图）

### 1-0. 组件树总览

```
WewriteApp（.dsh-wewrite-panel.ww-root）
└── .ww-shell
    ├── TopBar（.ww-topbar，40px，4 导航对象 + 进度点 + 连接状态 + 齿轮）
    ├── main.ww-content（工作区路由下加修饰符 .ww-content--flush）
    │   └── WorkbenchPanel（.ww-workbench，route: home | article）
    │       ├── ArticleRail（.ww-rail，240px 可折叠）
    │       │   ├── .ww-rail__head（搜索框 + RailFilter）
    │       │   ├── .ww-rail__list（role=list）→ RailRow × N
    │       │   └── .ww-rail__foot → RailNewButton（+ 展开表单 .ww-rail-new）
    │       └── .ww-workbench__main（主区，二选一）
    │           ├── EditorPanel（有文章：head/编辑体/StatusStrip + GateOverlayPanel 挂载）
    │           └── StartupCard（零文章：.ww-startup）
    ├── ProgressCard（.ww-progress-card，右下角，生成中常驻）
    ├── GenerationLayer（首次提交短暂全屏确认 Modal，保留，z 高于卡）
    └── ToastHost（.ww-toasts）
```

退役：TopicPanel（输入卡转生 StartupCard + RailNewButton）、ArticlesPanel（表格转生 ArticleRail）、编辑器「返回列表」箭头（列表常驻左栏，语义消失）。

### 1-1. TopBar（4 对象版，40px）

| 项 | 契约 |
|---|---|
| 组件 | `TopBar`（由 PanelTabBar 改造；容器 class `ww-topbar`，替代 `ww-tabbar`——它不再是纯 Tab 条） |
| 结构 | `header.ww-topbar > nav.ww-topbar__nav(aria-label="WeWrite 导航") + .ww-topbar__spacer + ProgressDot + button.ww-topbar__conn + button.ww-topbar__settings` |
| 导航 Tab | `button.ww-tab`（沿用存量 class）× 3：写作 `pen-line` / 选题 `flame` / 定时 `calendar-clock`；激活态 `ww-tab--active` + `aria-current="page"`；icon 16px + gap 4 + 文字 14px |
| 高度 | 40px（`--ww-toolrow-h`）；底线 2px accent 激活语言与 hover 内缩圆角（radius-sm 顶角）原样继承 v2 §1a-1 |
| 设置齿轮 | `button.ww-topbar__settings`（icon-only 28px 热区，`settings` 图标）；`aria-label="设置"`；激活时 `aria-current="page"` + 同款底线 |
| 连接状态 | `ww-topbar__conn` 结构语义不变（StateDot + 文案 + message-circle 16px），点击进设置 |
| data-testid | `ww-topbar` / `ww-topbar-tab-home` / `ww-topbar-tab-hotspots` / `ww-topbar-tab-schedule` / `ww-topbar-settings` / `ww-topbar-conn` |
| role 语义 | 页面导航用 `nav` + `aria-current="page"`（不用 tablist——无 tabpanel 配对；与现状一致，QA 锚点不破） |

顶栏线框见 §2-4 图 W3。

### 1-2. WorkbenchPanel（写作工作区）

| 项 | 契约 |
|---|---|
| 组件 | `WorkbenchPanel`；容器 `section.ww-workbench`（`display:flex; width:100%; min-height:0`，占满 `.ww-content--flush`） |
| 渲染条件 | `route.kind === 'home' | 'article'`；两者都渲染本组件，区别仅在主区载入哪篇（见 §1-8） |
| 布局 | 左 `.ww-rail`（flex 固定宽）+ 右 `.ww-workbench__main`（`flex:1; min-width:0; display:flex; flex-direction:column`） |
| 主区选择 | 有文章 → EditorPanel（`home` = 最近编辑一篇；`article` = 指定 id）；零文章 → StartupCard |
| 底部兜底 | `.ww-workbench { padding-bottom: var(--ww-content-pad-bottom) }`（96px 宿主 composer 遮挡带，全局规则在工作区满铺态下的等价实现；v2 图中「░ 96px 兜底带」原样存在） |
| 窄态 <900px | `.ww-rail` 整体替换为顶部下拉选择器 `button.ww-rail-select`（当前文章标题 ellipsis + `chevron-down`，官方 Menu 实现）；编辑器单栏；下拉触发器位置 = 编辑器页头最左 |
| data-testid | `ww-workbench` / `ww-rail-select`（窄态） |

### 1-3. ArticleRail（左栏，240px 可折叠）

| 项 | 契约 |
|---|---|
| 组件 | `ArticleRail`；容器 `nav.ww-rail`（`aria-label="我的文章"`）；宽 240px（总裁决 240-280 带内取下限，密度 6 取紧）；背景 `--ww-bg-page`；右缘 `1px var(--ww-border)` |
| 结构 | `.ww-rail__head`（搜索 + 筛选）→ `ul.ww-rail__list`（`role="list"`，flex-1 滚动，行数阈值沿用 MAX_VISIBLE=200）→ `.ww-rail__foot`（新文章，sticky 底部） |
| 搜索 | `input.ww-rail__search`（`search` 图标 16px 前缀，placeholder「搜索标题 / slug」）；受控防抖沿用现文章库实现 |
| RailFilter | `.ww-rail__filter`（`role="group" aria-label="状态筛选"`）；单选 chip × 4：全部 `all` / 草稿 `draft` / 门禁未过 `gate-failed` / 已进草稿箱 `pushed`；激活 chip = `aria-pressed="true"` + `ww-rail-filter--on`（accent 文字 + accent-subtle 底）；不引入 radio 键盘契约 |
| RailRow | `li.ww-rail__row`（`role="listitem"`）> `button.ww-rail-btn`：`[StateDot 8px] [标题 13px ellipsis] [shield-alert 12px 门禁标记（仅未过行）]`；行高 **36px**（总裁决锁定，管理紧凑档）；当前文章行 `ww-rail-btn--active`（accent-subtle 底 + 左缘 2px accent 指示条——本屏两处 accent 之一）+ `aria-current="page"`；hover = `--ww-interactive-hover` 100ms |
| 门禁标记 | `.ww-rail-btn__gate`（`shield-alert` 12px `--ww-warn`）；点击行即载入该文并**自动展开 GateOverlayPanel**（AC-4 直达）；标记本身可点（stopPropagation，同效） |
| RailNewButton | `.ww-rail__foot` 内 `button.ww-rail__new`（`plus` 16px + 「新文章」，ghost 主按钮样式，全宽 36px）；点击展开 `.ww-rail-new` 表单：`input.ww-rail-new__input`（主题输入，Enter 提交）+ `button.ww-rail-new__submit`（「开始写作」accent CTA）+ `button.ww-rail-new__hotspots`（「从热榜挑」ghost → navigate hotspots）；`aria-expanded` / `aria-controls="ww-rail-new"`；空输入 CTA 不 disabled（点击聚焦输入框，v2 §3-01 原样） |
| 折叠 | `button.ww-rail__toggle`（`panel-left` 图标，icon-only 28px ghost）常驻**编辑器页头最左**（不在 rail 内——折叠后仍需可展开）；`aria-expanded` / `aria-controls="ww-rail"`；折叠态 `ww-rail--collapsed`（width 0 + 内容 opacity 0），状态持久化 `localStorage['ww.rail.collapsed']` |
| 空态 | 零文章时 rail 保留（搜索/筛选 disabled 置灰，列表区显示 mini EmptyState「还没有文章」+ 指向底部新文章按钮的箭头文案）；StartupCard 才是主舞台 |
| data-testid | `ww-rail` / `ww-rail-toggle` / `ww-rail-search` / `ww-rail-filter` / `ww-rail-filter-{all|draft|gate-failed|pushed}` / `ww-rail-row-{articleId}` / `ww-rail-new` / `ww-rail-new-input` / `ww-rail-new-submit` / `ww-rail-new-hotspots` |

### 1-4. StartupCard（L4 启动卡，零文章主区）

| 项 | 契约 |
|---|---|
| 组件 | `StartupCard`；`section.ww-startup`（`aria-label="开始写作"`），白卡 `--ww-surface` + 1px border + `--ww-shadow-card` + radius-lg 8px；宽 `min(560px, 100%)` 居中，垂直居中于灰底主区；内边距 `--ww-space-8` 32px |
| 主视觉 | `.ww-startup__glyph`（v2 §3-03 组合 glyph 原样：40px 圆容器 sunken 底 + 主 icon `pen-line` 20px + 右下叠 `sparkles` 12px） |
| 标题行 | 「开始你的第一篇文章」20px/500（text-xl）+ 副题「输入主题，管线接管成稿」14px secondary |
| 表单 | `input.ww-startup__input`（16px，高 40px，placeholder「输入主题，直接开写…」）+ `button.ww-startup__submit`（「开始写作 `arrow-right`」accent CTA md 36px）；Enter 提交；空输入不 disabled（点击/Enter 聚焦输入框） |
| 次级入口 | `button.ww-startup__alt`（ghost）：已配置 → 仅「去选题中心挑热榜」（`flame`）→ navigate hotspots；未配置凭据 → 追加卡底 helper 行「先配置公众号凭据」（`settings` 图标 + `--ww-warn` 小字链接）→ navigate settings；全新未配置用户可见路径 ≤2（AC 对齐 L4） |
| 提交后 | 就地转进度：首次提交短暂全屏确认（GenerationLayer 保留），用户收起后回工作区右下 ProgressCard 常驻；**不整页跳走** |
| 退位条件 | snapshot.articles.length ≥ 1 后不再默认渲染（新文章入口 = rail 底部按钮） |
| data-testid | `ww-startup` / `ww-startup-input` / `ww-startup-submit` / `ww-startup-alt-hotspots` / `ww-startup-alt-settings` |

线框见 §2-4 图 W2。

### 1-5. ProgressDot（顶栏进度点）+ ProgressCard（右下角卡）

**ProgressDot**

| 项 | 契约 |
|---|---|
| 组件 | `ProgressDot`；`button.ww-topbar__progress`（28px 热区，`loader-circle` 16px `--ww-accent` 静态无旋转 + 文字「生成中」13px） |
| 可见性 | 仅 `generation` 存在且 activeRun 为 `queued | running` 时渲染；终态（succeeded/failed/…）交 Toast（现状语义不变） |
| 语义 | `aria-label="生成任务运行中，查看进度"`；`aria-expanded` 绑定卡开合；`aria-controls="ww-progress-card"`；点击 = 展开/聚焦 ProgressCard；跨 Tab 常驻（AC-6） |
| 动效 | 无持续动画（Motion=3 纪律：禁装饰性循环动效；进度细节由卡承载） |
| data-testid | `ww-progress-dot` |

**ProgressCard**

| 项 | 契约 |
|---|---|
| 组件 | `ProgressCard`；`aside.ww-progress-card`（`role="region" aria-label="生成进度"`） |
| 位置 | 面板右下角：`position:absolute; right: var(--ww-space-6); bottom: calc(var(--ww-content-pad-bottom) + var(--ww-space-12))`（= 96 + 48 = 144px，抬高于 Toast 线 48px——与 `.ww-toasts`（bottom 96px）垂直错开零重叠，无 JS 耦合）；宽 320px；z-index `--ww-z-sticky` 1100（低于 Modal 1200 与 Toast 1300） |
| 结构 | 卡头（`loader-circle` + 主题 ellipsis 13px/500 + 收起钮 `ww-progress-card__collapse` x icon 20px ghost）→ 卡体（PipelineStepper 紧凑档复用，不新写）→ 卡脚（`重试` ghost（失败态）/ `取消生成` ghost-danger） |
| 样式 | `--ww-surface` + 1px `--ww-border-strong` + `--ww-shadow-overlay` + radius-lg 8px |
| 开合 | 收起 = 卡消失、ProgressDot 仍在（常驻锚点）；展开反向；store 语义：`setGenerationOverlay(false)`（转入后台）后本卡出现并常驻，替代 v0.1.4 的「只有 Toast」后台态 |
| data-testid | `ww-progress-card` / `ww-progress-card-collapse` / `ww-progress-card-cancel` |

首次提交短暂全屏确认：GenerationLayer（Modal）保留，用户主动收起/转后台后不再自动弹回。

### 1-6. GateOverlayPanel（门禁报告，右侧滑出覆盖面板）

| 项 | 契约 |
|---|---|
| 组件 | `GateOverlayPanel`；`div.ww-gate-overlay`（`role="dialog" aria-modal="false" aria-label="门禁报告"`） |
| 位置 | `.ww-workbench` 内右缘覆盖层：`position:absolute; inset: 0 0 0 auto; width: 360px`；`--ww-surface` 底 + 左缘 1px `--ww-border-strong` + `--ww-shadow-card`（blur 2px，守幽灵卡红线：1px 边框禁配 blur≥16 阴影）+ z-index 1100 |
| 入口（双） | ① StatusStrip 门禁 chip：`button.ww-statusstrip__gate`（`shield-alert`/`shield-check` 12px + 分数 mono + `chevron-up` 12px）；`aria-expanded` / `aria-controls="ww-gate-overlay"`；未过 = `--ww-warn`，过 = `--ww-success` ② 左栏门禁标记（§1-3，点击行直达并自动展开） |
| 面板头 | `[shield-alert/shield-check 16px] 门禁报告 68/100（mono） [关闭 button.ww-gate-overlay__close x 20px ghost]` |
| 面板体 | 复用现有 `GateReport`（`.ww-gate` 内容契约零改动：分数/rules 列表/定位/单项修复/全量修复）；「定位」仍切回编辑视图 |
| 关闭 | Esc / 关闭钮 / 切换文章 / 离开工作区路由；非模态——打开时编辑器仍可输入（总裁决：门禁是「检查报告」不是「编辑视图」） |
| data-testid | `ww-gate-chip` / `ww-gate-overlay` / `ww-gate-overlay-close` |

### 1-7. 三视图分段（编辑器视图模型重定义）

| 项 | 契约 |
|---|---|
| 结构 | `div.ww-view-tabs`（`role="tablist" aria-label="编辑器视图"`，沿用存量 class）> `button.ww-view-tab` × 3：仅编辑 `edit`（`file-pen`）/ 双栏 `split`（`columns-2`）/ 仅预览 `preview`（`eye`）；`role="tab"` + `aria-selected`（沿用现状，QA 锚点不破） |
| 退役 | 原 `gate` 视图 Tab 退役（门禁去 §1-6 面板） |
| 默认值 | 宽态默认 `split`（工作区范式空间宣言：编辑+预览同屏）；窄态默认 `edit`；用户手选后持久化 `localStorage['ww.editor.view']`（窄态回落仅编辑） |
| 窄态 900-1200 | label 收 icon-only（容器查询优先，回退 store.narrow） |
| 分栏拖拽 | `split` 态分栏线可拖（`ww-splitter`，5px 热区 + `col-resize`）；拖拽无过渡（直接操纵）；双击复位；比例持久化 `localStorage['ww.editor.split']` |
| 预览缩放 | 档位 100/90/75%（视觉 transform 缩放，载荷字节不变，AC-7）；控件在预览栏 bar 右端 |
| data-testid | `ww-view-tab-edit` / `ww-view-tab-split` / `ww-view-tab-preview` |

编辑器页头（v2 §1b-4 单行化原样）增量：最左返回箭头 → 换 `ww-rail__toggle`（§1-3）；右上动作组 = `[视图分段] [⋯管理菜单（重命名/删除）] [推草稿箱 ▾ 主 CTA]`。文章级管理操作（原文章库表格的编辑/去修复/删除）收进 `⋯` 菜单（`ww-editor-head__menu`，data-testid `ww-article-menu`）。

### 1-8. navigate kind 语义表（只定义语义，实现归前端）

| kind | 变化 | 语义 |
|---|---|---|
| `home` | 语义重定义 | 写作工作区（默认 Tab）：rail + 主区；主区默认载入最近编辑一篇；零文章 → StartupCard |
| `article { id }` | 语义重定义 | 工作区聚焦态：主区载入指定文章，rail 高亮该行；深链/E2E 锚点保留（AC-2 的 ≤1 点击切换即 rail 行点击） |
| `articles` | **废弃** | navigate() 收到一律重写为 `home`（老书签兼容壳；代码内旧调用点全部清除） |
| `hotspots` / `schedule` / `settings` | 不变 | 页面骨架不动，吃 v2 视觉增量 |

非路由态（组件 state，不进 Route）：rail 折叠、新文章表单开合、三视图、门禁面板开合、进度卡开合。

### 1-9. 交互态表（动效契约）

| # | 交互 | 触发 | 动画 | 时长/缓动 | reduced-motion |
|---|---|---|---|---|---|
| 1 | 左栏折叠/展开 | `ww-rail__toggle` | `width 240px↔0` + 内容 opacity；主区自适应 | 200ms `--ww-motion-base` / `--ww-ease` | 0ms 直切（布局位移类动效全关，既有全局 media query 覆盖） |
| 2 | 进度卡进入/收起 | 首次后台化 / dot / 卡内收起钮 | `translateY(8px)` + opacity | 300ms `--ww-motion-slow` | 0ms |
| 3 | 门禁面板滑入/滑出 | gate chip / rail 标记 / Esc | `translateX(100%↔0)` | 300ms `--ww-motion-slow` | 0ms |
| 4 | 三视图切换 | `ww-view-tab` | 视图面板 opacity 交叉淡入（不动画布局尺寸） | 200ms `--ww-motion-base` | 0ms |
| 5 | 新文章表单展开 | `ww-rail__new` | 高度展开 + opacity（下拉展开同档） | 300ms `--ww-motion-slow` | 0ms |
| 6 | rail 行 hover/active | hover / 按下 | 背景 interactive-hover/active | 100ms `--ww-motion-fast` | — |
| 7 | 分栏拖拽 | 直接操纵 | 无过渡；松手无回弹 | 0ms | — |
| 8 | 启动卡出现 | 零文章载入 | 静态渲染，无装饰动效 | — | — |

注：#1 的 width 动画是刻意的空间连续性例外（一次性 200ms 布局动画，非持续重排）；其余全部 transform/opacity 合成层属性。全部 ≤300ms，零 >400ms，禁弹跳缓动。

---

## 2. 视觉规格映射（v2 → 新 IA）

### 2-1. 十六条反廉价清单逐条映射

| v2 条目 | 新 IA 处置 |
|---|---|
| 01 CTA enabled 策略 | **锚点迁移**：topic-panel.tsx 退役；规则原样落到 StartupCard 与 RailNewButton 展开表单（空输入不 disabled、点击聚焦、`starting` 才禁用） |
| 02 空状态 hero | **重写**：hero 语义由 StartupCard 整卡承接（零文章主区）；其余页 EmptyState--hero 居中版原样 |
| 03 空 glyph 容器化 | 原样适用；StartupCard 主视觉 = pen-line + sparkles 组合 glyph |
| 04 编辑器三行并两行 | 适用；增量 = 视图分段改三视图 + 最左换 rail toggle |
| 05 格式工具栏对比度 | 原样适用（编辑器本体不动） |
| 06 画布井化 + notch | 原样适用（主区白底例外下井的边界反而更清晰：井 #EBEEF2 vs 白 #FFFFFF + canvas 自带 border-strong + shadow-card） |
| 07 状态归一 StatusStrip | 适用 + 增量：StatusStrip 新增门禁 chip（GateOverlayPanel 唯一常驻入口） |
| 08 表格行高 44 | **锚点迁移**：文章库表格退役；44px 交互底线落到选题列表/设置可点行；左栏行 36px 为管理紧凑档（两档密度并存即 v2 密度对比原则的新表达） |
| 09 Toast 抬高 | 适用：`bottom: var(--ww-content-pad-bottom)` 96px（与进度卡 144px 垂直错开，见 §1-5） |
| 10 focus ring inherit | 原样适用（本 delta 全部新组件同守） |
| 11 Tab hover 底 | **微调**：4 对象 40px 顶栏；3 Tab hover 内缩圆角底原样；图标集 = pen-line/flame/calendar-clock + settings 齿轮 |
| 12 选题窄态横条 | 原样适用（选题页骨架不动） |
| 13 定时卡收纳 | 原样适用 |
| 14 设置激活 icon | 原样适用 |
| 15 白卡 hover 复合反馈 | 适用 + 新锚点：StartupCard 白卡同款 hover；rail 行是列表行语义（interactive-hover，不是卡片 hover） |
| 16 底部兜底 96px | 适用；工作区满铺态等价实现 = `.ww-workbench` padding-bottom 96px（§1-2） |

### 2-2. 六张线框处置

| v2 线框 | 处置 |
|---|---|
| 4.1 写作台 | **退役** → 图 W1 工作区 + 图 W2 启动卡替代（输入卡转生） |
| 4.2 选题中心 | 原样适用 |
| 4.3 文章库 | **退役**（表格转生左栏；管理操作进编辑器 ⋯ 菜单） |
| 4.4 编辑器 | **重绘**并入图 W1（三视图 + 门禁滑出 + 满铺主区） |
| 4.5 定时任务 | 原样适用 |
| 4.6 设置 | 原样适用 |

### 2-3. bg-page 在工作区的铺法（结论）

| 区域 | 底色 | 依据 |
|---|---|---|
| 左栏 ArticleRail | `--ww-bg-page`（light #F9FAFB / dark #1B1B1C，宿主 specific-sidebar-fill） | rail 是「导航家具」，与宿主侧栏同源同色——chrome 不抢内容的戏；右缘 1px `--ww-border` 分隔 |
| 主区-编辑器（有文章） | `--ww-bg` 白，满铺 | v2 §1a-2 白底例外**原样继承**：编辑器本身是整页工作台，写作面即纸面 |
| 主区-启动卡（零文章） | `--ww-bg-page` 灰底 + 白卡居中 | 灰底让空态仍是「工作台」而非「空页面」；StartupCard = 全屏唯一大卡（v2 容器语义） |
| 选题/定时/设置三页 | v2 原样：`.ww-content` bg-page + 白卡浮其上 | 不动 |
| TopBar | `--ww-bg` 白 + 底 border-strong | 白条浮灰台，层级即分（v2 语言原样） |

一句话：**bg-page 铺「一切非编辑器的工作台底」（左栏/空态主区/其余三页内容区），编辑器主区是白底例外**。工作区路由下 `.ww-content` 加修饰符 `ww-content--flush`（padding 归零、display:flex），左栏与主区各自管理内边距与滚动。

### 2-4. 新线框三张（W1 工作区叠加态 / W2 启动卡 / W3 顶栏）

图例：`▪` = lucide 图标位；`⋯` = ellipsis 菜单；`◐●○` = 状态点；`░` = 底色分区。宿主 chrome 不入图。

**图 W1 写作工作区（门禁面板开 + 生成中叠加态）**

```
┌──────────────────────────────────────────────────────────────────────┐
│ [▪pen-line 写作][▪flame 选题][▪calendar-clock 定时]  ◐生成中 ▪已连接 [▪settings]│ W3 顶栏 40px
├─────────┬────────────────────────────────────────────────────────────┤ bg 白+border-strong
│ ww-rail │ ww-workbench__main —— --ww-bg 白满铺（编辑器白底例外）        │
│ 240px   │ ┌──────────────────────────────────────────────────────┐   │
│ bg-page │ │ [▪panel-left]《DSH 插件开发指南（三）》◐草稿            │   │ head 48px nowrap
│ #F9FAFB │ │              [仅编辑|双栏|仅预览] [⋯] [推草稿箱 ▾]CTA  │   │ toggle+单行化
│ ┌─────┐ │ ├────────────────────────┬───────────────────────────┤   │
│ │▪search│ │ │ [▪B][▪I][▪H2][▪列表][▪引用]│ ▪微信预览    [主题▾][100%▾]│   │ toolbar 白底
│ └─────┘ │ ├────────────────────────┼───────────────────────────┤   │ bar 28px
│ [全部|草稿│ │ │                        │ ░ 井 --ww-canvas-well ░░░ │   │
│ |门禁未过│ │ │  Markdown 源码          │ ░ ┌─────────────────┐ ░ │   │ canvas 375px
│ |已进箱] │ │ │  CodeMirror 6           │ ░ │ ▬▬ (notch)      │ ░ │   │ 白+1px边+6px圆角
│ ─────── │ │ │  （白底）               │ ░ │ 真实排版产物     │ ░ │   │ +shadow-card
│ ● 开源…  │ │ │                        │ ░ │                 │ ░ │   │ ← 拖拽分栏线
│ ● 插件…  │ │ │                        │ ░ └─────────────────┘ ░ │   │
│ ◐ V4…▪← │ ├────────────────────────┴───────────────────────────┤   │
│ ● 微信…  │ │ 2,841 字·[▪shield 门禁 68 ▴chip]·图3/3·glm-4.7-flash│   │ statusstrip 36px
│ (36px行) │ │                                    已自动保存        │   │ chip=门禁面板入口
│ ─────── │ └──────────────────────────────────────────────────────┘   │
│ [+ 新文章]│            ┌──────────────────────────┐┌────────────────┐│
│  ↑aria-  │            │ ww-gate-overlay 360px     ││◐ 生成中《微信生…》││ progress-card
│  expanded│            │ ┌──────────────────────┐  ││  选题● 写作◐ 排版…││ 320px 右下
│ [输入主题│            │ │▪门禁报告 68/100    [x]│  ││  [收起][取消]   ││ bottom=96+48
│  开始写作│            │ ├──────────────────────┤  │└────────────────┘│ =144px z1100
│ ][从热榜挑]│           │ │（复用 ww-gate 报告体）│  │ 滑入 translateX  │ Toast 线 96px
│ ░96px░  │            │ │ 规则/定位/单项修复    │  │ 300ms，非模态    │ 之下错开
└─────────┴────────────┴──────────────────────────┘                   │
 ░░░░ .ww-workbench padding-bottom 96px 兜底带（宿主 composer 遮挡）░░░░ │
```

**图 W2 启动卡（零文章主区）**

```
├─────────┬────────────────────────────────────────────────┤
│ ww-rail │ ww-workbench__main —— --ww-bg-page 灰底          │
│ （搜索/ │                                                │
│  筛选    │          ┌──────────────────────────┐          │
│  置灰， │          │      ◌ glyph 40px 圆       │          │ pen-line+sparkles
│  列表区  │          │   开始你的第一篇文章 20/500  │          │
│  mini   │          │   输入主题，管线接管成稿 14  │          │
│  Empty）│          │  ┌────────────────────┐   │          │
│          │          │  │输入主题，直接开写…  │   │          │ 40px 输入框
│ [+ 新文章]│          │  └────────────────────┘   │          │
│          │          │  [开始写作 ▪→]  [去选题中心挑热榜]      │
│          │          │  （未配置时卡底 helper：先配置公众号凭据）│
│          │          └──────────────────────────┘          │
│          │   白卡 560px 居中：surface+1px边+shadow-card+8px │
└─────────┴────────────────────────────────────────────────┘
```

**图 W3 顶栏（4 对象，40px）**

```
┌────────────────────────────────────────────────────────────────────┐
│ [▪pen-line 写作] [▪flame 选题] [▪calendar-clock 定时] ··· ◐生成中 ▪已连接 [▪settings] │
│  ━━━━ 2px accent 底线（激活 tab，全栏唯一 accent 位）        进度点  连接    齿轮    │
└────────────────────────────────────────────────────────────────────┘
 40px = --ww-toolrow-h；icon 16 + gap 4 + 文字 14；hover 底 interactive-hover（内缩 radius-sm）；
 设置齿轮 icon-only 28px 热区 aria-label="设置"；进度点仅运行中渲染
```

---

## 3. Token 增量与 design-tokens.json

- 追加 5 个 token（spec-v0.2 §6 锁定）：`--ww-bg-page` / `--ww-canvas-well` / `--ww-shadow-card` / `--ww-toolrow-h` / `--ww-content-pad-bottom`，定义、宿主引用、light/dark 解析值照 uiux-redesign-v2 §2-2，已同步进 `docs/design/design-tokens.json`（本次交付）。
- 既有 token 零改名零改值；`bg-page` 与 `surface-sunken` 同源宿主 primitive（specific-sidebar-fill）、`canvas-well` 与 `code-bg` 同源（alias-markdown-inline-code）——**语义槽不同故分立**（页面底 vs 凹区、画布井 vs 等宽带），日后宿主换肤可各自分叉，不算重复。
- `src/client/styles/tokens.css` 的同步落值归前端施工（本 delta 不动 CSS 文件）。
- 非 token 布局常量（写死在组件 CSS，不进 token）：rail 宽 240px / rail 行高 36px / gate 面板宽 360px / 进度卡宽 320px。

---

## 4. P0 门禁自检（本文档产出预检）

| 检查 | 结果 |
|---|---|
| 零渐变定义 | 通过——本 delta 无任何 CSS 渐变（门禁面板/进度卡/启动卡均纯色 + 1px 边框 + 微影分层） |
| 紫粉四色（uiux-redesign-v2 §5 锁定的四枚 hex） | 通过——视觉规格与 token 增量零出现（本文仅以规则引用提及，不落任何组件值） |
| emoji 作功能图标（门禁同款三段 Unicode 范围） | 通过——全部图标为 lucide 语义名（pen-line/flame/calendar-clock/settings/panel-left/search/plus/shield-alert/shield-check/loader-circle/x/chevron-down/file-pen/columns-2/eye/arrow-right/sparkles），文档内无禁段字符 |
| 圆角 ≤8px | 通过——卡 8（radius-lg）、chip/输入 4（radius-sm）、画布 6（radius-md）、状态点 full（非矩形语义） |
| 动效三档 ≤400ms | 通过——100/200/300ms 三档，reduced-motion 全关，禁弹跳 |
| 硬编码颜色 | 通过——规格全部走 `--ww-*` 引用（light/dark 解析值仅出现于 token 核对表与线框标注，属文档注记非组件代码） |
| 每屏 accent ≤2 | 通过——工作区常态 = rail 选中行指示条 + 主 CTA；顶栏激活底线在非写作 Tab 页才出现，互斥不叠加 |

---

## 5. 继承「不改清单」（v2 §5 全量重申 + 本 delta 增补）

1. 宿主 token 挂载方式（`.dsh-wewrite-panel` 作用域 + `var(--dsw-*)` 引用 + 深色自动跟随 + 零裸 hex）。
2. lucide-react 唯一图标库 + `<Icon name>` 封装（16/20 两档、currentColor、1.75 描边）；本 delta 新增图标名全部存在性由前端按既有映射表核验。
3. Jerry 审美基线：浅底深内容、蓝色纯色平涂、工程编辑风、8px 圆角上限、44px 交互底线（左栏 36px 为管理档并列语言）、状态点语言。
4. 动效纪律与 reduced-motion 全关。
5. 四态基础件（SkeletonRow/SkeletonBlock/ErrorNote/Toast）结构不动；Toast 仅位置/锚点调整。
6. DESIGN.md §9 真实文案照抄；新增 UI 文案（「开始你的第一篇文章」等）已在本文档给出终稿。
7. RPC 契约与存储零改动（本 delta 纯视图层）。
8. **增补**：DOM 契约（§1）命名稳定性——`ww-rail*` / `ww-startup*` / `ww-progress-*` / `ww-gate-overlay` / `ww-workbench*` / `ww-topbar*` 一经前端落地即冻结，后续迭代改样式不改名；QA 用例锚点一律走 data-testid。
