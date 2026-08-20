# dsh-wewrite UI/UX 打磨 v0.2.1 — 视觉规格（设计师交付）

> 作者：颜好看（MVP 开发专家团设计师） | 日期：2026-08-20
> 输入：uiux-polish-v0.2.1.md（总监 delta，P1–P6 + D1–D3）+ uiux-workbench-delta.md §1 DOM 契约 + tokens.css / topbar.css / panels.css / states.css / editor.css / base.css 现状 + TopBar.tsx / hotspots-panel.tsx / EditorHeadActions.tsx / Icon.tsx 现状
> 性质：**可直接照抄进 CSS 的视觉规格**。§1 DOM 契约（class / testid / role / 结构角色）零破坏；本文只动视觉与新增功能面样式。
> 寄存器/三轴：Product 寄存器，Variance=3 / Motion=3 / Density=6（uiux-workbench-delta 定稿，本 delta 不变）。

---

## 0. 结论先行与对账表

| 实测问题 | 既定方向 | 本文章节 |
|---|---|---|
| P1 双顶栏硬拼 | D1 顶栏降级为工具行 + segmented control | §1 |
| P2 热榜裸列无提炼 | D2 AI 速览卡 | §2 |
| P3 视图 tab 空可访问名 | D3 aria-label（无视觉面） | §3-1 |
| P4 RRULE 当正文 | D3 移入 title | §3-2 |
| P5 Pill 整删误触 | D3 × 独立点击目标 | §3-3 |
| P6 hover:none 无 fallback | D3 常显 fallback | §3-4 |

硬约束总账：**零新增 token、零新增 npm 依赖、零渐变、零 emoji 图标、零裸 hex、零 DOM 契约改名**；全部深浅主题随宿主 `--dsw-*` 翻转自动成立（本规格未写任何主题分支，见 §4 第 3 项的论证）。

---

## 1. D1 顶栏降级 — segmented control（解 P1）

### 1-1 设计判定

宿主 banner 不可控，因此 `ww-topbar` 放弃「系统级 chrome」语言（白底 + 全宽 border-strong 底线 + 浏览器 tab 底线激活），改为「工作台内工具行」语言：**透明感底（显式 `--ww-bg-page`）+ 胶囊分段控件**。控件语言的对标是 Linear/Raycast 的 segmented nav，不是浏览器 tab。

关键决策与理由：

1. **胶囊半径用 `--ww-radius-full`**（token 注释明确「状态点/胶囊」用途）。8px 圆角上限约束的是卡片/弹层（radius-lg）；胶囊是 token 体系内的既有形状类别，与编辑器 `.ww-view-tabs` 的 6px 紧凑档形成两档控件语言：顶栏 = 主导航胶囊（40px 行内 32px 槽），编辑器头 = 紧凑控件（6px）。两者同构不同尺，不冲突。
2. **槽必须带 1px `--ww-border`**。实测 token 值：`--ww-surface-sunken` 与 `--ww-bg-page` 浅色同为 #F9FAFB / 深色同为 #1B1B1C（同源 `specific-sidebar-fill`）。裸 sunken 槽在 bg-page 上浅深两主题都不可见，边框是槽存在的唯一稳定定义——这也是既有 `.ww-view-tabs`（states.css:163-170）的构造方式，本方案与之同构。
3. **激活段 = surface 白底 + accent 文字 + `--ww-shadow-card` 微影**（blur 2px，远低于 16px 幽灵卡红线），不用边框 ring（`--ww-view-tab--active` 用 ring，是紧凑档；主导航用投影更接近「浮起的小卡」），不做 hover 位移。
4. **右端 settings 激活态从「2px 底线」改为「迷你激活片」**（surface 底 + 微影 + accent 图标）：底线语言整体退役后，孤零零保留一条底线反而成为全栏唯一残迹。这是对 workbench-delta §1-1「同款底线」视觉条款的显式覆盖（v0.2.1 总监 delta 授权「只改视觉处理」，DOM 语义不动）。
5. 激活段 hover 不变色不变底：当前页不是动作目标，态稳定优先（预写了高优先级覆盖规则，防止通用 :hover 规则把激活段刷回次级色）。

### 1-2 线框（宽态）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ╭─────────────────────────────────╮                                     │
│ │ [▪pen-line 写作]▪[▪flame 选题]▪[▪calendar-clock 定时] │  ···  ◐生成中 ▪已连接 [▪settings] │
│ ╰─────────────────────────────────╯                                     │
│  ╰─ 槽: sunken 底 + 1px border + radius-full + padding 2px              │
│   激活段: surface 白底 + accent 文字 + shadow-card；非激活: fg-secondary   │
│  底色 = --ww-bg-page，无 border-bottom，与 .ww-content 融为一体            │
└──────────────────────────────────────────────────────────────────────────┘
 行高 40px = --ww-toolrow-h；段高 28px（与右端 conn/settings 28px 热区同档）；
 bar 左右 padding 24px = --ww-space-6（与 .ww-content 非 flush 态对齐）
```

### 1-3 可照抄 CSS（`src/client/styles/topbar.css` 整块替换）

```css
/*
 * 顶栏样式（v0.2.1 D1，uiux-polish-v0.2.1-design §1）：
 * 从「系统级 bar」降级为「工作台内工具行」——bg-page 融合底、无全宽底线、
 * 导航 3 Tab 改胶囊 segmented control。DOM 契约（header/nav/button.ww-tab/
 * data-testid/aria-current）零改动。
 */

/* ---------- TopBar 工具行 ---------- */

.ww-topbar {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--ww-space-2);
  height: var(--ww-toolrow-h);
  min-height: var(--ww-toolrow-h);
  /* D1：非 flush 态 .ww-content 的左右对齐（24px）；窄态见文末容器查询 */
  padding: 0 var(--ww-space-6);
  /* D1：透明感融合底（显式 bg-page——shell 根是 --ww-bg 白，transparent 会露白）；
   * 去掉全宽 border-bottom，顶栏与内容区不再硬分隔 */
  background: var(--ww-bg-page);
  position: sticky;
  top: 0;
  z-index: var(--ww-z-sticky);
  /* 窄态容器查询锚点（D1 §1-8）：只作用于本行后代，不把 containment 加到 .ww-shell */
  container-type: inline-size;
}

/* 导航槽：胶囊分段容器。nav.ww-topbar__nav 命名/语义不变（仍是 nav + aria-label） */
.ww-topbar__nav {
  display: inline-flex;
  align-items: center;
  /* 控件槽微距 2px：沿用 .ww-view-tabs（states.css）既有控件槽先例，不进 4px 宏观网格 */
  gap: 2px;
  padding: 2px;
  background: var(--ww-surface-sunken);
  /* 槽边框必带：sunken 与 bg-page 同值（浅 #F9FAFB / 深 #1B1B1C），无边框槽不可见 */
  border: var(--ww-border-width) solid var(--ww-border);
  border-radius: var(--ww-radius-full);
  min-width: 0;
}

.ww-topbar__spacer { flex: 1; }

/* 分段项：button.ww-tab 命名/激活类/testid/aria-current 语义全部不变 */
.ww-tab {
  appearance: none;
  border: none;
  background: none;
  color: var(--ww-fg-secondary);
  font: inherit;
  font-size: var(--ww-text-base);
  /* 段高 28px：与右端 conn/settings 28px 热区同档（槽 32px = 28 + 2×2 padding，居中于 40px 行） */
  height: 28px;
  padding: 0 var(--ww-space-3);
  display: inline-flex;
  align-items: center;
  gap: var(--ww-space-1);
  border-radius: var(--ww-radius-full);
  cursor: pointer;
  white-space: nowrap;
  transition:
    color var(--ww-motion-base) var(--ww-ease),
    background var(--ww-motion-base) var(--ww-ease),
    box-shadow var(--ww-motion-base) var(--ww-ease);
}

.ww-tab svg {
  color: var(--ww-fg-tertiary);
  transition: color var(--ww-motion-base) var(--ww-ease);
}

.ww-tab:hover {
  color: var(--ww-fg);
  background: var(--ww-interactive-hover);
}

.ww-tab:hover svg { color: var(--ww-fg-secondary); }

/* 激活段：surface 白底 + accent 文字 + 卡片级微影（blur 2px） */
.ww-tab--active {
  color: var(--ww-accent);
  font-weight: var(--ww-weight-medium);
  background: var(--ww-surface);
  box-shadow: var(--ww-shadow-card);
}

.ww-tab--active svg { color: var(--ww-accent); }

/* 激活段 hover 保持稳定（当前页不是动作目标）。
 * 必须置于通用 :hover 之后——同特异性下后者胜出会把激活段刷回次级态。 */
.ww-tab--active:hover {
  color: var(--ww-accent);
  background: var(--ww-surface);
}

.ww-tab--active:hover svg { color: var(--ww-accent); }

/* 禁用态预留（当前无禁用场景；opacity 0.6 = .ww-menu-trigger--accent:disabled 既有惯例） */
.ww-tab:disabled { opacity: 0.6; cursor: default; }

/* 键盘焦点：全局 ring（base.css）到达时 box-shadow 被整体替换，
 * 激活段补回微影，避免焦点瞬间「白片塌陷」。特异性 (0,3,0) > 全局 (0,2,1)。 */
.ww-topbar__nav .ww-tab--active:focus-visible {
  box-shadow: var(--ww-focus-ring), var(--ww-shadow-card);
}

/* 键盘焦点（非激活段）沿用 base.css 全局 ring，无需本文件规则。 */

/* ---------- 右端区（progress / conn / settings）：视觉重量不变 ---------- */

/* .ww-topbar__progress / .ww-topbar__conn 样式零改动（次级文字 + 28px 热区 + ghost hover）。 */

/* settings 齿轮：去掉 2px 底线语言（透明底线占位一并删除，消除 1px 图标偏心），
 * 激活态改「迷你激活片」与 segmented 激活段同语言。 */
.ww-topbar__settings {
  appearance: none;
  border: none;
  background: none;
  color: var(--ww-fg-secondary);
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ww-radius-md);
  cursor: pointer;
  transition: background var(--ww-motion-fast) var(--ww-ease), color var(--ww-motion-fast) var(--ww-ease), box-shadow var(--ww-motion-base) var(--ww-ease);
}

.ww-topbar__settings:hover { background: var(--ww-interactive-hover); color: var(--ww-fg); }

.ww-topbar__settings[aria-current='page'] {
  color: var(--ww-accent);
  background: var(--ww-surface);
  box-shadow: var(--ww-shadow-card);
}

/* 激活态 hover 同样保持稳定（同 .ww-tab--active:hover 理由） */
.ww-topbar__settings[aria-current='page']:hover {
  color: var(--ww-accent);
  background: var(--ww-surface);
  box-shadow: var(--ww-shadow-card);
}
```

**同时删除**（现 topbar.css 中的旧语言，勿留孤儿规则）：

| 位置 | 删除内容 |
|---|---|
| `.ww-topbar` | `border-bottom: var(--ww-border-width) solid var(--ww-border-strong);`、`background: var(--ww-bg);`、padding `--ww-space-4`（换 `--ww-space-6`） |
| `.ww-tab` | `height: var(--ww-toolrow-h)`（换 28px）、`border-bottom: 2px solid transparent`、顶角圆角 `var(--ww-radius-sm) var(--ww-radius-sm) 0 0`、transition 中的 `border-color` |
| `.ww-tab--active` | `border-bottom-color: var(--ww-accent);`、`color: var(--ww-fg)`（换 accent） |
| `.ww-topbar__settings` | `border-bottom: 2px solid transparent;` |
| `.ww-topbar__settings[aria-current='page']` | `border-bottom-color: var(--ww-accent);`（换迷你激活片） |

`.ww-topbar__progress` / `.ww-topbar__conn` 两块**原样保留**。

### 1-4 参数 — token 对照表（D1 全量）

| 参数 | 值 | token / 常量说明 |
|---|---|---|
| 工具行高 | 40px | `--ww-toolrow-h` |
| 工具行底色 | 融合底 | `--ww-bg-page` |
| 工具行左右 padding | 24px | `--ww-space-6` |
| 行内元素间距 | 8px | `--ww-space-2` |
| 槽底色 | sunken | `--ww-surface-sunken` |
| 槽边框 | 1px | `--ww-border-width` × `--ww-border` |
| 槽圆角 | 胶囊 | `--ww-radius-full`（token 既有「胶囊」语义槽） |
| 槽 padding / 内距 | 2px | 非 token 常量，先例 `.ww-view-tabs`（states.css:167-168） |
| 段高 / 右端热区高 | 28px | 非 token 常量，先例 conn/settings 28px 热区（契约 §1-1） |
| 段圆角 | 胶囊 | `--ww-radius-full` |
| 段文字号 | 14px | `--ww-text-base`（契约「icon 16 + gap 4 + 文字 14」不变） |
| 段 icon-文字 gap | 4px | `--ww-space-1` |
| 非激活文字 | 次级 | `--ww-fg-secondary`（浅 #61666B on #F9FAFB ≈ 4.9:1，达标） |
| 非激活 icon | 三级 | `--ww-fg-tertiary`（非文本组件 3:1 达标，且有文字并排） |
| hover 文字 / 底 | 主文字 / 悬停底 | `--ww-fg` / `--ww-interactive-hover` |
| hover icon | 次级 | `--ww-fg-secondary` |
| 激活文字 / icon | 强调 | `--ww-accent`（浅 #4176E6 on #FFF ≈ 4.6:1，达标） |
| 激活底 | 卡面 | `--ww-surface` |
| 激活微影 | 卡片级 | `--ww-shadow-card`（blur 2px） |
| 激活字重 | 500 | `--ww-weight-medium` |
| 禁用不透明度 | 0.6 | 非 token 常量，先例 `.ww-menu-trigger--accent:disabled` |
| 焦点环 | 全局 | `--ww-focus-ring`（base.css 全局规则，inherit 圆角跟随胶囊） |
| 过渡时长 / 缓动 | 200ms / 宿主缓动 | `--ww-motion-base` × `--ww-ease`（右端 ghost 沿用 `--ww-motion-fast` 100ms 不变） |
| sticky 层级 | 1100 | `--ww-z-sticky` |

**零新增 token**——上表全部命中既有 token 或既有非 token 布局常量先例。

### 1-5 状态矩阵（分段项 `button.ww-tab`）

| 状态 | 定义 |
|---|---|
| Default | 透明底 + `--ww-fg-secondary` 文字 + `--ww-fg-tertiary` icon |
| Hover（非激活） | `--ww-interactive-hover` 底 + `--ww-fg` 文字 + `--ww-fg-secondary` icon，200ms |
| Active（选中页） | `--ww-surface` 底 + `--ww-accent` 文字/icon + `--ww-weight-medium` + `--ww-shadow-card`；hover 保持稳定 |
| Active 段键盘焦点 | `--ww-focus-ring` + `--ww-shadow-card` 叠加（§1-3 专项规则） |
| 非激活键盘焦点 | base.css 全局 `--ww-focus-ring`（inherit 圆角 = 胶囊形环） |
| Disabled（预留） | opacity 0.6 + cursor default；当前无禁用场景 |
| Loading / Empty / Success | 不适用（静态导航；生成中反馈由右端进度点承载，非 Tab 态） |

### 1-6 右端视觉对齐：progress / conn / settings

- 三者维持「次级文字 + 28px 热区 + ghost hover（`--ww-interactive-hover` 100ms）」注册语言，**样式零改动**（progress/conn）/ 仅换激活态（settings）。
- 对齐机制：分段槽总高 32px（28 段 + 2×2 槽距）与右端 28px 控件同以 `align-items: center` 挂在 40px 行中线上；控件注册语言刻意分档——导航 = segmented（胶囊、200ms、激活浮起），右端 = icon/文字热区（radius-md、100ms、平铺 hover），「控件」与「工具」两级权重可辨。
- settings 激活 = 迷你激活片（surface + 微影 + accent icon，radius-md），是 segmented 激活语言的方角变体，语义「当前在设置页」。

### 1-7 sticky 与 `--ww-bg-page` 融合

- `position: sticky; top: 0; z-index: var(--ww-z-sticky)` 原样保留（契约要求长列表滚动导航常驻）。结构事实：`.ww-topbar` 是 `.ww-content`（滚动容器）的 flex 兄弟节点，内容永远不在顶栏下方穿过，融合底无「内容透底」风险，无需 scrim/blur。
- 三路由验证：工作区 flush 态——rail 底 = bg-page，与顶栏同色连成 L 形导航面，白主区从顶栏下缘开始，层级由内容自证；选题/定时/设置态——`.ww-content` bg-page + 白卡浮其上，顶栏即「工作台面的最上沿」；深色主题全链自动翻转（bg-page #1B1B1C / surface #2C2C2E / shadow-card 深色覆写版）。
- 顶栏与下方内容的呼吸由 `.ww-content` 非 flush 态 padding-top 20px（`--ww-space-5`）与 flush 态 rail 自身边界承担，顶栏自身不再出线。

### 1-8 窄态 <900px 行为

锚点对齐项目窄态断点（App.tsx `NARROW_BREAKPOINT = 900`），用容器查询（`.ww-topbar` 自身 `container-type: inline-size`，与编辑器头 `.ww-editor-head` 同技法），不依赖 store.narrow 传参、不加任何 class：

```css
/* 窄态：段内距 12→8px，bar 高度/槽/胶囊不变 */
@container (max-width: 900px) {
  .ww-tab { padding: 0 var(--ww-space-2); }
}
```

- 宽度账（600px 面板，最紧「未配置」文案）：bar padding 48 + 槽 4 + 三段约 192 + 间距与右端约 150 ≈ 394px，余量充足；文字标签保留（可访问名 + 中文二字标签信息密度高于 icon-only）。
- `white-space: nowrap` 保证 CJK 标签永不折行破坏 40px 行高。
- 极端 <420px（手机宽）不出现在 DSH 桌面宿主面板；若未来宿主支持，再议 conn 文案收为 StateDot-only（需给 span 加 class，属新增命名非契约破坏）——本轮不做，见 advisory。

### 1-9 DOM 契约对账（§1-1 逐项）

| 契约项 | 处置 |
|---|---|
| `header.ww-topbar` | 保留（仅样式） |
| `nav.ww-topbar__nav` + `aria-label="WeWrite 导航"` | 保留（新增角色：分段槽容器，纯样式层） |
| `button.ww-tab` × 3 / `ww-tab--active` / `aria-current="page"` | 保留 |
| icon 16 + gap 4 + 文字 14 | 保留（§1-4） |
| 进度点 + conn + settings 结构顺序 | 保留 |
| 全部 data-testid（`ww-topbar` / `ww-topbar-tab-*` / `ww-topbar-settings` / `ww-topbar-conn` / `ww-progress-dot`） | 保留 |
| nav + aria-current（非 tablist） | 保留（segmented 是纯视觉语言，页面导航语义不变） |
| 40px 高 / sticky | 保留 |
| 「底线 2px accent 激活语言」 | **显式退役**（v0.2.1 §1 授权；settings 同步换迷你激活片，§1-1 决策 4） |

---

## 2. D2 AI 速览卡（解 P2）

### 2-1 位置与结构

位置：`.ww-hotspots__main`（左主列）内，**`.ww-pagebar` 之下、列表区（`.ww-hotspot-list` / SkeletonRow / EmptyState / ErrorNote）之上**；窄态（`ww-hotspots--narrow`）位置不变（关键词横条 order:-1 移到 aside，主列内序不受影响）。与列表的间距 = `margin-bottom: var(--ww-space-4)`（16px，与 pagebar 的 margin-bottom 同节奏）。

卡族语言：与 `.ww-hotspots__keywords` / `.ww-schedule-card` 同族——surface 白卡 + 1px border + radius-lg 8px + `--ww-shadow-card`，padding `--ww-space-4`。灰底（bg-page）上浮白卡，无左边框强调条、无渐变。

线框：

```
┌─ .ww-digest ────────────────────────────────────────────────┐
│ [▪wand-sparkles] AI 速览  [glm-4.7-flash]·12:04   ⟶spacer⟵  │
│                                    [榜单已更新，重新生成] [↻重新生成] [⌃收起] │
│ ├──────────────────────────────────────────────────────────┤ │
│ │ 主线：开源 Agent 框架持续霸榜，浏览器内运行时是新热点。          │ │
│ │ · Agent 协议与编排：#1 #4 #9 —                                │ │
│ │ · 浏览器/端侧运行时：#7 #15 —                                 │ │
│ │ 值得写：                                                      │ │
│ │ · #7 《MCP 在企业内的真实落地痛点》 — 国内案例少，读者缺口明显   │ │
│ │ 命中：#4 #15                                                  │ │
└──────────────────────────────────────────────────────────────┘
 头部行 28px min-height；正文 14px / 行高 1.7；段首行前缀 700 加粗；
 · 行缩进列表化；rank 数字 mono
```

### 2-2 命名契约（新增，前端 + QA 新锚点；不在冻结清单内）

| 元素 | 契约 |
|---|---|
| 卡容器 | `section.ww-digest`，`aria-label="AI 速览"`，data-testid `ww-digest` |
| 头部行 | `.ww-digest__head`（wand-sparkles 16px + 标题 + meta + stale + 动作钮） |
| 图标 | `.ww-digest__icon`（`wand-sparkles` 16px，`--ww-accent`） |
| 标题 | `.ww-digest__title`「AI 速览」 |
| meta | `.ww-digest__meta`（model 走 `.ww-code` 等宽带 + 时间 `formatTime`） |
| 过期标注 | `.ww-digest__stale`（chip：`triangle-alert` 12px + 「榜单已更新，重新生成」） |
| 动作钮 | `.ww-digest__action`（共用类）：重新生成 = `refresh-cw` 16 + data-testid `ww-digest-regen`；收起/展开 = `chevron-up`/`chevron-down` 16 + `aria-expanded` + `aria-controls="ww-digest-body"` + data-testid `ww-digest-collapse` |
| 正文 | `.ww-digest__body`（id `ww-digest-body`）> 若干 `.ww-digest__section`（段首行）/ `.ww-digest__item`（· 行） |
| 生成入口 | pagebar 内 Button ghost sm（`wand-sparkles` 16 + 「AI 速览」），data-testid `ww-digest-generate`，紧跟现有「刷新」ghost 按钮左侧 |
| 收起态 | `.ww-digest--collapsed` → `.ww-digest__body { display: none }`，头部行常驻 |

### 2-3 可照抄 CSS（`src/client/styles/panels.css` 末尾追加「AI 速览卡」段）

```css
/* ---------- AI 速览卡（v0.2.1 D2，uiux-polish-v0.2.1-design §2） ---------- */

.ww-digest {
  margin-bottom: var(--ww-space-4);
  padding: var(--ww-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ww-space-2);
  background: var(--ww-surface);
  border: var(--ww-border-width) solid var(--ww-border);
  border-radius: var(--ww-radius-lg);
  box-shadow: var(--ww-shadow-card);
  /* 卡族 hover 反馈：只提边框（同 keywords/schedule 卡的 border-strong 升档） */
  transition: border-color var(--ww-motion-base) var(--ww-ease);
}

.ww-digest:hover { border-color: var(--ww-border-strong); }

.ww-digest__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;          /* 窄态 meta/stale 自然折到次行，不溢出 */
  gap: var(--ww-space-2);
  min-height: 28px;
}

.ww-digest__icon { color: var(--ww-accent); display: inline-flex; }

.ww-digest__title {
  margin: 0;
  font-size: var(--ww-text-md);
  font-weight: var(--ww-weight-medium);
}

.ww-digest__meta {
  display: inline-flex;
  align-items: center;
  gap: var(--ww-space-2);
  font-size: var(--ww-text-sm);
  color: var(--ww-fg-tertiary);
  min-width: 0;
  overflow: hidden;
}

/* 过期 chip：暖底警示，文字用 --ww-fg 保对比（--ww-warn 文字 on warn-subtle 仅约 2:1，不可作正文色） */
.ww-digest__stale {
  display: inline-flex;
  align-items: center;
  gap: var(--ww-space-1);
  padding: 2px var(--ww-space-2);
  background: var(--ww-warn-subtle);
  color: var(--ww-fg);
  border-radius: var(--ww-radius-sm);
  font-size: var(--ww-text-sm);
  white-space: nowrap;
}

.ww-digest__stale svg { color: var(--ww-warn); }

.ww-digest__spacer { flex: 1; }

/* 头部动作钮（重新生成 / 收起）：28px ghost 热区，同右端 topbar 工具语言 */
.ww-digest__action {
  appearance: none;
  border: none;
  background: none;
  font: inherit;
  font-size: var(--ww-text-sm);
  color: var(--ww-fg-secondary);
  height: 28px;
  padding: 0 var(--ww-space-2);
  display: inline-flex;
  align-items: center;
  gap: var(--ww-space-1);
  border-radius: var(--ww-radius-md);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--ww-motion-fast) var(--ww-ease), color var(--ww-motion-fast) var(--ww-ease);
}

.ww-digest__action:hover { background: var(--ww-interactive-hover); color: var(--ww-fg); }

.ww-digest__action:disabled { opacity: 0.6; cursor: default; }

/* 正文：14px / 中文阅读行高 1.7 / 长英文标题安全断行 */
.ww-digest__body {
  display: flex;
  flex-direction: column;
  gap: var(--ww-space-1);
  font-size: var(--ww-text-base);
  line-height: var(--ww-leading-body);
  color: var(--ww-fg);
  overflow-wrap: break-word;
}

/* 段首行（主线：/ 值得写：/ 命中：）：前缀 700 加粗，正文常规 */
.ww-digest__section { margin: var(--ww-space-2) 0 0; }

.ww-digest__section:first-child { margin-top: 0; }

.ww-digest__prefix { font-weight: var(--ww-weight-bold); }

/* · 行：marker 缩进列表化；rank 数字 mono 三级色 */
.ww-digest__item {
  display: flex;
  gap: var(--ww-space-2);
  padding-left: var(--ww-space-2);
}

.ww-digest__item-mark { color: var(--ww-fg-tertiary); flex: none; }

.ww-digest__rank {
  font-family: var(--ww-font-code);
  font-size: var(--ww-text-sm);
  color: var(--ww-fg-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 「—」后的理由短语降为次级（前端按分隔符拆分，拆不动则整行 --ww-fg，不强制） */
.ww-digest__why { color: var(--ww-fg-secondary); }

.ww-digest--collapsed .ww-digest__body { display: none; }
```

Loading / Error / Skeleton 态复用既有四态基础件（结构不动约定）：loading = `.ww-digest__body` 内渲染 `SkeletonBlock` × 3 行；error = `.ww-digest__body` 内渲染 `ErrorNote`（`.ww-error` 全套）+ 「重试」outline sm 按钮。不新写任何骨架/错误样式。

### 2-4 行渲染规则（纯文本行 → DOM，不依赖 markdown）

LLM 输出按行拆分后逐行匹配（匹配失败的原样落为普通正文行，永不丢内容）：

| 行特征 | 渲染 |
|---|---|
| 以 `主线：` / `值得写：` / `命中：` 开头 | `p.ww-digest__section`：前缀（含冒号）包 `<span class="ww-digest__prefix">`（700），其余常规 `--ww-fg` |
| 以 `· ` 开头 | `p.ww-digest__item`：剥掉 LLM 的 `·`，自渲染 `<span class="ww-digest__item-mark">·</span>` 统一缩进对齐；行内 `#数字` 串包 `.ww-digest__rank`（mono）；`—` 之后到行尾包 `.ww-digest__why`（次级色，可选，拆分失败不强制） |
| 其余 | `p`（正文行，常规） |

示例（输入 `· #7 《MCP 在企业内的真实落地痛点》 — 国内案例少，读者缺口明显`）：

```html
<p class="ww-digest__item">
  <span class="ww-digest__item-mark">·</span>
  <span><span class="ww-digest__rank">#7</span> 《MCP 在企业内的真实落地痛点》
    <span class="ww-digest__why">— 国内案例少，读者缺口明显</span></span>
</p>
```

### 2-5 状态矩阵（`ww-digest` 9 态覆盖）

| 状态 | 触发 | 视觉 |
|---|---|---|
| Empty（未生成过） | 无缓存摘要 | **卡不渲染**。生成入口 = pagebar「AI 速览」ghost 按钮（wand-sparkles 16 + 文案），首屏黄金位留给列表；按钮即空态引导 |
| Loading | 点击生成/重新生成 | 卡立即出现：头部行正常 + 正文 `SkeletonBlock` × 3；pagebar 按钮 icon 换 `loader-circle` + `ww-spin` + disabled（同「刷新」按钮 loading 手法） |
| Ready | RPC 返回 | §2-3/2-4 全量渲染；头部 meta = model（`.ww-code` 等宽带）+ 生成时间（`formatTime`，text-sm 三级色） |
| Stale（过期） | 榜单签名变化但仍有旧摘要 | 头部 meta 行追加 `.ww-digest__stale` chip（`triangle-alert` 12 + 「榜单已更新，重新生成」）；正文照常展示旧摘要；重新生成成功后 chip 消失 |
| Error | RPC 失败 | 卡保留头部行（上下文不丢），正文区 `ErrorNote`（danger 边框 + danger-subtle 底，既有件）+ 「重试」outline sm 按钮 = 重新生成 |
| Collapsed | 点「收起」 | `.ww-digest--collapsed`：仅剩头部行，chevron 转 `chevron-down`；再点展开（`aria-expanded` 同步） |
| Default / Hover / Focus | — | 卡 hover = border-strong 升档；动作钮 hover = `--ww-interactive-hover`；键盘焦点走 base.css 全局 ring |
| Disabled | loading 中 | 两个动作钮与生成按钮 opacity 0.6 + cursor default |
| Success | 即 Ready | 生成完成的落点即 ready 态（无独立 success 层，不弹 Toast 打断阅读） |

进入动效：无（静态渲染挂载，同契约 §1-9 #8 启动卡纪律；Motion=3 无装饰动效）。收起/展开为瞬时 display 切换。

### 2-6 参数 — token 对照表（D2 全量）

| 参数 | 值 | token |
|---|---|---|
| 卡底 / 边框 / 圆角 / 微影 | surface / 1px border / 8px / card | `--ww-surface` / `--ww-border(-width)` / `--ww-radius-lg` / `--ww-shadow-card` |
| 卡 padding / 下距 | 16 / 16px | `--ww-space-4` |
| 头部行高 | 28px min | 非 token 常量（§1-4 同源） |
| 标题 | 16px / 500 | `--ww-text-md` × `--ww-weight-medium`（同 `.ww-aside-title` 档） |
| 头部图标 | wand-sparkles 16px / accent | `--ww-accent` |
| model 名 | 等宽带 | 复用 `.ww-code`（token 注释明确「模型名」场景） |
| 时间 | 13px 三级 | `--ww-text-sm` × `--ww-fg-tertiary` |
| stale chip | warn-subtle 底 + fg 文字 + warn icon + 4px 圆角 | `--ww-warn-subtle` / `--ww-fg` / `--ww-warn` / `--ww-radius-sm` |
| 正文 | 14px / 1.7 | `--ww-text-base` × `--ww-leading-body` |
| 段首前缀 | 700 | `--ww-weight-bold`（宿主可用字重 400/500/700） |
| rank 数字 | mono 13px 三级 | `--ww-font-code` × `--ww-text-sm` × `--ww-fg-tertiary` |
| 理由短语 / · marker | 次级 / 三级 | `--ww-fg-secondary` / `--ww-fg-tertiary` |
| 动作钮 | 28px ghost + radius-md | `--ww-interactive-hover` / `--ww-radius-md` / `--ww-motion-fast` |
| 骨架 / 错误 | 复用件 | `--ww-skeleton` / `.ww-error` 全套 |

**零新增 token**。accent 预算对账：选题页常态可见 accent = digest 图标（1 处）+ 命中筛选开启时的 filter chip（1 处）= 2 处上限内；命中行用 `--ww-accent-subtle`（大面积浅 accent，不计入全饱和 accent）。

---

## 3. D3 细节修复（P3–P6）

### 3-1 P3 视图 tab aria-label（无视觉面，确认）

`EditorHeadActions.tsx` 三个 `role="tab"` 按钮补 `aria-label={tab.label}`（label 被 `@container` 隐藏后可访问名仍在：仅编辑 / 双栏 / 仅预览）。纯属性增量，editor.css 的 `.ww-view-tab__label { display: none }`（editor.css:50）不动。**无 CSS 交付**。

### 3-2 P4 RRULE 移入 title

- hotspots 无关；改动点在 schedule 卡：删除 `.ww-schedule-card__rrule` 可见段落（JSX 行），RRULE 字符串移入人话行 `title={rrule}`（`.ww-schedule-card__human`，panels.css:169 原样保留）。
- 同步删除 panels.css 两行孤儿规则（L170-171）：`.ww-schedule-card__rrule { margin: 0; }` 与 `.ww-schedule-card__rrule .ww-code { margin-left: calc(-1 * var(--ww-space-2)); }`。
- 视觉：卡内少一行技术噪音；原生 title 悬停提示足够（不加 cursor: help——人话行非交互件，help 光标反而误导可点）。

### 3-3 P5 关键词 Pill × 独立点击目标

结构：Pill 本体去掉 onClick（退化为静态 chip），内部 × 改为真按钮。因需 Pill 级 hover 作用域，每个关键词包一层自有 wrapper（新增命名，不在冻结清单）：

```html
<span class="ww-keyword">
  <Pill>{word}
    <button type="button" class="ww-keyword__x" aria-label={`移除关键词「${word}」`}
            data-testid="ww-keyword-remove" onClick={remove}>
      <Icon name="x" size={16} />
    </button>
  </Pill>
</span>
```

CSS（panels.css 关键词段追加）：

```css
/* P5：Pill 本体不再整删；× 独立点击目标，Pill 悬停时才显色提示可点 */
.ww-keyword { display: inline-flex; max-width: 100%; }

.ww-keyword__x {
  appearance: none;
  border: none;
  background: none;
  padding: var(--ww-space-1);              /* 16 icon + 4×2 = 24px 热区，负 margin 不撑大 Pill */
  margin: 0 calc(-1 * var(--ww-space-1)) 0 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ww-fg-caption);
  border-radius: var(--ww-radius-sm);
  cursor: pointer;
  transition: color var(--ww-motion-fast) var(--ww-ease);
}

/* 默认 × 半隐（caption 色）；Pill 悬停 / × 自身悬停 / 键盘聚焦时显色 */
.ww-keyword:hover .ww-keyword__x,
.ww-keyword__x:hover,
.ww-keyword__x:focus-visible { color: var(--ww-fg); }
```

删除风险从「整 Pill 误触」收敛到「显式 ×」；键盘可达（真 button + aria-label + 全局 focus ring）。

### 3-4 P6 `hover: none` fallback（「写这个」常显）

核对结论：`.ww-hotspot__write` 基态 `opacity: 0; pointer-events: none`（panels.css:75-76），仅 `.ww-hotspot__liner:hover / :focus-within` 解锁——触屏确无路径。补 CSS（panels.css 该段后追加）：

```css
/* P6：触屏（hover:none）无悬停路径，「写这个」常显 fallback。
 * 按钮自带 surface 实底 + 1px 边框，覆盖在行尾 meta/箭头上仍可读，无需改定位。 */
@media (hover: none) {
  .ww-hotspot__write {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
}
```

视觉代价：触屏下行尾 meta 与箭头被常显按钮遮盖（按钮 surface 实底遮得干净、不透底）——正确性优先于桌面态密度的 fallback 取舍，接受。桌面态（hover:hover）行为零变化。

---

## 4. 13 点自检表（设计系统 8 + 质量 5，逐项过）

| # | 检查项 | 结果 | 证据/说明 |
|---|---|---|---|
| 1 | 所有颜色通过 Design Token 引用 | 通过 | §1-3 / §2-3 / §3-3 / §3-4 全部 `var(--ww-*)`；文档中出现的 hex 仅为 token 注释性核对值（引 tokens.css 既有注释），非组件代码 |
| 2 | 间距全是 4px 整数倍 | 通过（含声明例外） | 宏观间距全走 `--ww-space-*`；控件槽 2px 微距（§1-4）与 chip `padding: 2px`（§2-3 stale）为既有控件内微距先例（`.ww-view-tabs` / `.ww-statusstrip__gate`），延续不新开任意值 |
| 3 | 字体同时指定 UI 中文栈 + 等宽 | 通过（继承） | 本 delta 零新字体：正文走 `--ww-font-ui`（宿主栈，项目章程零网络字体），rank/model 走 `--ww-font-code`；不引入 Inter/Noto 独立声明（寄生插件跟宿主） |
| 4 | 标题/正文/等宽三层级明确 | 通过 | digest 标题 `--ww-text-md`/500、正文 `--ww-text-base`/400/1.7、rank/model mono；顶栏段 14px 与右端 13px 两档延续现状 |
| 5 | Hero 展示真实产品内容 | 不适用 | Product 寄存器工具 UI，无 Hero；本 delta 全部为真实数据面（榜单/摘要/导航） |
| 6 | 对标品牌 + 行业风格全产品一致 | 通过 | Linear 式工程编辑风（浅底深内容 / 蓝纯色平涂 / 8px 圆角上限 / 线框分层），与 uiux-redesign-v2、workbench-delta 同源；segmented 控件与 `.ww-view-tabs` 同构同尺规律 |
| 7 | 按钮必要状态（Default/Hover/Focus/Active/Disabled） | 通过 | 分段 §1-5 六态；digest 动作钮/生成钮 default/hover/focus（全局 ring）/disabled(0.6)/loading(spin)；Active 文档态即激活段 |
| 8 | 表单验证错误、列表空状态 | 通过 | digest 空态（§2-5 Empty：卡不渲染 + pagebar CTA）、错误态（ErrorNote + 重试）、榜单页既有 EmptyState/Skeleton 不动 |
| 9 | 图标库锁定一套 + 尺寸统一 | 通过 | lucide 经 `<Icon name>` 唯一封装，12/16/20 三档；新增用名 `wand-sparkles`（Icon.tsx:103 已存在）、`triangle-alert`、`refresh-cw`、`chevron-up/down`、`x` 全部在映射表内；零 emoji |
| 10 | 无纯黑 #000 / 纯灰直接使用 | 通过 | 全 token；阴影为既有 `--ww-shadow-*` token 值 |
| 11 | 对比度 ≥4.5:1（正文）/ 动画 ≤400ms / reduced-motion | 通过 | 逐组实测：非激活段 4.9:1、激活段 4.6:1、digest 正文 ≈17:1；stale chip 文字因此用 `--ww-fg` 而非 `--ww-warn`（warn on warn-subtle ≈2:1 不达标，§2-3 注释）；动效 100/200ms 两档；reduced-motion 由 tokens.css 全局关断覆盖新规则 |
| 12 | 响应式覆盖（断点/导航/触摸） | 通过 | <900 容器查询（§1-8，锚点 App.tsx 断点）；digest 头部 flex-wrap；行触摸底线 44px（hotspot 行）与 28px 工具热区（桌面档惯例）延续；极端 <420 出桌面宿主域，记 advisory |
| 13 | 组件状态矩阵 9 态 | 通过 | 分段 §1-5（loading/empty/success 标注不适用及理由）；digest §2-5 九态全表（empty/loading/ready/stale/error/collapsed/hover/focus/disabled，success 归 ready） |

## 5. P0 三规则自查声明

1. **无 emoji 作为功能图标**：本规格所有图标均为 lucide 语义名经 `<Icon>` 封装（wand-sparkles / triangle-alert / refresh-cw / loader-circle / chevron-up / chevron-down / x / pen-line / flame / calendar-clock / settings / message-circle），文档全文不含 U+1F300–1F9FF / U+2600–26FF / U+2700–27BF 区段字符。
2. **无紫色→粉色渐变**：本规格零 `linear-gradient` / `radial-gradient`（stylelint `declaration-property-value-disallowed-list` 双保险）；紫粉四色 hex 零出现；accent 一律 deepseek 品牌蓝纯色平涂。
3. **无 AI 模板味**：无 Lorem ipsum / "Welcome to" / 空洞占位——全部文案为真实产品中文终稿（「AI 速览」「榜单已更新，重新生成」「移除关键词」等）；无硬编码颜色；无左边框强调条 / 渐变文字 / 毛玻璃 / 幽灵卡（1px 边框只配 blur 2px 微影）；圆角上限 8px（胶囊为 token 既有形状类别，非卡片圆角）。

---

## 6. 施工落点汇总（给前端的放置清单）

| 改动 | 文件 | 性质 |
|---|---|---|
| D1 全部 | `src/client/styles/topbar.css` | §1-3 整块替换 + §1-8 追加容器查询 |
| D2 卡样式 + P5 + P6 | `src/client/styles/panels.css` | §2-3 / §3-3 / §3-4 追加 |
| P4 清理 | `src/client/styles/panels.css` L170-171 | 删两行孤儿规则 |
| P3 | `src/client/components/editor/EditorHeadActions.tsx` | 仅加 aria-label 属性，无样式 |
| D2 组件 + RPC | hotspots-panel / contract / rpc / service | 总监 delta §2 已定契约，本规格只管视觉与命名（§2-2） |
