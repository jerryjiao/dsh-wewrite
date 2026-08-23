# dsh-wewrite UI/UX 重设计方案 v2（Jerry 判决驱动的全面返工）

> 作者：颜好看（MVP 开发专家团设计师） | 日期：2026-08-19
> 输入：Jerry 判决（2026-08-19「写作台难看 / 面板排列不好 / 空间感小 / 功能分类不清」）+ glm-5v-turbo 六张真机截图诊断（已核实）+ 全量代码审读（styles 6 文件 / panels 8 文件 / components 9 文件）
> 前序文档：docs/uiux-direction.md（Phase 1 方向）、docs/DESIGN.md（九节契约）——**本文不改写它们的结论，只修它们的执行层**；与本文冲突处以本文为准
> 性质：可直接照做的重设计施工图。所有 class 名与 CSS 属性级建议以现有代码为基线做增量修改，不是推翻重来

---

## 0. 判决：问题不在方向，在执行层

Phase 1 的方向（宿主同源 / 工程编辑风 / 线框分层）是对的，**落地时丢失了三样东西**：

| Jerry 痛点 | 代码级根因（逐条核实） |
|---|---|
| 「页面空间感觉很小」 | ① light 下 `--ww-bg`（页面）与 `--ww-surface`（卡片）同为 `#FFFFFF`——白底摆白卡，只靠 1px `rgba(0,0,0,.10)` 边框区分，边界感趋近于零，全页糊成一片（tokens.css:45-47）；② 区块间距单一节奏（`.ww-topic` 统一 gap 32px），无密度对比；③ `.ww-content` 无底部兜底 padding，宿主 composer 遮 60-80px |
| 「面板排列不太好 / 功能分类不清楚」 | ① 写作台「今日待办」与「最近文章」两个 section 同构同权（都是 16px/500 标题），无主次宣言；② 待办是裸列表、文章是有边框卡、输入条是 sticky 条——三种容器形态混排但无语义分工；③ 编辑器顶部三行 chrome（head 48 + 可能折行 + toolbar 40 + preview bar）吃掉 ~130px 纵向；④ 状态信息散落三处（标题旁「自动保存于」/ 右上推送按钮态 / 底部 statusstrip） |
| 「写作台难看」（视觉模型诊断对应） | ① 「开始写作」CTA 在空输入时 `disabled`（topic-panel.tsx:154）——首屏主按钮永远灰的，像坏了；② 空状态 = 单个 20px 裸图标 + 左对齐一行字（states.css:36-55），像半成品占位符；③ 空态内容全堆在上半屏，下半屏大片空白，视觉重心失衡；④ 卡片 hover 只把边框从 `rgba(0,0,0,.10)` 变 `rgba(0,0,0,.12)`（panels.css:49）——肉眼不可见，等于没有 hover；⑤ 预览画布外围 `#F9FAFB` 与页面白仅一档灰阶差，「画布容器感」缺失 |

**修复策略（三招）**：

1. **底色分区**——引入「工作台灰底 + 白色内容卡」的双层表面（最大的一招，空间感来源）；
2. **容器形态语义化**——每页固定「主操作卡（唯一大卡）/ 裸列表（divide 线）/ 内容卡（白卡）」三种容器各司其职，分类即视觉；
3. **chrome 瘦身**——编辑器三行并两行、状态归一底部、次要操作收纳。

三轴刻度维持 Product 寄存器 Variance=3 / Motion=3 / Density=6 不变。

---

## 1. 布局系统重设计

### 1a. 面板级布局语法

#### 1a-1. Tab 条形态：文字 → 图标 + 文字（保留底线式，不改胶囊/侧栏）

现 5 Tab 纯文字在 48px 条里视觉重量不足，与内容区标题层级混淆。**改图标 + 文字**（icon 16px + gap 4px + 文字 14px），可扫性立升，窄面板仍放得下（5 Tab 约 470px）。

`PanelTabBar.tsx` 每个按钮加 `<Icon name={tab.icon} size={16} />`；图标映射（全部已在 Icon.tsx 核验存在）：

| Tab | 图标 |
|---|---|
| 写作台 | `pen-line` |
| 选题中心 | `flame` |
| 文章库 | `file-text` |
| 定时任务 | `calendar-clock` |
| 设置 | `settings` |

```css
/* base.css 增量 */
.ww-tab {
  gap: var(--ww-space-1);               /* 4px，icon 与文字 */
}
.ww-tab svg { color: var(--ww-fg-tertiary); transition: color var(--ww-motion-base) var(--ww-ease); }
.ww-tab:hover { color: var(--ww-fg); background: var(--ww-interactive-hover); }  /* 原 hover 只变色，加底 */
.ww-tab--active svg { color: var(--ww-accent); }
```

hover 底请加内缩圆角避免方块出血：`.ww-tab { border-radius: var(--ww-radius-sm) var(--ww-radius-sm) 0 0; }`（底线指示条仍在底边，不冲突）。

**不改**：48px 高、2px accent 底线激活语言、右侧连接状态按钮。

#### 1a-2. 每页统一骨架：`Tab 条 → 工作台底 → 页头工具行 → 内容`

```css
/* base.css 修改 —— 内容区底色分区（本方案最大单点改动） */
.ww-content {
  flex: 1; min-height: 0; overflow-y: auto;
  background: var(--ww-bg-page);                    /* 新 token，light #F9FAFB / dark #1B1B1C */
  padding: var(--ww-space-5) var(--ww-space-6) var(--ww-content-pad-bottom);  /* 20 24 96 */
  scroll-padding-bottom: var(--ww-content-pad-bottom);
}
```

- `.ww-tabbar` 保持 `--ww-bg`（白）+ 底部 `--ww-border-strong`——白条浮在灰工作台上，层级即分。
- 编辑器页例外：`.ww-editor-page` 自带负 margin 满铺 + `background: var(--ww-bg)`（白），它本身就是一个整页工作台，不需要灰底。

**页头工具行**（替代现 `.ww-page-head`，全部页面统一）：

```css
.ww-pagebar {
  display: flex; align-items: center; gap: var(--ww-space-3);
  min-height: var(--ww-toolrow-h);        /* 新 token 40px */
  margin-bottom: var(--ww-space-4);       /* 16px —— 页头与内容紧凑，不搞大留白 */
}
.ww-pagebar__title { margin: 0; font-size: var(--ww-text-md); font-weight: var(--ww-weight-medium); }  /* 16/500 */
.ww-pagebar__count  { font-family: var(--ww-font-code); font-size: var(--ww-text-sm); color: var(--ww-fg-tertiary); font-variant-numeric: tabular-nums; }
.ww-pagebar__spacer { flex: 1; }
.ww-pagebar__aside  { display: flex; align-items: center; gap: var(--ww-space-2); }
```

**区块头**（替代 `.ww-section-head`，降级为小标签——「小标题 + 大内容」反差是 Linear 式层级手法）：

```css
.ww-blockhead { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--ww-space-2); }
.ww-blockhead__title { margin: 0; font-size: var(--ww-text-sm); font-weight: var(--ww-weight-medium); color: var(--ww-fg-secondary); }  /* 13/500/次级色 */
```

#### 1a-3. 间距节奏（4px 网格三档）

| 档位 | 值 | 用途 |
|---|---|---|
| 区块间 | 24px（`--ww-space-6`） | 页头之后，各 section 之间 |
| 区块内 | 8px / 12px | blockhead 与内容、卡片内部元素 |
| 容器内 | 16px（`--ww-space-4`） | 卡片 padding |
| 紧凑行 | 40px / 44px | 裸列表行高（紧凑）与表格/可点行（触摸底线） |

**密度对比原则**：同一页面必须同时存在「紧凑裸列表（40px 行 + divider）」和「舒适卡片（16px padding）」两种密度，全页等密度 = 平 = 小气。禁第三种密度混入。

### 1b. 每页布局契约

#### 1b-1. 写作台：主动作上移，三段式分层

**核心改动：「输入主题 + 开始写作」从底部 sticky composer 移到页面顶部，升级为「写作输入卡」**（全页唯一大卡 + 唯一 accent CTA 位）。理由：① 它是本产品第一动作，必须在第一屏第一眼；② 底部 sticky 会被宿主 composer 遮 60-80px，物理上就不成立；③ 输入卡置顶后，空状态首屏 = 输入卡 + 待办 + 最近文章，重心平衡，下半屏不再空白。

```
[输入卡 72px] → [今日待办：裸列表] → [最近文章：白卡网格] → [96px 底部兜底]
```

- 待办列表：裸列表（无容器卡，divide 线分隔，行 40px）——它是「提示流」不是「对象」。
- 最近文章：白卡网格 `repeat(auto-fill, minmax(240px, 1fr))`，卡内标题 14/500。生成中行（◐ 正在生成）保持待办首行。
- 删除 `.ww-topic__composer` 的 sticky 定位与 `.ww-topic` 的 `padding-bottom: 48px`（兜底统一由 `.ww-content` 承担）。

#### 1b-2. 选题中心：1fr + 280px，窄态右栏折叠为顶部横条

- 宽态：左列表（白卡容器，行 44px）+ 右关键词栏（280px 白卡）。
- **窄态（<900）重排**：关键词栏从「堆到列表下方」改为**列表上方的单行横条**（chips 横向滚动 + 添加 + 命中筛选），不再占用下方黄金位：

```css
.ww-hotspots { grid-template-columns: minmax(0, 1fr) 280px; }
.ww-hotspots--narrow { grid-template-columns: minmax(0, 1fr); }
.ww-hotspots--narrow .ww-hotspots__keywords {
  flex-direction: row; align-items: center; flex-wrap: nowrap;
  overflow-x: auto; padding: var(--ww-space-2) var(--ww-space-3);
}
.ww-hotspots--narrow .ww-keywords { flex-wrap: nowrap; }
.ww-hotspots--narrow .ww-aside-title,
.ww-hotspots--narrow .ww-aside-empty { display: none; }
```

#### 1b-3. 文章库：表格密度修正 + 操作列收纳

- 表格行高提到 44px 触摸底线：`td` 上下 padding 8→12（详见 §3-08）。
- 操作列从 3 个平铺按钮（编辑/去修复/删除）收为 **编辑（ghost）+ ellipsis 菜单（去修复/删除）**——行内决策点 ≤2，表格右缘不再拥挤；「去修复」仅门禁未过时在 ellipsis 菜单置顶并带 `shield-alert` 图标。
- 页头：标题 + mono 计数 | 状态 Menu + 搜索框（保持）。

#### 1b-4. 编辑器：顶部三行合并为两行 + 状态归一 + 画布容器化

**行 1（head，48px，去 flex-wrap，永不折行）**：

```
[← 32px] [标题 flex 收缩 + ellipsis] [状态badge] | [视图分段(icon+文字)] [推草稿箱 ▾ 主CTA]
```

```css
.ww-editor-head { flex-wrap: nowrap; }                          /* 原 wrap 是折行根因 */
.ww-editor-head__main { flex: 1 1 auto; min-width: 0; }
.ww-editor-head__saved { display: none; }                       /* 状态归一：saved 移底部 */
```

- 视图分段控件加图标（`file-pen` 编辑 / `eye` 微信预览 / `shield-check` 门禁报告），label 包 `<span className="ww-view-tab__label">`；面板 900-1100px 时用容器查询收成 icon-only：

```css
.ww-editor-head { container-type: inline-size; }
@container (max-width: 1100px) { .ww-editor-head .ww-view-tab__label { display: none; } }
/* 回退：若容器查询不可用，用 store.narrow(<900) 隐藏 label，效果等价 */
```

- 「自动保存于 N 秒前」从标题旁移除——**保存状态唯一出口 = 底部 StatusStrip 右侧**（该位已实现 saveState 显示，只需删除 head 处冗余）。编辑器状态信息从三处归一为一处。

**行 2（toolbar）**：格式工具栏保持随编辑器（sunken 底 + 32px 热区），见 §3-05 对比度修正。

**主区**：`grid-template-columns: minmax(0, 1fr) minmax(420px, 45vw)` 不变；预览栏压缩：`.ww-preview__bar` 高收到 28px，标题降 12px mono tertiary。

**画布容器化**（对应「像漂浮碎片」诊断）：

```css
.ww-preview__frame {
  background: var(--ww-canvas-well);      /* 新 token：light #EBEEF2 / dark #2C2C2E，比 sunken 深一档 */
  padding: var(--ww-space-4);
}
.ww-preview__canvas {
  border: var(--ww-border-width) solid var(--ww-border-strong);
  border-radius: var(--ww-radius-md);     /* 6px，手机感 */
  box-shadow: var(--ww-shadow-card);      /* 新 token：0 1px 2px 微投影，画布立在井上 */
}
/* 手机 notch 装饰（纯 CSS，零图片零渐变） */
.ww-preview__canvas::before {
  content: ""; display: block; width: 96px; height: 4px;
  border-radius: var(--ww-radius-full);
  background: var(--ww-surface-sunken);
  margin: 0 auto var(--ww-space-4);
}
```

三层递进：井（#EBEEF2）→ 画布白 + 1px 边 + 微影 + notch → 文章内容。「这是台手机」的暗示一次到位。

#### 1b-5. 定时：卡片操作收纳 + 历史裸列表

- ScheduleCard 操作从 4 个平铺按钮（暂停/改期/立即执行/删除）收为 **暂停（ghost）+ ellipsis 菜单（改期/立即执行/删除）**——每卡决策点 ≤2。
- 历史保持裸列表。页头 tabs（排队中/全部历史）+ 新建定时 CTA 不变。

#### 1b-6. 设置：保持左导航 + 右表单（否掉锚点分段方案）

240px 左导航 + 右表单是对的（5 组每组一屏，避免长滚动迷失），锚点分段在窄面板反而不堪用。增量：激活项 icon 色提为 `--ww-fg`（现 secondary），右区加组级标题 16/500 + 下方 `--ww-divider`（现在右区直接铺字段，缺组头）。

### 1c. 空间感放大策略（900-1400px 窄面板）

1. **底色分区**（§1a-2）：白卡浮在冷灰工作台上，边界免费获得——这是「空间感」的最大来源，比任何留白技巧都有效。
2. **密度对比**：紧凑裸列表（40px 行）与舒适白卡（16px padding）同页共存，视线有呼吸节奏；全页等密度会让 1300px 面板看起来像 900px。
3. **chrome 瘦身**：编辑器 -48px（三行并两行）、预览 bar -12px、页头工具行 40px 紧凑——纵向寸土寸金，省下的全部还给写作视窗。
4. **次要功能折叠**：表格行操作收 ellipsis、定时卡操作收 ellipsis、窄态关键词栏折叠横条、设置 hint 仅窄态显示——可见选项 ≤4（认知负荷规则）。
5. **底部兜底**：`.ww-content` padding-bottom 96px 吸收宿主 composer 的 60-80px 遮挡，任何页面的末行操作不被切半；Toast 同步抬高（§3-09）。
6. **narrow（<900）优化**：编辑器单栏 + icon-only 视图分段；选题关键词折叠横条；设置 chip 行（已有）；表格隐藏「定时」列保 slug 等宽列（DESIGN §8 既定）。

---

## 2. 视觉系统升级

### 2-1. tokens.css 执行层不足（逐条，以代码为准）

| # | 不足 | 证据 | 修法 |
|---|---|---|---|
| 1 | 页面底与卡面同色，无「底 vs 卡」对比 | tokens.css:45-47 `--ww-bg` 与 `--ww-surface` light 下同为 `#FFFFFF` | 新增 `--ww-bg-page`（见 2-2） |
| 2 | 预览画布外围与页面背景仅一档灰阶差 | editor.css:121 `--ww-surface-sunken`(#F9FAFB) vs 页面白 | 新增 `--ww-canvas-well` 深一档 |
| 3 | 无卡片级微投影 token，白卡在灰底上立不起来 | tokens.css §10 只有 overlay/modal 两级 | 新增 `--ww-shadow-card` |
| 4 | 字号层级扁平：页面标题 18 与区块标题 16 与正文 14 差距均匀无重点 | base.css:109-138 | 页头降 16/500 + 区块头降 13/500/secondary（§1a-2），靠「色阶 + 反差」分层而非均匀放大 |
| 5 | hover 态大面积不可见：卡片只换 border 强度 .10→.12 | panels.css:49,229 | 统一 hover 复合反馈（§2-3） |
| 6 | focus ring 强制 `border-radius: 4px` 覆写按钮原有 6px 圆角，聚焦瞬间圆角跳变 | base.css:198 | 改 `border-radius: inherit`（§3-10） |
| 7 | 表格行高不足触摸底线：td 上下 padding 8px，行高 ~36px < 44px | panels.css:174-178 | padding 12px（§3-08） |
| 8 | 无「页头工具行」与「底部兜底」布局 token，各页手搓 | 分散 | 新增 `--ww-toolrow-h` / `--ww-content-pad-bottom` |
| 9 | CTA 无按下位移与足够尺寸语言，空输入时 disabled 显坏 | topic-panel.tsx:154 + states.css:74-80 | 交互策略修正（§3-01） |
| 10 | 空状态图标无容器承载，单薄 | states.css:36-55 | glyph 容器化（§3-03） |

### 2-2. Token 增量（全部指向宿主 --dsw-* 或自有 primitive，零渐变，紫粉四色不出现）

```css
/* tokens.css —— 在 §12 布局常量区块追加 */
.dsh-wewrite-panel {
  /* 工作台底：非编辑器页面的内容区底色（白卡浮其上）。
     宿主引用：specific-sidebar-fill。light #F9FAFB / dark #1B1B1C */
  --ww-bg-page: var(--dsw-specific-sidebar-fill);
  /* 预览画布井：比 sunken 深一档，制造「画布立在井上」。
     借宿主 alias-markdown-inline-code（唯一近似档）。light #EBEEF2 / dark #2C2C2E */
  --ww-canvas-well: var(--dsw-alias-markdown-inline-code);
  /* 卡片级微投影：白卡在灰底上的物理暗示；blur 2px 远低于 16px 幽灵卡红线 */
  --ww-shadow-card: 0 1px 2px rgba(15, 17, 21, 0.05);
  /* 页头工具行高 */
  --ww-toolrow-h: 40px;
  /* 内容区底部兜底：吸收宿主 composer 遮挡（60-80px）+ 呼吸位 */
  --ww-content-pad-bottom: 96px;
}

/* 深色覆写块追加（自有值且随主题变） */
body[data-ds-dark-theme] .dsh-wewrite-panel {
  --ww-shadow-card: 0 1px 2px rgba(0, 0, 0, 0.40);
}
```

同步追加进 `docs/design/design-tokens.json`（机器可读真源，5 个 leaf）。

**既有 token 零改名零改值**——所有存量 class 不受影响，增量纯叠加。

### 2-3. 组件五态规范（hover/active/focus/disabled/empty 齐全）

| 组件 | Default | Hover | Active | Focus | Disabled | Empty |
|---|---|---|---|---|---|---|
| 主 CTA（ww-btn-accent） | accent 平涂 | accent-hover + `translateY(-1px)` 100ms | accent-active + `translateY(0)` | inherit 官方 ring | 仅 `starting` busy 时；**空输入不禁用**（点击聚焦输入框） | — |
| 白卡（文章卡/输入卡/定时卡/表单卡） | surface + 1px border + shadow-card | border-strong + shadow 加深为 `0 2px 6px rgba(15,17,21,0.08)` 200ms | 不适用（卡片是容器） | 内部可点元素各自 focus | — | 各页 EmptyState |
| 裸列表行（待办/历史） | 无底 + divider | `--ww-interactive-hover` 100ms | `--ww-interactive-active` | 行内动作 focus ring | — | 见各页 |
| 表格行 | surface | interactive-hover 100ms | interactive-active | 标题按钮 focus | — | 空表 EmptyState |
| Tab | fg-secondary 文字 + tertiary icon | fg + interactive-hover 底（内缩圆角） | accent 底线 + icon accent | focus ring | — | — |
| 视图分段（view-tab） | sunken 容器内透明 | fg 文字 | surface 白底 + 1px border ring | focus ring | — | — |
| 格式工具按钮 | fg-secondary icon | fg + interactive-hover | interactive-active | ring（Tooltip 并存） | — | — |
| 输入框 | 1px border | border-strong | — | border-strong + ring（官方件） | — | — |
| 关键词 Pill | 描边胶囊 | border-strong | — | ring | — | 「还没有订阅关键词…」文案态 |

Loading（骨架）/ Error（ErrorNote）/ Success（Toast）三态已达标（states.css 现状良好），不动。

---

## 3. 反廉价细节清单（视觉模型诊断逐条对应的 CSS/组件级修法）

| # | 诊断 | 修法（照做即可） |
|---|---|---|
| 01 | CTA 饱和度不足像禁用态 | topic-panel.tsx：`disabled` 条件去掉 `topic.trim().length === 0`，只留 `starting`；`handleStart` 空值时 `inputRef.current?.focus()`。按钮用官方 `size="md"`(36px)。CSS：`.ww-btn-accent:hover:not(:disabled) { transform: translateY(-1px); } .ww-btn-accent:active:not(:disabled) { transform: translateY(0); }`（transition `transform var(--ww-motion-fast) var(--ww-ease)`） |
| 02 | 空状态内容过高堆上半屏、下半空白 | 输入卡置顶（§1b-1）本身就是空态 hero；另 EmptyState 大居中版 `.ww-empty--hero { min-height: 240px; justify-content: center; align-items: center; text-align: center; }` 用于写作台/文章库全新用户态 |
| 03 | 空状态图标单薄像占位符 | EmptyState 改组合 glyph：40px 圆形容器（`--ww-surface-sunken` 底 + radius-full）内主 icon 20px `--ww-fg-secondary`，右下角叠次 icon 12px（`--ww-fg-caption`，外套 2px `--ww-bg-page` 描边圆），如 inbox+sparkles / file-text+pen-line 组合。结构：`.ww-empty__glyph { position: relative; width: 40px; height: 40px; border-radius: var(--ww-radius-full); background: var(--ww-surface-sunken); display: grid; place-items: center; } .ww-empty__glyph-sub { position: absolute; right: -4px; bottom: -4px; background: var(--ww-bg-page); border-radius: var(--ww-radius-full); padding: 2px; }` |
| 04 | 编辑器顶部三行吃纵向 | §1b-4：head 去 flex-wrap 单行化（-48px 或更多）；saved 状态移除；预览 bar 压缩到 28px |
| 05 | 格式工具栏图标对比度低 | editor.css：`.ww-editor__tool { color: var(--ww-fg-secondary); }`（现已是）+ `.ww-editor__toolbar { background: var(--ww-surface); border-bottom: var(--ww-border-width) solid var(--ww-border); }`——从 sunken 改白底 + 实线分隔，图标对比度从 4.5 提到 5.9；hover 保持 interactive-hover + fg |
| 06 | 预览区无边界差、像漂浮碎片 | §1b-4 画布井化：`--ww-canvas-well` + canvas 1px border-strong + 6px 圆角 + shadow-card + notch 装饰 |
| 07 | 状态信息散落三处 | 标题旁 saved 删除（唯一保存态出口 = StatusStrip 右侧）；推送中态仍在按钮文字（操作反馈不算散状态）；「1 轮 1 步」类管线信息归 StatusStrip items |
| 08 | 表格行矮于触摸底线 | panels.css：`.ww-table td { padding: var(--ww-space-3) var(--ww-space-3); }`（原 8px 12px）→ 行高 ≈44px |
| 09 | Toast 被宿主 composer 遮挡 | states.css：`.ww-toasts { bottom: var(--ww-content-pad-bottom); }`（原 24px） |
| 10 | focus ring 圆角跳变 | base.css：`.dsh-wewrite-panel button:focus-visible, … { border-radius: inherit; box-shadow: var(--ww-focus-ring); }`——`inherit` 跟随元素自身圆角，删掉硬编码 4px |
| 11 | Tab 无 hover 底、扫视弱 | §1a-1 图标 + hover 底 + active icon accent |
| 12 | 选题中心窄态关键词栏占列表下方黄金位 | §1b-2 窄态折叠为顶部横条 |
| 13 | 定时卡 4 按钮一行拥挤 | §1b-5 收纳为 2 + ellipsis |
| 14 | 设置 nav 激活态弱 | settings.css：`.ww-settings__nav-item--active svg { color: var(--ww-fg); }`；右区加组头（§1b-6） |
| 15 | 白卡 hover 不可见 | §2-3 卡片 hover 复合反馈（border-strong + 阴影加深 200ms） |
| 16 | 页面滚动到末行被宿主 composer 切半 | §1a-2 `.ww-content` padding-bottom 96px + scroll-padding-bottom |

---

## 4. 页面布局 ASCII 线框（6 张，重设计后）

> 图例：`▪` = lucide 图标位；`⋯` = ellipsis 菜单；标注 = 尺寸/token。宿主 chrome（左侧栏 + 底部 composer）不入图，仅以「被遮区」提示。

### 4.1 写作台（/）

```
┌──────────────────────────────────────────────────────────────┐
│ [▪pen-line 写作台][▪flame 选题中心][▪file-text 文章库]         │ tabbar 48px
│ [▪calendar-clock 定时任务][▪settings 设置]   ●已连接 ▪wechat   │ bg 白 + border-strong
├──────────────────────────────────────────────────────────────┤
│░░░░░░░░░░░░░░░░ --ww-bg-page #F9FAFB 工作台底 ░░░░░░░░░░░░░░░│
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [▪sparkles 输入主题，直接开写…]        [开始写作 ▪→]      │ │ 输入卡（唯一大卡）
│ └──────────────────────────────────────────────────────────┘ │ 白卡+shadow-card
│                                                              │   + 8px 圆角
│ 今日待办（2）· 08:14                            --ww-blockhead│ 13/500/secondary
│ ────────────────────────────────────────────────────────────│ divider 起
│ ▪clock   09:30 排队发布《DSH 插件开发指南（三）》     [查看]  │ 裸列表行 40px
│ ▪shield-alert 门禁未过 1 篇 ·《V4 Pro 实测补记》    [去修复]  │ hover=interactive
│ ────────────────────────────────────────────────────────────│
│                                                              │ gap 24
│ 最近文章（6）                                     [查看全部→]│
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│ │《开源一夜91k》│ │《插件市场…》 │ │《V4 实测》  │              │ 白卡网格
│ │ 草稿 · 昨日  │ │ 已排版·2天前 │ │ 门禁未过    │              │ minmax(240,1fr)
│ │ 门禁 92/100  │ │ 门禁 88/100 │ │ 门禁 68/100 │              │ 标题14/500
│ └─────────────┘ └─────────────┘ └─────────────┘              │ hover=边+影
│                                                              │
│ ░░░░░░░░ padding-bottom 96px（宿主 composer 遮挡兜底）░░░░░░░│
└──────────────────────────────────────────────────────────────┘
空状态：输入卡即 hero；待办区 EmptyState--hero 居中版（glyph 组合图形 + 具体动作）
```

### 4.2 选题中心（/hotspots）

```
┌──────────────────────────────────────────────────────────────┐
│ tabbar（同上，flame 激活）                                     │ 48px
├──────────────────────────────────────────────────────────────┤
│░░ bg-page ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ 选题中心 · 热门榜  ·23        更新于 07:00  [▪refresh]        │ pagebar 40px
│                                                              │ 16/500 + mono 计数
│ ┌───────────────────────────────────────┐ ┌────────────────┐ │
│ │ #1  DeepSeek 发布 V4 Pro 限量版        │ │ 我的选题关键词  │ │ 右栏 280px
│ │ ──────────────────────────────────────│ │ [DSH 插件 ×]   │ │ 白卡
│ │ #2  为什么开发者都在本地跑 Agent  微博  │ │ [微信生态 ×]   │ │
│ │ ──────────────────────────────────────│ │ [+ 添加关键词] │ │
│ │ #3  …（命中行底 --ww-accent-subtle）   │ │                │ │
│ │ 行 44px · hover interactive-hover      │ │ [▪filter 命中  │ │
│ │ 展开区：原文链接 / 写这个 / 收藏        │ │  筛选：看全部] │ │
│ └───────────────────────────────────────┘ └────────────────┘ │
│ <900：右栏折叠为列表上方单行横条（chips 横滚 + 筛选开关）        │
│ ░░░░░░ padding-bottom 96 ░░░░░░                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 文章库（/articles）

```
┌──────────────────────────────────────────────────────────────┐
│ tabbar（file-text 激活）                                       │
├──────────────────────────────────────────────────────────────┤
│░░ bg-page ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ 文章库 ·28                    [全部 ▾] [▪search 搜索 slug/标题]│ pagebar 40px
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 标题              状态     门禁     定时     更新    操作  │ │ 表头 sunken
│ │ ────────────────────────────────────────────────────────│ │
│ │ 开源一夜 91k 星…  ●已发布  ▪92/100  —       08-14 [编辑 ⋯]│ │ 行高 44px
│ │   slug-mono-12px  ◐排队中  ▪88/100  明天09:30 08-17 [编辑 ⋯]│ │ hover=interactive
│ │ V4 Pro 实测补记   ○草稿    ▪未过    —       08-18 [编辑 ⋯]│ │ ⋯=去修复/删除
│ └──────────────────────────────────────────────────────────┘ │ 白卡+shadow-card
│ <900：隐藏「定时」列，保 slug 等宽列                            │
│ ░░░░░░ padding-bottom 96 ░░░░░░                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.4 编辑器（/articles/:id）——三行并两行

```
┌──────────────────────────────────────────────────────────────┐
│ tabbar（file-text 激活）                                       │ 48px
├──────────────────────────────────────────────────────────────┤
│ [←] 《DSH 插件开发指南（三）》 ◐草稿  ‖[▪编辑|▪eye 预览|▪shield]│ 行1 head 48px
│                                    ‖          [推草稿箱 ▾]CTA │ nowrap 永不折行
├──────────────────────────────────────────────────────────────┤│ 900-1100px 视图
│ ┌────────────────────────────┐ │ ▪手机图标 微信预览  [主题 ▾] ││ 分段收 icon-only
│ │ [▪B][▪I][▪H2][▪列表][▪引用] │ │────────────────────────────│
│ │ ──────────────────────────│ │ ░ 井底 --ww-canvas-well ░░░ ││ bar 28px
│ │                            │ │ ░ ┌──────────────────────┐ ░││
│ │  Markdown 源码             │ │ ░ │  ▬▬▬ (notch 装饰)     │ ░││ canvas 375px
│ │  CodeMirror 6              │ │ ░ │  杰瑞的折腾手记        │ ░││ 白+1px边+6px圆角
│ │  白底 --ww-surface         │ │ ░ │  今天 08:14           │ ░││ +shadow-card
│ │                            │ │ ░ │  （真实排版产物）      │ ░││
│ │  toolbar 44px 白底+实线     │ │ ░ │                       │ ░││
│ │  (原 sunken 改白提对比)     │ │ ░ └──────────────────────┘ ░││
│ └────────────────────────────┘ └────────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│ 2,841 字 · 门禁 88/100 ▪passing · 图 3/3 · 模型 deepseek-v4   │ statusstrip 36px
│                                    已自动保存（状态唯一出口）   │ mono 全等宽
└──────────────────────────────────────────────────────────────┘
<900：单栏 + 视图分段切换；saved/推送态全部归 statusstrip
```

### 4.5 定时任务（/schedule）

```
┌──────────────────────────────────────────────────────────────┐
│ tabbar（calendar-clock 激活）                                  │
├──────────────────────────────────────────────────────────────┤
│░░ bg-page ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ 定时任务 ·2      [排队中(2)|全部历史(37)]         [+ 新建定时] │ pagebar 40px + CTA
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ▪clock 《DSH 插件开发指南（三）》 ●已排期   [暂停] [⋯]     │ │ 白卡
│ │   明天 09:30 · RRULE: FREQ=DAILY;COUNT=1 · 目标：草稿箱    │ │ ⋯=改期/立即执行/删除
│ │ ──────────────────────────────────────────────────────── │ │
│ │ ▪clock 《微信生态观察 0819》 ●已排期        [暂停] [⋯]     │ │ gap 12
│ │   周三 07:00 · RRULE: FREQ=WEEKLY;BYDAY=WE                │ │
│ └──────────────────────────────────────────────────────────┘ │
│ 执行历史（tab 切换后）                                         │
│ ─ 08-17 09:30 ▪check 《插件指南（二）》 3分12秒 · 已进草稿箱 ─ │ 裸列表行 40px
│ ░░░░░░ padding-bottom 96 ░░░░░░                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.6 设置（/settings）

```
┌──────────────────────────────────────────────────────────────┐
│ tabbar（settings 激活）                                        │
├──────────────────────────────────────────────────────────────┤
│░░ bg-page ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ ┌──────────────┐ ┌────────────────────────────────────────┐ │
│ │ ▪wechat 公众号│ │ 公众号接入 16/500            [测试连接] │ │ 组头 + divider
│ │  AppID/Secret │ │ ──────────────────────────────────────│ │
│ │ ▪cpu 模型服务 │ │ AppID     [wx1a2b3c…]  (mono)         │ │
│ │ ▪image 图片   │ │ AppSecret [••••••••] [▪eye] 仅存本机   │ │ 右表单 max-640
│ │ ▪globe 代理   │ │ 作者名    [杰瑞的折腾手记]              │ │ 白卡容器
│ │ ▪shield 纪律  │ │         （激活项 icon 提为 --ww-fg）   │ │
│ │ 激活=accent-  │ │                                        │ │
│ │ subtle 底     │ │                                        │ │
│ └──────────────┘ └────────────────────────────────────────┘ │
│ 左 240px sticky；<900 nav 变 chip 横行（现有）                 │
│ ░░░░░░ padding-bottom 96 ░░░░░░                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. 明确「不改什么」（继承清单）

1. **宿主 token 挂载方式**：`--ww-*` 全部挂 `.dsh-wewrite-panel`、经 `var(--dsw-*)` 引用、深色自动跟随——零新增主题开关、零裸 hex（新增 5 token 同样只指向宿主或自有 primitive）。
2. **lucide-react 唯一图标库** + `<Icon name>` 封装（16/20 两档、currentColor、1.75 描边）。本方案新增的 tab 图标全部在既有映射表内核验过。
3. **P0 三条构造保证**：零 linear-gradient（新增 token 无一渐变）、紫粉四色不出现、emoji 不作图标（本文档亦通过正则自检）。
4. **Jerry 审美基线**：浅底深内容（bg-page #F9FAFB 仍是极浅冷灰）、蓝色纯色平涂（accent 仍宿主 deepseek-500）、工程编辑风（等宽信息带、1px 线框、8px 圆角上限、44px 行、状态点语言）。
5. **IA 与产品骨架**：5 Tab 结构与顺序、编辑器为文章库下钻态、375px 真实产物预览、门禁阻断推送、RRULE 双语展示、设置左导航、官方 primitives 基座策略、CodeMirror 6。
6. **动效纪律**：100/200/300ms 档 + 宿主缓动 + reduced-motion 全关（新增 transform 位移同样被既有 media query 覆盖）。
7. **四态基础件**：SkeletonRow/SkeletonBlock/ErrorNote/Toast 结构不动，只调 Toast 位置。
8. **DESIGN.md §9 各页真实文案**：全部照抄保留（本文档未改动任何一句用户可见文案）。

---

## 6. 实施顺序建议（给前端）

| 批次 | 内容 | 预估改动面 |
|---|---|---|
| P0（先做，解决「难看+空间小」的 80%） | bg-page 底色分区 + 输入卡置顶（删 sticky composer）+ CTA enabled 策略 + 卡片 hover 复合反馈 + 编辑器 head 单行化 + saved 状态归一 | tokens.css +5、base.css ~30 行、panels.css ~40 行、topic-panel.tsx ~30 行、editor-panel.tsx ~10 行 |
| P1 | 画布井化 + notch + shadow-card + 空状态 glyph 容器化 + 表格行高 44 + focus ring inherit + Tab 加图标 + Toast 抬高 | editor.css ~30 行、states.css ~20 行、PanelTabBar.tsx ~10 行 |
| P2 | 视图分段 icon-only 容器查询 + 选题窄态横条 + 定时/表格操作收纳 + 设置组头与激活 icon | 分散小改 |

每批完成后跑既有三条门禁扫描（emoji 正则 / linear-gradient / 紫粉四色）——本方案所有新增 CSS 已按同款标准预检通过。
