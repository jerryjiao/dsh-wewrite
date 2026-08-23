# dsh-wewrite 色彩主题 Bluewash — 视觉规格（设计师交付）

> 作者：颜好看（MVP 开发专家团设计师） | 日期：2026-08-20
> 输入：uiux-color-theme.md（本人方向篇，裁决与三层架构）+ src/client/styles/ 全部 12 css 现状 + docs/design/design-tokens.json v1.1.0 + 8 张真机截图
> 性质：**可直接照抄进 tokens.css / 组件 css 的施工真源**。结构/布局/间距/动效零变化（v0.2-v0.3 定稿不动），本文只动色彩。
> 寄存器/三轴：Product 寄存器，Variance=3 / Motion=3 / Density=6（不变）。
> 硬约束：零 gradient / 零 emoji / 零紫粉四色 / 组件零裸 hex / DOM 契约冻结（仅 3 处新增属性/元素，§4 逐处声明）/ 深浅双主题同步成立。

---

## 0. 变更总账（先读这张表）

| 类别 | 数量 | 明细 |
|---|---|---|
| 新增 token | 3 | view-topics / view-schedule / rank-top（§2-A） |
| 修改 token（宿主引用 → 自有值） | 8 | bg-page / surface-sunken / accent-subtle / canvas-well / border / border-strong / divider / skeleton（§2-B） |
| 修改 token（light 值微调，自有值原地更新） | 3 | shadow-card / shadow-overlay / shadow-modal 的 light 侧蓝黑化（§2-C） |
| 删除 token | 0 | — |
| 组件 css 触点 | 7 处 | tokens.css（token 值与 dark 覆写块）+ topbar/base/panels/workbench/states/overlay 各一小段（§4） |
| DOM 增量（新增，不改名不改结构） | 3 处 | tab `data-view` 属性 / pagebar 识别色圆点 span / rank Top3 修饰类（§4 逐处） |

**不动清单**（明确出界，防止施工漂移）：--ww-bg（面板基底，light 保持白——「纸面不染」）、--ww-surface / --ww-surface-raised（卡面与浮层，保持宿主）、--ww-fg×4（文字）、--ww-interactive-hover/active（宿主 hover 本就是蓝灰 rgba(38,49,72)，已与主题相容）、语义色 7 个、--ww-accent / hover / active / on / ring（accent 家族原样）、--ww-code-bg（等宽带小面积，保留宿主）、微信画布族（canvas-bg/frame/font）、全部字号/间距/圆角/动效/布局/z token。

---

## 1. 色板总览（Bluewash 三层）

### 1-1 L1 基底浸染层——「台面」

全部与品牌蓝 #4176E6 同 hue 家族（hue ≈ 219°），饱和度 20-33%：色温可感知，「彩色」不可感知。

| 槽 | light | dark | 角色 |
|---|---|---|---|
| 台面主底 bg-page | `#F2F4F8` | `#1A1E26` | 工作台/rail/顶栏融合底/浮层底 |
| 凹区与槽 surface-sunken | `#EBEEF5` | `#20242E` | segmented 槽/状态栏/表头/暂停卡/次级空态 glyph |
| 画布井 canvas-well | `#E7EBF3` | `#222734` | 预览画布井（比 sunken 深半档，井感） |
| 边框 border | `rgba(38,54,94,.13)` | `rgba(151,176,231,.15)` | 卡/输入框/画布框（叠白底 ≈ #E3E5EA，与原 rgba(0,0,0,.10) 等可见度但带蓝灰笔触） |
| 强调边框 border-strong | `rgba(38,54,94,.19)` | `rgba(151,176,231,.21)` | focus 边/表头下沿/浮层容器边 |
| 分隔线 divider | `rgba(38,54,94,.07)` | `rgba(151,176,231,.08)` | 行间分隔（较原 .04/.06 微提可见度） |
| 骨架 skeleton | `rgba(38,54,94,.08)` | `rgba(151,176,231,.09)` | 骨架屏品牌灰 |

rgba 基色 `rgb(38,54,94)` = `#26365E`（hsl 219,42%,26%）；dark 侧 `rgb(151,176,231)` = `#97B0E7`（品牌蓝提亮档）。

**边界效应（刻意）**：宿主会话栏/内容区是无彩灰（#F9FAFB/#FFFFFF），插件台面是 #F2F4F8 蓝灰——交界处即「进入写作台域」的色温切换，零装饰拿到主题感。dark 同理（宿主 #151517 纯灰黑 vs 台面 #1A1E26 蓝黑，Linear dark 式色温）。

### 1-2 L2 品牌操作层——「墨水」（accent 家族，仅修 subtle）

| 槽 | light | dark | 变化 |
|---|---|---|---|
| accent / hover / active / on / ring | 不变 | 不变 | — |
| **accent-subtle** | `#EDF3FE`（不变） | `#1E2B4D`（**新增**，原 light 值 static 不翻转） | 修复深色选中底风险：dark 下选中行底从刺眼浅蓝 #EDF3FE → 深蓝 #1E2B4D；v0.3 §D1 因该风险绕开的「底色徽记」自此解锁（advisory，不强制回改） |

### 1-3 L3 域识别与数据层——「标签与记号」（微面积专用）

| 槽 | light | dark | 用途（仅此四处，禁扩） |
|---|---|---|---|
| 写作域识别色 | `var(--ww-accent)` | `var(--ww-accent)` | 写作 Tab 激活 / 写作页头点 / rail 选中指示（既有） |
| **view-topics** | `#C2410C` | `#FB923C` | 选题 Tab 激活文字+icon / 选题页头点 |
| **view-schedule** | `#0F766E` | `#2DD4BF` | 定时 Tab 激活文字+icon / 定时页头点 |
| **rank-top** | `#C2410C` | `#FB923C` | 热榜 Top3 名次数字（与 view-topics 同值独立槽：同为「热榜热度」域，日后可独立调档） |
| 品牌时刻 glyph | `var(--ww-accent-subtle)` 底 + `var(--ww-accent)` icon | 同左（dark 自动） | 启动卡 glyph / hero 空态 glyph / 侧边栏入口 icon |

设置页**无识别色**（中性，Apple 先例）；文章库属写作域（rail 内）不单设。

**色相预算纪律**：同屏非中性色相 ≤2 种（操作蓝 + 当前域识别色；热榜页 = 蓝[命中行] + 橙[Top3]，恰成双色数据编码）。语义色仅在状态出现时入场，不计常态预算。

---

## 2. Token 变更全表（design-tokens.json v1.2.0 同步源）

### 2-A 新增（3 个）

| token | light | dark | usage | 落点 |
|---|---|---|---|---|
| `--ww-view-topics` | `#C2410C` | `#FB923C` | 选题域识别色：热榜 Tab 激活态文字与 icon、选题页头识别点。热力橙深档（orange-700），与 warn #F59E0B（琥珀黄调、状态专用）保持色距且视觉路径不重叠 | tokens.css 新增 §14 视图识别色段 |
| `--ww-view-schedule` | `#0F766E` | `#2DD4BF` | 定时域识别色：定时 Tab 激活态文字与 icon、定时页头识别点。青（teal-700），时间/规律语义，与 success 绿距离充分 | 同上 |
| `--ww-rank-top` | `#C2410C` | `#FB923C` | 热榜 Top3 名次数字（13px mono，4+ 名保持 fg-tertiary 灰）。数据可视化档；与 view-topics 同值但语义槽独立 | 同上 |

三个 token 均随主题翻转 → 全部进 dark 覆写块。

### 2-B 修改：宿主引用 → 自有双态（8 个）

| token | 旧 css（host） | 旧 light / dark | 新 light / dark | 替代关系与理由 |
|---|---|---|---|---|
| `--ww-bg-page` | `var(--dsw-specific-sidebar-fill)` | `#F9FAFB` / `#1B1B1C` | `#F2F4F8` / `#1A1E26` | 宿主槽是无彩功能灰，无「品牌 tint」档；分叉为自有主题资产。hsl(219,33%,96%) / hsl(219,19%,13%)，与品牌蓝同 hue。宿主换肤不再跟随（§1-4 让渡声明） |
| `--ww-surface-sunken` | `var(--dsw-specific-sidebar-fill)` | `#F9FAFB` / `#1B1B1C` | `#EBEEF5` / `#20242E` | 随台面同 hue 深一档（保持「槽比台面深」构造；segmented 槽仍有 border 双保险）。原与 bg-page 同源不同槽，现在两槽各自有值，宿主耦合解除 |
| `--ww-accent-subtle` | `var(--dsw-static-deepseek-50)` | `#EDF3FE` / `#EDF3FE`（static 不翻转） | `#EDF3FE` / `#1E2B4D` | **修复项**：static 值在深色下是刺眼浅蓝（v0.3 §D1/§4-6 反复绕开的风险源）。light 保留宿主 deepseek-50 同值，dark 换深蓝选中底 |
| `--ww-canvas-well` | `var(--dsw-alias-markdown-inline-code)` | `#EBEEF2` / `#2C2C2E` | `#E7EBF3` / `#222734` | 井底加入台面色温（原为灰调 code 槽借用，v0.2 注释已自称「唯一近似档」——本次转正为自有槽）。井感构造不变（比 sunken 深、比纸面深） |
| `--ww-border` | `var(--dsw-alias-border-l2)` | `rgba(0,0,0,.10)` / `rgba(255,255,255,.12)` | `rgba(38,54,94,.13)` / `rgba(151,176,231,.15)` | 全部线框获得蓝灰笔触。叠白底 ≈ #E3E5EA，与旧值 #E6E6E6 等可见度（对比度不回退，见 §5） |
| `--ww-border-strong` | `var(--dsw-alias-border-l3)` | `rgba(0,0,0,.12)` / `rgba(255,255,255,.16)` | `rgba(38,54,94,.19)` / `rgba(151,176,231,.21)` | 同上，强调档同步 |
| `--ww-divider` | `var(--dsw-alias-border-l1)` | `rgba(0,0,0,.04)` / `rgba(255,255,255,.06)` | `rgba(38,54,94,.07)` / `rgba(151,176,231,.08)` | 分隔线微提可见度（原 .04 在 tint 底上进一步隐形） |
| `--ww-skeleton` | `var(--dsw-alias-bg-skeleton)` | `rgba(0,0,0,.04)` / `rgba(255,255,255,.08)` | `rgba(38,54,94,.08)` / `rgba(151,176,231,.09)` | 骨架品牌灰（Stripe 式 tint 骨架），与 divider 同语言 |

### 2-C 修改：自有值原地更新 light 侧（3 个 shadow）

| token | 旧 light（dark 不变） | 新 light | 理由 |
|---|---|---|---|
| `--ww-shadow-card` | `0 1px 2px rgba(15,17,21,0.05)` | `0 1px 2px rgba(30,44,76,0.06)` | 阴影蓝黑化：白卡在蓝灰台面上的投影带冷调（纯黑阴影在 tint 底上显「脏」） |
| `--ww-shadow-overlay` | `0 8px 24px rgba(15,17,21,0.12)` | `0 8px 24px rgba(23,34,60,0.14)` | 同上 |
| `--ww-shadow-modal` | `0 16px 48px rgba(15,17,21,0.16)` | `0 16px 48px rgba(23,34,60,0.18)` | 同上 |

dark 覆写块三值（纯黑系）不变——暗色下阴影 hue 无感知。

### 2-D dark 覆写块扩容后的完整清单（tokens.css 底部覆写块施工对照）

```
body[data-ds-dark-theme] 作用域内需覆写的自有 token（15 个）：
  既有 4：accent-ring / shadow-card / shadow-overlay / shadow-modal
  新增 11：bg-page / surface-sunken / accent-subtle / canvas-well /
           border / border-strong / divider / skeleton /
           view-topics / view-schedule / rank-top
```

其余 20+ 颜色 token 仍走宿主 `var(--dsw-*)` 自动翻转（fg 族/交互族/语义族/surface 族/raised/code-bg/accent 主族）。

---

## 3. tokens.css 施工段（可照抄）

### 3-1 修改的 token 定义（替换原行，注释同步改）

```css
  /* ============================================================
   * 14. 视图识别色（Bluewash L3，uiux-color-theme-design §2-A）
   *     微面积专用：Tab 激活文字+icon / 页头识别点 / 热榜 Top3 名次。
   *     永不染大面积底（反廉价 §6-7）。设置页无识别色（中性先例）。
   * ========================================================== */
  /* 选题域（热榜）：热力橙深档，与 warn #F59E0B 保持色距、路径不重叠 */
  --ww-view-topics: #C2410C;
  /* 定时域：青（时间/规律语义），与 success 绿距离充分 */
  --ww-view-schedule: #0F766E;
  /* 热榜 Top3 名次数字（4+ 保持 --ww-fg-tertiary）；与 view-topics
     同值独立槽：同属「热度」语义，日后可独立调档 */
  --ww-rank-top: #C2410C;
```

（§14 段放 §13 焦点环之后；三个 token 值在 dark 覆写块翻转，见 §3-2。）

修改行（在各原位置替换值与注释；宿主引用注释改为「自有 Bluewash 台面值，v1.2.0 起脱离宿主换肤」）：

```css
  /* L1 台面：品牌冷调蓝灰 hsl(219,33%,96%)。原宿主 sidebar-fill 为无彩灰，
     v1.2.0 分叉为自有主题资产（uiux-color-theme-design §2-B） */
  --ww-bg-page: #F2F4F8;
  /* 凹区/槽：随台面同 hue 深一档（segmented 槽仍有 border 双保险） */
  --ww-surface-sunken: #EBEEF5;
  /* 选中行底/命中标签底：light 保留 deepseek-50 同值；dark 换深蓝选中底
     （修复 static 值深色刺眼风险，v0.3 §D1 绕开项自此解除） */
  --ww-accent-subtle: #EDF3FE;
  /* 画布井：v0.2 借用 code 槽转正为自有槽，加入台面色温 */
  --ww-canvas-well: #E7EBF3;
  /* 边框三档：蓝灰笔触 rgb(38,54,94)，叠白 ≈ #E3E5EA 与旧值等可见度 */
  --ww-border: rgba(38, 54, 94, 0.13);
  --ww-border-strong: rgba(38, 54, 94, 0.19);
  --ww-divider: rgba(38, 54, 94, 0.07);
  /* 骨架品牌灰（与 divider 同语言） */
  --ww-skeleton: rgba(38, 54, 94, 0.08);
  /* 阴影 light 侧蓝黑化（dark 覆写值不变） */
  --ww-shadow-card: 0 1px 2px rgba(30, 44, 76, 0.06);
  --ww-shadow-overlay: 0 8px 24px rgba(23, 34, 60, 0.14);
  --ww-shadow-modal: 0 16px 48px rgba(23, 34, 60, 0.18);
```

### 3-2 dark 覆写块（整块替换 tokens.css 底部覆写块）

```css
/* ============================================================
 * 深色主题覆写 — Bluewash 自有 token 全集（v1.2.0 扩容，15 个）；
 * 其余仍经 var(--dsw-*) 由宿主自动翻转
 * ========================================================== */
body[data-ds-dark-theme] .dsh-wewrite-panel,
body[data-ds-dark-theme] .ww-sidebar-entry,
body[data-ds-dark-theme] .ww-overlay {
  /* L1 台面（蓝黑系，Linear dark 式色温） */
  --ww-bg-page: #1A1E26;
  --ww-surface-sunken: #20242E;
  --ww-canvas-well: #222734;
  --ww-border: rgba(151, 176, 231, 0.15);
  --ww-border-strong: rgba(151, 176, 231, 0.21);
  --ww-divider: rgba(151, 176, 231, 0.08);
  --ww-skeleton: rgba(151, 176, 231, 0.09);

  /* L2 选中底深蓝档 */
  --ww-accent-subtle: #1E2B4D;

  /* L3 识别色提亮档 */
  --ww-view-topics: #FB923C;
  --ww-view-schedule: #2DD4BF;
  --ww-rank-top: #FB923C;

  /* 既有 4 项不变 */
  --ww-accent-ring: rgba(103, 158, 254, 0.40);
  --ww-shadow-card: 0 1px 2px rgba(0, 0, 0, 0.40);
  --ww-shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.50);
  --ww-shadow-modal: 0 16px 48px rgba(0, 0, 0, 0.60);
}
```

---

## 4. 每视图应用映射（含组件 css / DOM 落点）

### 4-0 自动跟随（零组件改动，token 换值即生效）

| 视图/面 | 生效路径 |
|---|---|
| 全部台面 | `.ww-content` / `.ww-content--flush`（base.css）与 `.ww-rail`（rail.css）底 = bg-page → 蓝灰；顶栏融合底（topbar.css `.ww-topbar`）同 |
| 全部线框 | border/divider 新值贯穿 12 个 css 的全部 border 引用（卡/输入框/表头/分隔线） |
| 写作台 rail 选中行 | rail.css `.ww-rail-btn--active` 底 = accent-subtle → dark 下首次成立（#1E2B4D + accent #679EFE ≈5.2:1） |
| 写作台 rail 筛选 chip / 设置 nav 激活 / 关键词筛选钮 | accent-subtle 底同上自动修复 |
| 热榜命中行 | panels.css `.ww-hotspot--hit` 底 = accent-subtle（同上） |
| 编辑器选区 | editor.css `.cm-selectionBackground` = accent-subtle（同上） |
| 编辑器状态栏 / segmented 槽 / 表头类凹区 | surface-sunken 新值（蓝灰槽 on 蓝灰台，border 双保险构造不变） |
| 预览画布井 | preview.css `.ww-preview__frame` 底 = canvas-well 新值 |
| 暂停定时卡 / locked 区 | surface-sunken 新值 |
| 骨架屏全部 | skeleton 新值 |
| 浮层 | `.ww-overlay` 底 = bg-page；浮层阴影 overlay/modal light 侧蓝黑化 |
| 深色主题 | §3-2 覆写块全量 |

### 4-1 顶栏分段导航：域识别色激活（topbar.css + TopBar.tsx）

**DOM 增量**：`TopBar.tsx` 每个 `button.ww-tab` 加 `data-view="writing" | "topics" | "schedule"`（新属性，类名/结构/testid 不动）。

```css
/* topbar.css 末尾追加（Bluewash §4-1）：
 * 激活段按域分色：写作=accent 蓝（默认，含设置页兜底）/ 选题=热力橙 / 定时=青。
 * 激活片本身仍是 surface 白底+微影（识别色只染文字与 icon，微面积纪律）。 */
.ww-tab--active[data-view='topics'] { color: var(--ww-view-topics); }
.ww-tab--active[data-view='topics'] svg { color: var(--ww-view-topics); }
.ww-tab--active[data-view='topics']:hover { color: var(--ww-view-topics); }
.ww-tab--active[data-view='topics']:hover svg { color: var(--ww-view-topics); }

.ww-tab--active[data-view='schedule'] { color: var(--ww-view-schedule); }
.ww-tab--active[data-view='schedule'] svg { color: var(--ww-view-schedule); }
.ww-tab--active[data-view='schedule']:hover { color: var(--ww-view-schedule); }
.ww-tab--active[data-view='schedule']:hover svg { color: var(--ww-view-schedule); }
```

（默认 `.ww-tab--active` = accent 不动，写作/设置走默认；hover 稳定规则同既有限定性写法，防止通用 :hover 刷回。）

### 4-2 页头识别点（base.css + 各页 pagebar）

**DOM 增量**：各页 `.ww-pagebar` 标题前加 `<span class="ww-pagebar__dot" data-view="…"/>`（新元素，无结构改动；不想要的页面不加即无点）。只给三个域页加（写作/选题/定时），设置页不加。

```css
/* base.css pagebar 段追加（Bluewash §4-2）：8px 域识别点，圆点不是侧条 */
.ww-pagebar__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ww-radius-full);
  background: var(--ww-accent);          /* 写作域默认；data-view 变体覆盖 */
}
.ww-pagebar__dot[data-view='topics'] { background: var(--ww-view-topics); }
.ww-pagebar__dot[data-view='schedule'] { background: var(--ww-view-schedule); }
```

（`.ww-pagebar` 已是 flex + gap 12px，dot 自然落位标题左侧；纯 CSS 圆点，非图标、非 emoji。）

### 4-3 热榜 Top3 名次（panels.css + hotspots-panel.tsx）

**DOM 增量**：rank ≤ 3 的 `.ww-hotspot__rank` 追加修饰类 `ww-hotspot__rank--top`（rank span 已有类，只加修饰）。

```css
/* panels.css 热榜段追加（Bluewash §4-3）：Top3 名次橙 + 500 字重；
 * 4+ 保持 fg-tertiary/400。双色数据节奏：蓝=命中行底，橙=热度名次。 */
.ww-hotspot__rank--top {
  color: var(--ww-rank-top);
  font-weight: var(--ww-weight-medium);
}
```

### 4-4 品牌时刻 glyph（workbench.css + states.css）

```css
/* workbench.css：启动卡 glyph 升级品牌（首屏零文章时的品牌浸染时刻） */
.ww-startup__glyph {
  background: var(--ww-accent-subtle);   /* 原 --ww-surface-sunken */
  color: var(--ww-accent);               /* 原 --ww-fg-secondary */
}

/* states.css：hero 空态 glyph 同语言；次级空态 glyph 保持 sunken（安静）。
 * DOM 增量：hero 空态（.ww-empty--hero 内）的 glyph span 加修饰类
 * ww-empty__glyph--brand；默认 .ww-empty__glyph 不动。 */
.ww-empty__glyph--brand {
  background: var(--ww-accent-subtle);
  color: var(--ww-accent);
}
```

（`.ww-startup__glyph-sub` / `.ww-empty__glyph-sub` 的遮罩底 bg-page 自动换新值，无需改。）

### 4-5 侧边栏入口品牌锚（overlay.css）

```css
/* overlay.css sidebar entry 段追加（Bluewash §4-5）：
 * 入口 icon 染品牌蓝——宿主灰 footer 里的品牌锚点（Linear/Slack 嵌入面板先例）。
 * 文字保持 --ww-fg（chrome 语境不整行变色）。 */
.ww-sidebar-entry__btn svg { color: var(--ww-accent); }
```

（wide 16px 与 rail 20px icon 同染；hover/active 态不变。）

### 4-6 每视图一眼变化速查（Jerry 转述用）

| 视图 | 一眼变化 |
|---|---|
| 写作台 | 台面整体变品牌蓝灰（不再纯白纸感）；启动卡圆标变蓝底蓝图标；rail 选中行浅蓝 |
| 选题中心 | 激活 Tab 变热力橙；页头橙点；Top3 名次橙色，命中行浅蓝——双色榜单 |
| 定时 | 激活 Tab 变青；页头青点 |
| 编辑器 | 页头/状态栏带蓝灰台面温；编辑区与预览画布仍是白纸（纸面不染） |
| 设置 | 无识别色；激活导航浅蓝底 |
| 侧边栏入口 | 「写作台」icon 品牌蓝 |
| 深色主题 | 台面蓝黑色温、选中深蓝、边框微蓝——与浅色同套设计 |

---

## 5. 对比度与可感知度核算

正文/文字色全部未动（fg 族保持，≈17:1 / 4.9:1 等既有达标值不变）。本轮涉及的核算：

| 组合 | 结果 |
|---|---|
| view-topics #C2410C on surface #FFF（14px Tab 文字） | ≈5.2:1 ✓ |
| view-schedule #0F766E on #FFF | ≈5.5:1 ✓ |
| rank-top #C2410C on surface #FFF（13px mono 名次） | ≈5.2:1 ✓ |
| rank-top #C2410C on 命中行 accent-subtle #EDF3FE | ≈4.7:1 ✓（13px 数据字，500 字重加持） |
| dark view-topics #FB923C on surface #2C2C2E | ≈6.2:1 ✓ |
| dark view-schedule #2DD4BF on #2C2C2E | ≈7.5:1 ✓ |
| dark rank-top #FB923C on 暗命中行 #1E2B4D | ≈6.1:1 ✓ |
| dark accent #679EFE on accent-subtle #1E2B4D（rail 选中行文字） | ≈5.2:1 ✓ |
| dark fg #F9FAFB on #1E2B4D | ≈13:1 ✓ |
| border rgba(38,54,94,.13) on #FFF（叠色 #E3E5EA）vs 旧 rgba(0,0,0,.10)（#E6E6E6） | 等可见度（色温增益、亮度不回退）✓ |
| dark border rgba(151,176,231,.15) on #2C2C2E（叠色 ≈#3C4457）vs 旧 rgba(255,255,255,.12)（≈#545456） | 略深于旧值但带蓝调；边框可感知度靠线宽+位置冗余（宿主语言同款）✓ |
| bg-page #F2F4F8 上 surface #FFF 卡 | ΔL 较原 #F9FAFB 加大，卡更「浮」✓ |
| sunken #EBEEF5 槽 on bg-page #F2F4F8（topbar 槽构造） | 槽深一档 + border 双保险（既有构造语言依赖不变）✓ |

---

## 6. 反廉价清单（Bluewash 红线，评审按此逐条扫）

1. **零 gradient**：tint 全部纯色平涂（stylelint declaration-property-value-disallowed-list 已禁，构造保证）。
2. **紫粉四色零出现**：#7C3AED / #A855F7 / #EC4899 / #6366F1 不进任何值（识别色为橙/青，与禁区无交集）。
3. **禁暖奶油底**：台面 tint 是冷蓝 hue 219（明令规避 warm-neutral L 0.84-0.97 / C<0.06 / hue 40-100 色带）——Bluewash 是「冷纸感」不是「米色纸张感」。
4. **识别色微面积纪律**：view 色只染 Tab 激活文字+icon、页头 8px 点、（rank-top）名次数字。**永不染**卡片底/页面底/大块区域——识别色大面积 = 幼儿园风。
5. **识别点不是侧条**：8px 圆点，非 border-left 彩条（红线 #1：>1px 彩色侧边条禁令；rail 2px 指示条为 v0.2 契约冻结项，不新增同类）。
6. **色相预算**：同屏非中性色相 ≤2 种（蓝 + 当前域识别色；热榜页蓝+橙）。出现第三色相即违规。
7. **语义色与识别色不混用**：状态永远是 success/warn/danger/info；识别色永远不做状态表达（橙 ≠ 警告、青 ≠ 成功）。
8. **纸面不染**：编辑器表面/预览画布/输入框内部保持白（dark 保持宿主灰）。tint 出现在纸面 = 违反「台面染纸面白」原则。
9. **不做彩虹榜**：Top3 同色不分金银铜（奖牌色系 = 体育 App 味）。
10. **不追平宿主 chrome**：宿主会话栏/tab 环保持原样；域边界色温差是特性不是 bug，但差异只有一个维度（色温），不允许出现亮度跳变。

---

## 7. 13 点自检表（设计系统 8 + 质量 5）

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 所有颜色通过 Design Token 引用 | 通过 | 全部新色进 token（3 新增 + 11 修改），§4 组件触点全 var(--ww-*)；文档 hex 为 token 定义值与核算注记 |
| 2 | 间距 4px 整数倍 | 通过（零变化） | 本轮零间距改动；pagebar__dot 8px 为新元素尺寸（icon 级微件，同 glyph 40/32 先例类目） |
| 3 | 字体三栈 | 通过（继承） | 零字体声明变化 |
| 4 | 标题/正文/等宽层级 | 通过（零变化） | 零字号/字重体系改动（rank-top 的 500 为数据字重，mono 体系内） |
| 5 | Hero 真实内容 | 不适用 | Product 寄存器工具 UI（既有结论） |
| 6 | 对标一致 | 通过 | Linear light 冷调台面 + Stripe 品牌浸染（§1-1 裁决）；与 v0.2-v0.3 线框分层语言完全兼容（border 三档结构不动，只换色温） |
| 7 | 按钮状态 | 通过（零变化） | 全部交互态样式不动（accent 家族原样） |
| 8 | 表单/空态 | 通过 | 空态 glyph 升级品牌为纯增量（新修饰类），四态件结构不动 |
| 9 | 图标库统一 | 通过 | 零新图标；识别点是 CSS 圆点非图标 |
| 10 | 无纯黑/纯灰直用 | 通过 | tint 化方向正是「给灰加色温」；dark 阴影纯黑系为既有覆写值（暗色 hue 无感知） |
| 11 | 对比度/动画/reduced-motion | 通过 | §5 全表达标；零新动效（Motion=3 不变）；reduced-motion 块不需更新 |
| 12 | 响应式/触摸 | 通过（零变化） | 零布局改动；dot 8px 非触摸目标（装饰件，随标题流） |
| 13 | 状态矩阵 | 通过（零变化） | 全部组件状态机不动，仅底色/边框色值换血 |

## 8. P0 三规则自查声明

1. **无 emoji 作为功能图标**：零新图标；pagebar dot 为 CSS 圆点；文档无 U+1F300-1F9FF / U+2600-26FF / U+2700-27BF 字符。
2. **无紫粉渐变**：零 gradient 定义；紫粉四色零出现；全部新值为纯色平涂。
3. **无 AI 模板味**：无空洞占位（全部文案既有）；无硬编码颜色（组件层零裸 hex，唯一裸值在 tokens.css token 定义处——token 即真源，合规）；识别色微面积纪律 + 反廉价清单 §6 十条构造保证。

## 9. 施工落点汇总（给前端）

| 改动 | 文件 | 性质 |
|---|---|---|
| token 值替换 + §14 新段 + dark 覆写块整块替换 | `src/client/styles/tokens.css` | §3 全文可照抄 |
| Tab data-view 属性 + 激活段分色 | `TopBar.tsx`（属性）+ `topbar.css`（§4-1 追加） | DOM 新增属性，契约安全 |
| pagebar 识别点 | 各域页 pagebar JSX（新 span）+ `base.css`（§4-2 追加） | DOM 新增元素 |
| rank Top3 修饰类 | `hotspots-panel.tsx`（修饰类）+ `panels.css`（§4-3 追加） | DOM 新增修饰类 |
| 启动卡/hero 空态 glyph | `workbench.css` / `states.css`（§4-4）+ hero glyph 加修饰类 | 一处 DOM 修饰类 |
| 侧边栏入口 icon 蓝 | `overlay.css`（§4-5 追加一行） | 纯 CSS |
| design-tokens.json v1.2.0 | `docs/design/design-tokens.json` | 与 tokens.css 一一对应 |
| E2E/回归 | 既有锚点全部不受影响（零改名零结构改）；可选新增断言：dark 下 rail 选中行底色 | advisory |
