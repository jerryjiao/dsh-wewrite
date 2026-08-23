# dsh-wewrite v0.3 — 视觉规格（设计师交付）

> 作者：颜好看（MVP 开发专家团设计师） | 日期：2026-08-20
> 输入：uiux-v0.3.md（总监 delta，R1-R4）+ uiux-workbench-delta.md §1 DOM 契约 + uiux-polish-v0.2.1-design.md（本人前作）+ src/client/styles/ 全部 12 css 现状 + HotspotDigest.tsx / EditorWorkbench.tsx / hotspots-panel.tsx / Icon.tsx / bits.tsx 现状 + 宿主 cordis-panel footer badge CSS（@deepseek-ai/dsh-client-ui-cordis/lib/client.js 内联 CSS，实测摘录）+ 宿主 sidebar slot 契约（dsh-client-ui-sidebar slots.d.ts：`sidebar.footer.action({wide})`，false=56px rail）+ 宿主 overlay 挂载层（dsh-client-ui-layout client.js：`.overlayLayer{position:absolute;inset:0;z-index:20;pointer-events:none}`，子元素自动恢复 pointer-events）
> 性质：**可直接照抄进 CSS 的规格**。workbench-delta §1 冻结命名（`ww-topbar*` / `ww-rail*` / `ww-startup*` / `ww-workbench*` / `ww-view-tab*` / `ww-gate*` / `ww-progress-*` 等）零破坏；本文新面命名（`ww-hotspot__digest*` / `ww-rewrite-*` / `ww-sidebar-entry` / `ww-overlay*`）不在冻结清单，为前端+QA 新锚点。
> 寄存器/三轴：Product 寄存器，Variance=3 / Motion=3 / Density=6（workbench-delta 定稿，v0.2.1 沿用，本轮不变）。

---

## 0. 结论先行与硬约束总账

| 需求 | 本文章节 | 新增面 |
|---|---|---|
| R1 逐条 AI 速览 | §D1 | `ww-hotspot__digest` 行内嵌入块（无卡框） |
| R2 侧边栏直进 | §D3 | `ww-sidebar-entry`（wide/rail 双形态）+ `ww-overlay` 全屏浮层 |
| R3 AI 改写 | §D2 | `ww-rewrite-chip` + `ww-rewrite-popover` |
| R4 全局精修 | §D4 | 12 文件逐文件审计表（必改 4 / 建议 9 / 可缓 4） |

硬约束总账：

- **零渐变**：全文无 `linear-gradient` / `radial-gradient`（stylelint 双保险）。
- **零 emoji 图标**：全部 lucide 语义名经 `<Icon>` 封装；本轮新用名 `wand-sparkles` / `external-link` / `loader-circle` / `pen-line` / `check` / `eye-off` / `x` / `sparkles` 均已在 Icon.tsx 映射表内（Icon.tsx:79-149 逐名核验），**零映射表新增**。
- **零新依赖**；**零 DOM 契约改名**（冻结清单不动）。
- **新增 token 仅 1 个**：`--ww-radius-footer: 12px`（§D3，引用宿主 cordis badge 字面值，理由与落点见 §D3-4）。其余全部命中既有 token。
- **深浅双主题**：全部颜色走 `--ww-*`（经 `var(--dsw-*)` 自动翻转）；§D1 source 徽记刻意选**纯文字+icon 语言**（无底色），规避 `--ww-accent-subtle`（static 值不随主题翻转）在深色下的对比度风险。
- **Motion=3**：三个新面全部**无进入动效**（静态挂载）；唯二动效 = chip 浮现 100ms（即时反馈档，同 `.ww-hotspot__write` 既有语言）与既有 transition 继承。

**代码事实更正（给总监/advisory）**：v0.3 spec §3 称「CodeMirror 浮动格式工具条」——实测 EditorWorkbench.tsx:78-91 的格式工具条是**编辑器顶部 sticky 工具条**（`.ww-editor__toolbar`，editor.css:116-125，sticky top + z `--ww-z-sticky` 1100），非选区浮动条。因此 §D2 的避让对象是「顶部 sticky 工具条 + CodeMirror 滚动视口」，规格按此真相制定；若未来工具条改浮动再议。

---

## 1. §D1 逐条 AI 速览块（R1）

### 1-1 设计判定

速览块长在热榜行展开区内，是**行内嵌入件**，不是卡。与 v0.2.1 整卡 digest（已撤销）的本质区别：无独立边框、无阴影、无 hover 反馈——展开区的 `border-top`（panels.css:106）已提供分层，块内纯排版。这是 Density=6 下的正确密度：30 行榜单每行都可能展开一个速览，卡化会制造视觉噪音雪崩。

关键决策：

1. **source 徽记用纯文字+icon，不用底色 badge**。理由一：`--ww-accent-subtle` 是 static 值（tokens.css:37 注释，light/dark 均 #EDF3FE），深色主题下浅蓝底配 `--ww-fg` 近白文字对比度不足，纯文字方案双主题零风险。理由二：「读了原文 / 仅标题」是诚实标注不是状态宣告，安静语言更符合语义。
2. **头部 icon 用 `--ww-fg-tertiary` 不用 accent**。accent 预算：热榜页常态已有 filter chip（accent 文字）与命中行（accent-subtle 底）；速览块逐行出现，30 个 accent icon 会击穿「每屏 ≤2 处」预算。
3. **行渲染语言继承 v0.2.1 digest 卡**（lead 前缀 700 / `·` marker 缩进 / 13px 正文），但 class 全新命名（`ww-hotspot__digest-*`）——撤销项要求删净 `.ww-digest*` 族，不留半删残留。
4. **展开区垂直秩序：原文链接行在上、速览块在下**。链接是人工核实通道（确定性信息），速览是机器生成（概率信息），确定在上。

### 1-2 命名契约（新增，前端 + QA 新锚点）

| 元素 | 契约 |
|---|---|
| 块容器 | `div.ww-hotspot__digest`，data-testid `ww-hotspot-digest`；挂在 `.ww-hotspot__expand` 内第二位（原文链接行之后） |
| 头部行 | `div.ww-hotspot__digest-head` |
| 图标 | `span.ww-hotspot__digest-icon`（`wand-sparkles` 16px，`--ww-fg-tertiary`） |
| 标签 | `span.ww-hotspot__digest-label`「AI 速览」13px/500 |
| source 徽记 | `span.ww-hotspot__digest-source`，修饰类 `--article`（`check` 12px `--ww-success` + 「读了原文」）/ `--title`（`eye-off` 12px `--ww-fg-tertiary` + 「仅标题」）；data-testid `ww-hotspot-digest-source` |
| 时间 | `span.ww-hotspot__digest-time`（`formatTime` 12px `--ww-fg-caption`） |
| 正文 | `div.ww-hotspot__digest-body`，data-testid `ww-hotspot-digest-body` |
| lead 行 | `p.ww-hotspot__digest-lead`：前缀（含冒号）包 `<span class="ww-hotspot__digest-prefix">`（700） |
| 要点行 | `p.ww-hotspot__digest-point`：`<span class="ww-hotspot__digest-mark">·</span>` + 内容 span |
| 普通行 | `p`（裸） |
| 重试 | `button` 复用官方 `Button variant="outline" size="sm"`，data-testid `ww-hotspot-digest-retry` |

E2E 锚点对齐总监 spec §1（C07 逐条版）：source 标签 = `ww-hotspot-digest-source`，行结构锚点 = `ww-hotspot-digest-body`。

### 1-3 线框

```
├────────────────────────────────────────────────────────┤
│ #7  Some Framework Released ……  Hacker News ▪  ← 行（44px，hover 出「写这个」）
├────────────────────────────────────────────────────────┤ ← border-top divider
│ [▪external-link 原文链接（news.ycombinator.com）]          ← 既有 ww-link，保留
│                                                          ← gap 8
│ [✦wand] AI 速览  [✓读了原文]  12:04                       ← digest-head（28px min）
│ 这条在讲什么：某框架发布 v2，重写运行时并砍掉 X 依赖。        ← lead 行（前缀 700）
│ · 要点一：性能实测提升 40%，但破坏全部 v1 插件 API。         ← point 行
│ · 要点二：作者给出迁移指南，社区分叉已在路上。               ← point 行
├────────────────────────────────────────────────────────┤
 padding：0 16 12（expand 既有）；正文 13px / 1.7；head 内 gap 8
```

loading / error 态线框：

```
│ [✦wand] AI 速览                                         
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬               ← SkeletonBlock ×3（既有件）
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
│ ▬▬▬▬▬▬▬▬▬▬▬

│ [✦wand] AI 速览                                         
│ [▪circle-alert] 速览生成失败。      [重试]                ← ErrorNote（既有件）
│                （原因行）                                  + outline sm 按钮
```

### 1-4 可照抄 CSS（`src/client/styles/panels.css` 热榜段末尾追加；同时执行 §D4 中 panels.css 的 digest 段删除）

```css
/* ---------- 逐条 AI 速览块（v0.3 R1，uiux-v0.3-design §D1） ----------
 * 行内嵌入件：无卡框无阴影无 hover——分层由 .ww-hotspot__expand 的
 * border-top 提供。source 徽记纯文字+icon（--ww-accent-subtle 是 static
 * 值不随主题翻转，深色下底色方案有对比度风险，故不用底色）。 */

.ww-hotspot__digest {
  display: flex;
  flex-direction: column;
  gap: var(--ww-space-2);
  min-width: 0;
}

.ww-hotspot__digest-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;            /* 窄态徽记/时间自然折次行，不溢出 */
  gap: var(--ww-space-2);
  min-height: 28px;
}

.ww-hotspot__digest-icon { color: var(--ww-fg-tertiary); display: inline-flex; }

.ww-hotspot__digest-label {
  font-size: var(--ww-text-sm);
  font-weight: var(--ww-weight-medium);
  color: var(--ww-fg-secondary);
}

/* source 徽记：article = 读过原文（success icon 语义「已核实」）；
 * title = 仅标题降级（eye-off 语义「没看正文」，icon 降三级传降级感）。
 * 文字两态统一 fg-secondary（12px 徽记文字须达 4.5:1，fg-tertiary 仅 ≈3.9:1 不作小字正文色）；
 * 区分度 = icon 色 + 文案自说明。纯文字档无底色，深浅双主题零对比度风险。 */
.ww-hotspot__digest-source {
  display: inline-flex;
  align-items: center;
  gap: var(--ww-space-1);
  font-size: var(--ww-text-xs);
  color: var(--ww-fg-secondary);
  white-space: nowrap;
}

.ww-hotspot__digest-source--article svg { color: var(--ww-success); }

.ww-hotspot__digest-source--title svg { color: var(--ww-fg-tertiary); }

.ww-hotspot__digest-time {
  font-size: var(--ww-text-xs);
  color: var(--ww-fg-caption);
  margin-left: auto;          /* 时间靠右，与头部行左侧信息形成呼吸 */
  white-space: nowrap;
}

.ww-hotspot__digest-body {
  display: flex;
  flex-direction: column;
  gap: var(--ww-space-1);
  font-size: var(--ww-text-sm);
  line-height: var(--ww-leading-body);
  color: var(--ww-fg);
  overflow-wrap: break-word;  /* 长英文标题/域名安全断行 */
}

.ww-hotspot__digest-lead { margin: 0; }

.ww-hotspot__digest-prefix { font-weight: var(--ww-weight-bold); }

.ww-hotspot__digest-point {
  margin: 0;
  display: flex;
  gap: var(--ww-space-2);
  padding-left: var(--ww-space-2);
}

.ww-hotspot__digest-mark { color: var(--ww-fg-tertiary); flex: none; }

.ww-hotspot__digest-body > p { margin: 0; }
```

loading = `.ww-hotspot__digest-body` 内渲染 `SkeletonBlock lines={3}`；error = `.ww-hotspot__digest-body` 内渲染 `ErrorNote` + 重试按钮。四态基础件结构不动（继承 v0.2.1 同款纪律），不新写任何骨架/错误样式。

### 1-5 行渲染规则（纯文本行 → DOM，宽松匹配失败原样落正文行）

| 行特征 | 渲染 |
|---|---|
| 以 `这条在讲什么：` / `标题解读：` 开头 | `p.ww-hotspot__digest-lead`：前缀（含冒号）包 `<span class="ww-hotspot__digest-prefix">`（700），其余常规 `--ww-fg` |
| 以 `· ` 开头 | `p.ww-hotspot__digest-point`：剥掉 LLM 的 `·`，自渲染 marker `<span class="ww-hotspot__digest-mark">·</span>` 统一缩进 |
| 其余 | 裸 `p`（正文行） |

与 v0.2.1 整卡版的差异：**无 rank token、无 why 拆分**（逐条 digest 不含 `#n` 引用与 `—` 理由结构，v0.3 提示词输出为 lead + 2-4 行 `·` 要点），渲染器更简单。

### 1-6 状态矩阵（9 态）

| 状态 | 触发 | 视觉 |
|---|---|---|
| Empty（缓存命中前未生成） | 首次展开，自动触发生成 | 直接进 Loading（懒加载，无「空块」中间态） |
| Loading | 生成中（未缓存/重试） | head 正常渲染（无时间），body = `SkeletonBlock` ×3 |
| Ready | RPC 返回 / 缓存命中 | §1-4 全量渲染；head = 标签 + source 徽记 + 时间（`formatTime`） |
| Error | RPC 失败（llm-not-configured / digest-timeout / digest-empty / 供应商透传） | head 保留（上下文不丢），body = `ErrorNote` + 重试 outline sm；重试 = 重新触发生成 |
| source=article | host 抓取正文成功 | 徽记「读了原文」（check 12 success + 文字 fg-secondary） |
| source=title | 抓取失败静默降级 | 徽记「仅标题」（eye-off 12 tertiary + 文字 fg-tertiary）——降级不是错误，无警示色 |
| Default / Hover / Focus | — | 块本身无 hover 反馈（行内嵌入件）；键盘焦点走 base.css 全局 ring（作用于重试按钮） |
| Disabled | 不适用 | 块内无持久禁用控件 |
| Success | 即 Ready | 无独立 success 层（同 v0.2.1 纪律，不弹 Toast 打断浏览） |

进入动效：无（静态渲染挂载，Motion=3）。缓存命中同样无动效（内容即到）。

### 1-7 布局关系与宽窄态

- **与原文链接行**：链接行（`a.ww-link`）在前、速览块在后，两者间距 = `.ww-hotspot__expand` 既有 `gap: var(--ww-space-2)`（panels.css:106），不改容器。
- **宽态**：主列 `minmax(0,1fr)`，速览块随列宽自适应；`overflow-wrap: break-word` 兜长串。
- **窄态**（`ww-hotspots--narrow`，<900px）：关键词栏 `order:-1` 移走后主列全宽，速览块无特殊处理；head `flex-wrap: wrap` 让徽记与时间在极窄时折行。
- 缓存键按 URL（总监 spec §1 契约），同 URL 次日重生成——视觉上无 stale 层（整卡版的 stale chip 随整卡撤销，逐条版缓存过期即当无缓存走 Loading，语义更简单）。

### 1-8 参数 — token 对照表（D1 全量）

| 参数 | 值 | token |
|---|---|---|
| 块内行距 / 头部行高 | 8px / 28px min | `--ww-space-2` / 非 token 常量（topbar conn/digest action 同档 28px 工具行惯例） |
| 头部图标 | wand-sparkles 16px / 三级 | `--ww-fg-tertiary` |
| 标签 | 13px / 500 / 次级 | `--ww-text-sm` × `--ww-weight-medium` × `--ww-fg-secondary` |
| source 徽记文字 | 12px | `--ww-text-xs` |
| article 徽记 | check 12 `--ww-success` + 文字 `--ww-fg-secondary` | icon #22C55E 为非文本组件（3:1 达标且有文字并排）；文字 #61666B on #FFF ≈ 4.9:1 |
| title 徽记 | eye-off 12 `--ww-fg-tertiary` + 文字 `--ww-fg-secondary` | 文字同 article 档（≈4.9:1，12px 小字不用 fg-tertiary ≈3.9:1）；降级感由 icon 三级色 + 文案承载 |
| 时间 | 12px / caption | `--ww-text-xs` × `--ww-fg-caption`（margin-left:auto 靠右） |
| 正文 | 13px / 1.7 | `--ww-text-sm` × `--ww-leading-body` × `--ww-fg`（≈17:1） |
| lead 前缀 | 700 | `--ww-weight-bold` |
| · marker | 三级 | `--ww-fg-tertiary` |
| 骨架 / 错误 | 复用件 | `--ww-skeleton` / `.ww-error` 全套 |

**零新增 token**。CSS 块（§1-4）即终稿，与本表逐项一致。

---

## 2. §D2 AI 改写交互（R3）

### 2-1 设计判定

1. **chip 是「入口」不是「工具」**：选区上方浮出的一枚小胶囊，视觉语言 = 既有 hover 浮现件（`.ww-hotspot__write`：opacity 0 → 1 + translateY 2px→0，100ms）的编辑器版。surface-raised 底（浮层表面档，比 surface 高一级）+ shadow-overlay，压在正文上必须实底防透字。
2. **与格式工具条的层级裁决**：格式工具条（顶部 sticky，z `--ww-z-sticky` 1100）永远在上，chip/popover（z `--ww-z-dropdown` 1000）滚到工具条下方时被遮是预期——「格式工具条是编辑器 chrome，改写 chip 是内容伴生物，chrome 让内容不重排、内容不遮 chrome」。避免遮挡的机制不是抬 z，而是**翻转规则**（选区首行时 chip 翻到选区下方，§2-4）。
3. **popover 不用 accent 做容器**：浮层容器保持中性（surface-raised + border-strong + shadow-overlay）；accent 只出现在「改写」主钮（编辑器页每屏 accent 预算 = 推草稿箱 CTA + 改写主钮，两处上限内，且改写 popover 是临时面，关闭即让出）。
4. **生成中的反馈在 popover 内闭环**：按钮转 `loader-circle` + `ww-spin` + disabled（同「刷新」/「AI 速览」按钮既有手法），不弹 Toast；完成后 popover 关闭、文本一次性替换（`view.dispatch` 单一 transaction 进 undo 历史）。
5. **替换瞬间不做高亮动画**：Motion=3 无进入动效；替换即呈现，Ctrl+Z 即回滚（undo 是反馈的一部分）。见 advisory 可选增强。

### 2-2 命名契约（新增，前端 + QA 新锚点）

| 元素 | 契约 |
|---|---|
| chip | `button.ww-rewrite-chip`，`aria-label="AI 改写选中内容"`，data-testid `ww-rewrite-chip`；`aria-expanded` 绑 popover 开合 |
| popover | `div.ww-rewrite-popover`，`role="dialog" aria-label="AI 改写"`，data-testid `ww-rewrite-popover` |
| 指令输入 | `input.ww-rewrite-popover__input`，`aria-label="改写指令"`，placeholder「一句话说明怎么改，如：更口语一点」；Enter 提交；data-testid `ww-rewrite-input` |
| 快捷 chip ×4 | `button.ww-rewrite-popover__quick`：更口语 / 精简一半 / 扩写细节 / 更有数据感；点击即以该文案为指令直接提交；data-testid `ww-rewrite-quick-{colloquial|condense|expand|data}` |
| 改写主钮 | `button.ww-rewrite-popover__go`（官方 `Button variant="primary" size="sm"` + 本块微调），data-testid `ww-rewrite-go`；Enter 等价 |
| 取消 | `button.ww-rewrite-popover__cancel`（官方 `Button variant="ghost" size="sm"`），生成中= 中止请求；data-testid `ww-rewrite-cancel` |
| 行内错误 | `p.ww-rewrite-popover__error`，12px danger 一行（**不用 ErrorNote**——popover 内过重）；data-testid `ww-rewrite-error` |

### 2-3 线框

```
        ┌──────────────────────────────┐
        │ ✦ AI 改写                     │ ← chip（28px 高，胶囊）
        └──────────────┬───────────────┘   选中文字上方 8px
   ┌──────────────────┴────────────────┐
   │ ▓▓▓▓ 选中中的原文段落 ▓▓▓▓▓▓▓▓▓▓▓  │ ← CodeMirror 选区（accent-subtle 底，既有）
   └───────────────────────────────────┘

点击 chip 后（popover 替换 chip 位置）：
   ┌──────────────────────────────────┐
   │ ┌──────────────────────────────┐ │
   │ │ 一句话说明怎么改，如：更口语一点 │ │ ← input 32px，autofocus
   │ └──────────────────────────────┘ │
   │ [更口语][精简一半][扩写细节][数据感] │ ← 快捷 chip 24px 高，一行 flex wrap
   │ [✓取消]                [✦改写]    │ ← 取消 ghost / 改写 primary sm
   └──────────────────────────────────┘ ← 320px，surface-raised+border-strong+shadow-overlay

生成中：[取消]  [◌转圈 改写中…]（主钮 spin+disabled，input disabled）
失败：  input 与快捷行之间插一行红色 12px 错误信息（重试=再点改写）
```

### 2-4 定位与避让规则（chip / popover 共用）

| 规则 | 规格 |
|---|---|
| 锚点 | CodeMirror `coordsAtPos(selection.head)`；chip 水平左缘对齐选区起点，垂直在选区首行上缘上方 8px（`--ww-space-2`） |
| 翻转（上缘不足） | 选区首行上缘距编辑器可视区顶部 < 48px（28 chip + 8 gap + 12 余量）时，chip 翻转到选区末行下缘下方 8px——避免与顶部 sticky 格式工具条（40px 工具行）重叠遮挡 |
| 水平 clamp | chip/popover 左缘不小于编辑器内容区左 padding（8px），右缘不超出编辑器右 padding（`min(max(left, 8px), 容器宽 - 自身宽 - 8px)`） |
| 与格式工具条层级 | chip/popover `z-index: var(--ww-z-dropdown)`（1000）< 工具条 `--ww-z-sticky`（1100）；重叠时工具条在上——工具条是 chrome 不为内容让位，翻转规则已消除常态重叠 |
| 出现条件 | 非空选区 且 popover 未开 且 非生成中；选区清空/popover 开启时 chip 消失 |
| 挂载位置 | `.ww-editor` 容器内 `position: absolute`（编辑器 `overflow: hidden` 已有，chip 随编辑器裁切） |

### 2-5 可照抄 CSS（`src/client/styles/editor.css` 末尾追加「AI 改写」段）

```css
/* ---------- AI 改写 chip / popover（v0.3 R3，uiux-v0.3-design §D2） ----------
 * chip = 选区伴生入口（浮现语言同 .ww-hotspot__write：opacity+translateY 100ms）；
 * popover = 浮层容器（surface-raised + border-strong + shadow-overlay）。
 * z 全部 dropdown 档（1000）：格式工具条（sticky 1100）永远在上，靠翻转规则避让。 */

.ww-rewrite-chip {
  appearance: none;
  font: inherit;
  font-size: var(--ww-text-sm);
  display: inline-flex;
  align-items: center;
  gap: var(--ww-space-1);
  height: 28px;
  padding: 0 var(--ww-space-2);
  color: var(--ww-fg);
  background: var(--ww-surface-raised);
  border: var(--ww-border-width) solid var(--ww-border);
  border-radius: var(--ww-radius-full);
  box-shadow: var(--ww-shadow-overlay);
  cursor: pointer;
  white-space: nowrap;
  z-index: var(--ww-z-dropdown);
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity var(--ww-motion-fast) var(--ww-ease),
    transform var(--ww-motion-fast) var(--ww-ease),
    background var(--ww-motion-fast) var(--ww-ease),
    border-color var(--ww-motion-fast) var(--ww-ease);
}

.ww-rewrite-chip--shown {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.ww-rewrite-chip svg { color: var(--ww-accent); }

.ww-rewrite-chip:hover {
  background: var(--ww-surface);
  border-color: var(--ww-border-strong);
}

/* popover 容器 */
.ww-rewrite-popover {
  position: absolute;
  width: 320px;
  max-width: calc(100% - var(--ww-space-4));
  display: flex;
  flex-direction: column;
  gap: var(--ww-space-2);
  padding: var(--ww-space-3);
  background: var(--ww-surface-raised);
  border: var(--ww-border-width) solid var(--ww-border-strong);
  border-radius: var(--ww-radius-lg);
  box-shadow: var(--ww-shadow-overlay);
  z-index: var(--ww-z-dropdown);
}

.ww-rewrite-popover__input {
  appearance: none;
  font: inherit;
  font-size: var(--ww-text-sm);
  width: 100%;
  height: 32px;
  padding: 0 var(--ww-space-2);
  color: var(--ww-fg);
  background: var(--ww-surface);
  border: var(--ww-border-width) solid var(--ww-border);
  border-radius: var(--ww-radius-sm);
}

.ww-rewrite-popover__input::placeholder { color: var(--ww-fg-caption); }
.ww-rewrite-popover__input:hover:not(:disabled) { border-color: var(--ww-border-strong); }
.ww-rewrite-popover__input:focus-visible {
  outline: none;
  border-color: var(--ww-border-strong);
  box-shadow: var(--ww-focus-ring);
}
.ww-rewrite-popover__input:disabled {
  color: var(--ww-fg-caption);
  background: var(--ww-surface-sunken);
  cursor: default;
}

/* 快捷指令 chip：单行 wrap，形态同 .ww-rail__filter-chip（无底胶囊，选中语义无——即点即发） */
.ww-rewrite-popover__quick {
  appearance: none;
  font: inherit;
  font-size: var(--ww-text-xs);
  color: var(--ww-fg-secondary);
  height: 24px;
  padding: 0 var(--ww-space-2);
  display: inline-flex;
  align-items: center;
  background: none;
  border: var(--ww-border-width) solid var(--ww-border);
  border-radius: var(--ww-radius-full);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--ww-motion-fast) var(--ww-ease),
    color var(--ww-motion-fast) var(--ww-ease);
}

.ww-rewrite-popover__quick:hover:not(:disabled) {
  background: var(--ww-interactive-hover);
  color: var(--ww-fg);
}

.ww-rewrite-popover__quick:disabled { opacity: 0.6; cursor: default; }

.ww-rewrite-popover__error {
  margin: 0;
  font-size: var(--ww-text-xs);
  color: var(--ww-danger);
  overflow-wrap: break-word;
}

.ww-rewrite-popover__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ww-space-2);
}
```

（生成中态视觉全由既有件承载：主钮 icon 换 `loader-circle` + `ww-spin` + disabled；取消钮保持可点 = 中止。无额外 CSS。）

### 2-6 状态矩阵（popover 9 态）

| 状态 | 触发 | 视觉 |
|---|---|---|
| Default | 点 chip 开 | input autofocus + 4 快捷 chip + 取消/改写；无错误行 |
| Loading（生成中） | Enter / 快捷 chip / 改写钮 | input + 快捷 chip disabled（0.6）；主钮 spin + disabled + 文案「改写中…」；取消钮=中止请求 |
| Error | RPC 失败（llm-not-configured / rewrite-timeout / rewrite-empty / 供应商透传） | input 与快捷行之间插 `.ww-rewrite-popover__error` 一行（12px danger，具体错误文案）；popover 不关（指令不丢），重试 = 再点改写 |
| Success | 替换完成 | popover 关闭 + chip 消失（选区已被替换）+ 新文本自然呈现；**无 Toast 无动画**（undo 即回滚通道） |
| 并发守卫 | 生成中再选新文字 | chip 不出现（单飞）；popover 内控件全 disabled |
| Escape / 外点 | 关闭路径 | popover 关（生成中 Escape = 先中止再关）；选区保留（只关面板不动文本） |
| Default / Hover / Focus | — | chip hover = surface 底 + border-strong 升档；快捷 chip hover = interactive-hover；键盘焦点走 base.css 全局 ring |
| Disabled | 生成中 | 见 Loading 行 |
| Empty | 指令为空点改写 | 聚焦 input（不 disabled——继承 v2 §3-01 CTA enabled 策略：空输入不灰，点击聚焦） |

### 2-7 参数 — token 对照表（D2 全量）

| 参数 | 值 | token |
|---|---|---|
| chip 高 / 圆角 | 28px / 胶囊 | 非 token 常量（28 工具档）× `--ww-radius-full` |
| chip 底 / 边框 / 阴影 | raised / 1px border / overlay | `--ww-surface-raised` × `--ww-border(-width)` × `--ww-shadow-overlay` |
| chip icon | wand-sparkles 12px / accent | `--ww-accent`（12px 档 = Icon 微标注档，rail 门禁标记先例） |
| chip 文字 | 13px / 主文字 | `--ww-text-sm` × `--ww-fg`（≈17:1） |
| chip 浮现 | opacity + translateY(2px→0) 100ms | `--ww-motion-fast` × `--ww-ease`（同 `.ww-hotspot__write` 语言） |
| popover 宽 / 圆角 / 内距 | 320px（max 100%-16）/ 8px / 12px | 非 token 常量 × `--ww-radius-lg` × `--ww-space-3` |
| popover 底 / 边框 / 阴影 | raised / 1px **border-strong** / overlay | `--ww-surface-raised` × `--ww-border-strong` × `--ww-shadow-overlay`（浮层边框升档 = toast/progress-card 同语言） |
| input | 32px 高 / 13px / 4px 圆角 | 非 token 常量（32 紧凑输入档，§D4 归一）× `--ww-text-sm` × `--ww-radius-sm` |
| 快捷 chip | 24px 高 / 12px 字 / 胶囊 | 非 token 常量 × `--ww-text-xs` × `--ww-radius-full` |
| 错误行 | 12px danger | `--ww-text-xs` × `--ww-danger`（#EC1313 on raised #FFF ≈ 4.6:1，12px 警示短句达标） |
| z 层 | dropdown 1000 | `--ww-z-dropdown` |

**零新增 token**。accent 预算对账：编辑器页常态 = 推草稿箱 CTA（1）+ chip icon（临时浮现面，关闭即让出，常态不计）；popover 打开时 = CTA + 改写主钮 = 2 处上限内。

---

## 3. §D3 侧边栏入口 + 全屏浮层（R2）

### 3-1 设计判定

1. **入口几何照抄宿主 footer badge，颜色走 `--ww-*` 对应槽**。宿主 cordis footer badge（同排邻居）实测 CSS：wide = 42px 高 / `border-radius:12px` / gap 8 / `padding:0 10px 0 8px` / 14px 文字 / label ellipsis / hover `--dsw-alias-interactive-bg-hover`；rail = 36×36 / 圆形（50%）/ icon 18px（wide 16px）。我们的对应槽：`--ww-fg`（同源 label-primary）、`--ww-interactive-hover`（同源 interactive-bg-hover）——宿主 sidebar 侧栏在插件面板作用域之外，但 `--dsw-*` 挂在 body 上全局可达，`--ww-*` token 值即宿主值，视觉等同。
2. **12px 圆角是「宿主 chrome 对齐」显式例外**。项目圆角 token 上限 8px 约束插件面板自有面；侧边栏入口是宿主 chrome 语境的家具，与宿主 badge 同排并列，圆角不一致会一眼穿帮。新增 token `--ww-radius-footer: 12px` 承载（见 §3-4），先例 = v0.2.1 胶囊 `--ww-radius-full`（8px 上限外的既有形状类别）。rail 形态圆形用 `--ww-radius-full`（36×36 正方形上 9999px 与 50% 渲染等同）。
3. **rail icon 尺寸取 20px（Icon 既有档）**。宿主 rail badge icon 18px，Icon 封装三档 12/16/20 无 18——取 20px（36px 圆内视觉权重与宿主 18px 差 2px，肉眼难辨；不为 2px 破坏三档制）。wide 形态 icon 16px 与宿主一致。
4. **浮层顶行是「浮层 chrome」，白底 + 强底线**，与内嵌工作台的 bg-page 融合顶栏（v0.2.1 D1）形成两级：浮层头（chrome）> 工作台顶栏（工具行）。若顶行也融合底，两行 40px 粘在一起无法区分归属。
5. **浮层无进入动效**（Motion=3 硬约束）：挂载即全屏，关闭即消失。宿主 overlayLayer 已是 `absolute inset:0` 容器，`ww-overlay` 填满即可，`pointer-events` 由宿主容器规则恢复。

### 3-2 命名契约（总监 spec §2 已定 + 本文补全）

| 元素 | 契约 |
|---|---|
| 入口容器 | 宿主 slot `sidebar.footer.action` 渲染 `WewriteSidebarEntry({ wide })`；根 `div.ww-sidebar-entry`，修饰类 `ww-sidebar-entry--rail`（wide=false 时） |
| 入口按钮 | `button.ww-sidebar-entry__btn`，wide = 图标 16px + 「写作台」整行；rail = 36px 圆形 icon-only；`aria-label="打开写作台"`（rail 必带；浮层开时 `aria-expanded="true"`）；data-testid `ww-sidebar-entry` |
| 浮层容器 | 宿主 slot `shell.overlay` 渲染 `WewriteOverlay`；closed = null；open = `div.ww-overlay`，`role="dialog" aria-modal="true" aria-label="写作台"`，data-testid `ww-overlay` |
| 顶行 | `header.ww-overlay__head`：`pen-line` 16px + `h2.ww-overlay__title`「写作台」+ spacer + `span.ww-overlay__esc`「Esc 收起」+ `button.ww-overlay__close` |
| 收起钮 | `button.ww-overlay__close`（`x` 16px，28px ghost 热区，`aria-label="收起写作台"`），data-testid `ww-overlay__close` |
| 浮层体 | `div.ww-overlay__body` > 完整 `WewriteApp`（同组件独立实例，自带 `.dsh-wewrite-panel` token 作用域） |
| Esc 提示 | `span.ww-overlay__esc`，12px 三级色，静态文字（不做 kbd 样式包装——一个提示不值得引入 kbd 元素样式面） |

### 3-3 线框

```
宿主侧栏 footer（wide）：
┌────────────────────────────┐
│ [▪settings 设置        ]   │ ← 宿主 settings 行（宿主所有）
│ [▪pen-line 写作台       ]   │ ← ww-sidebar-entry__btn（42px，radius 12，
└────────────────────────────┘    几何照抄宿主 cordis badge 同排对齐）
 hover: interactive-hover 底；浮层开时同底（active 语义）

宿主侧栏 footer（rail 56px）：
│ ▪settings │ ← 宿主
│  ( ✦pen ) │ ← 36×36 圆形 icon-only（icon 20px）
│  ( 插件 ) │ ← 宿主 cordis badge

浮层：
┌──────────────────────────────────────────────────────────────┐
│ [▪pen-line] 写作台                        Esc 收起  [✕]      │ ← head 40px，bg 白+
├──────────────────────────────────────────────────────────────┤   border-strong 底线
│ ww-overlay__body（flex-1，overflow hidden）                    │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 内嵌 WewriteApp（完整实例：ww-topbar 分段导航 / rail /     │ │
│ │  编辑器 / 选题 / 定时 / 设置，各自管理边距与滚动）          │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
 inset 0（宿主 overlayLayer 容器内）；底 --ww-bg-page；head padding 0 24（--ww-page-pad）
```

### 3-4 可照抄 CSS（`src/client/styles/overlay.css` 末尾追加两段）

```css
/* ---------- 侧边栏入口（v0.3 R2，uiux-v0.3-design §D3） ----------
 * 几何照抄宿主 cordis footer badge（dsh-client-ui-cordis 内联 CSS 实测）：
 * wide 42px 高 / radius 12 / gap 8 / padding 0 10 0 8；rail 36×36 圆。
 * 颜色走 --ww-*（与宿主 --dsw-* 同源，宿主 sidebar 域内值等同）。 */

.ww-sidebar-entry { width: 100%; display: flex; }

.ww-sidebar-entry__btn {
  appearance: none;
  font: inherit;
  font-size: var(--ww-text-base);
  display: inline-flex;
  align-items: center;
  gap: var(--ww-space-2);
  width: calc(100% + 4px);
  height: 42px;
  margin: 0 -2px;
  padding: 0 10px 0 8px;      /* 宿主 badge 同款微距，不进 4px 宏观网格（chrome 对齐优先） */
  color: var(--ww-fg);
  background: none;
  border: none;
  border-radius: var(--ww-radius-footer);
  cursor: pointer;
  overflow: hidden;
  text-align: left;
  transition: background var(--ww-motion-fast) var(--ww-ease);
}

.ww-sidebar-entry__btn:hover,
.ww-sidebar-entry__btn[aria-expanded='true'] {
  background: var(--ww-interactive-hover);
}

.ww-sidebar-entry__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* rail 形态（wide=false，宿主 56px rail 列）：36×36 圆 icon-only */
.ww-sidebar-entry--rail { width: auto; }

.ww-sidebar-entry--rail .ww-sidebar-entry__btn {
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  gap: 0;
  justify-content: center;
  border-radius: var(--ww-radius-full);
}

/* ---------- 写作台全屏浮层（v0.3 R2，uiux-v0.3-design §D3） ----------
 * 宿主 overlayLayer（absolute inset:0 z:20）容器内填满；无进入动效（Motion=3）。 */

.ww-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--ww-bg-page);
}

.ww-overlay__head {
  display: flex;
  align-items: center;
  gap: var(--ww-space-2);
  height: var(--ww-toolrow-h);
  min-height: var(--ww-toolrow-h);
  padding: 0 var(--ww-page-pad);
  background: var(--ww-bg);
  border-bottom: var(--ww-border-width) solid var(--ww-border-strong);
}

.ww-overlay__head > svg { color: var(--ww-fg-secondary); }

.ww-overlay__title {
  margin: 0;
  font-size: var(--ww-text-md);
  font-weight: var(--ww-weight-medium);
}

.ww-overlay__spacer { flex: 1; }

.ww-overlay__esc {
  font-size: var(--ww-text-xs);
  color: var(--ww-fg-caption);
  white-space: nowrap;
}

.ww-overlay__close {
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
  transition: background var(--ww-motion-fast) var(--ww-ease),
    color var(--ww-motion-fast) var(--ww-ease);
}

.ww-overlay__close:hover { background: var(--ww-interactive-hover); color: var(--ww-fg); }

.ww-overlay__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ww-overlay__body > .dsh-wewrite-panel { flex: 1; min-height: 0; }
```

### 3-5 内嵌工作台的边距（任务书问项，结论）

- 浮层 body **零额外边距**：`WewriteApp` 完整实例自带 `.ww-content` padding（非 flush 态 `20 24 …`）/ 工作区 flush 态（rail+主区各自管理）——浮层只做满铺容器（`overflow: hidden`），不复刻任何内边距，避免双层 padding。
- 浮层 head 左右 padding 用 `--ww-page-pad`（24px）与 `.ww-content` / `.ww-topbar` 的 24px 左右对齐——head 标题与下方工作台顶栏左缘成一条垂直线。
- 浮层底 = `--ww-bg-page`：head 白条浮在灰台上（v2「白条浮灰台」语言），内嵌工作台的 bg-page 底与浮层底同色无缝。
- `ww-toasts` 在浮层实例内 `position: absolute` 相对其 `.ww-shell`——浮层内 Toast 落在浮层内，不漏到宿主页（结构自包含，无 CSS 干预）。

### 3-6 状态矩阵（入口 + 浮层）

| 状态 | 触发 | 视觉 |
|---|---|---|
| 入口 Default（wide） | 常态 | 透明底 + fg 文字 + pen-line 16 |
| 入口 Hover | 悬停 | `--ww-interactive-hover` 底，100ms |
| 入口 Active（浮层开） | 浮层 open | 同 hover 底（`aria-expanded='true'`），持续指示「已打开」 |
| 入口 rail | wide=false | 36 圆 icon-only（icon 20），hover/active 同底 |
| 浮层 Open | 点入口 | 瞬时挂载（无动效）；焦点管理见 advisory（移焦 head 收起钮） |
| 浮层 Close | 收起钮 / Escape | 瞬时卸载；焦点还入口按钮（advisory：前端以 focus() 实现，无视觉面） |
| Esc 提示 | 常态 open | 「Esc 收起」静态 12px caption 文字 |
| Disabled / Loading / Empty / Error | 不适用 | 入口无条件可用（浮层内工作台自己的状态自管理）；slot 注册失败走 warnDegraded（console.warn，无 UI） |

### 3-7 参数 — token 对照表（D3 全量）

| 参数 | 值 | token |
|---|---|---|
| 入口高（wide） | 42px | 非 token 常量（宿主 cordis badge 字面值） |
| 入口圆角（wide） | **12px** | **新增 `--ww-radius-footer: 12px`**（宿主 cordis badge `border-radius:12px` 同排对齐；8px 上限的「宿主 chrome 对齐」显式例外，先例 = `--ww-radius-full` 胶囊） |
| 入口圆角（rail） | 圆形 | `--ww-radius-full` |
| 入口 icon | wide 16 / rail 20 | Icon 既有三档（宿主 18→取最近档 20，§3-1 决策 3） |
| 入口文字 / 底 / hover | 14px / 透明 / hover 底 | `--ww-text-base` × `--ww-interactive-hover` |
| 浮层底 | 灰台 | `--ww-bg-page` |
| head 高 / 底 / 底线 | 40px / 白 / 1px strong | `--ww-toolrow-h` × `--ww-bg` × `--ww-border-strong` |
| head padding 左右 | 24px | `--ww-page-pad` |
| head icon / 标题 | pen-line 16 secondary / 16px 500 | `--ww-fg-secondary` × `--ww-text-md` × `--ww-weight-medium` |
| Esc 提示 | 12px caption | `--ww-text-xs` × `--ww-fg-caption` |
| 收起钮 | x 16 / 28 ghost / radius-md | `--ww-interactive-hover` × `--ww-radius-md` × `--ww-motion-fast` |

### 3-8 新增 token 落点（唯一 1 个）

`src/client/styles/tokens.css` §9 圆角段追加（design-tokens.json 同步一条）：

```css
  --ww-radius-footer: 12px; /* 宿主 sidebar footer 动作钮圆角（dsh-client-ui-cordis
                               footer badge border-radius:12px 字面值）。插件面板自有面
                               不用此档（上限仍是 radius-lg 8px）；仅宿主 chrome 同排
                               家具用（v0.3 §D3）。 */
```

---

## 4. §D4 全局精修（R4）— 12 文件逐文件审计表

### 4-0 分层语言总则（先立尺，再量布）

| 维度 | 三档语言 | 违规模式 |
|---|---|---|
| 底色 | 页面底 `bg-page` → 卡面 `surface` / 主区白 `bg` → 凹区 `surface-sunken`（浮层 `surface-raised`、画布井 `canvas-well` 为专用槽） | 组件内新造底色组合 |
| 边框 | 内分隔 `divider`(l1) → 默认 `border`(l2) → 强调 `border-strong`(l3)；浮层容器一律 strong | 语义色边框（仅 `.ww-error` danger 一处合法） |
| 阴影 | `shadow-card`(2px 卡级) → `shadow-overlay`(24px 浮层) → `shadow-modal`(48px 模态)；**hover 不换阴影档** | 裸值阴影、hover 阴影加深 |
| icon 钮热区 | 28（ghost 工具档）/ 32（密集工具条档 `.ww-editor__tool`）/ 44（触摸底线，仅行级） | 24px 半档 |
| 输入高度 | 32（紧凑）/ 40（主舞台）；官方 Input 自理 | 30/36 散档 |
| 进入动效 | 契约 §1-9 白名单（进度卡 8px↑ / 门禁 40px→ / rail-new 展开）外**零进入动效** | 新面自带 fade-in |

### 4-1 tokens.css（243 行）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| T1 | L169-172 | 圆角档缺宿主 footer 对齐档（§D3 需要） | 追加 `--ww-radius-footer: 12px`（§3-8 全文） | 新增 | 必改（随 D3） |
| T2 | L204 | `--ww-editor-pad: 20px` 定义后无组件引用（editor.css 用 `--ww-space-5` 同值） | 见 E2：cm-scroller 改引 `--ww-editor-pad`，token 语义落地 | 既有 | 建议（随 E2） |

其余（颜色/间距/动效/z 阵列）审计干净：零裸 hex、shadow 三档合规、reduced-motion 全关（L235-243）。

### 4-2 base.css（153 行）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| B1 | L101 | `.ww-code` padding `1px var(--ww-space-2)`——1px 微距非网格 | 保留（控件内微距先例源，等同 topbar 槽 2px 类别；改了会牵动全部 CodeChip 视觉） | — | 可缓（不改） |

审计干净：focus ring inherit（L126-134）、spin/sr-only/modal-note 无噪音。

### 4-3 topbar.css（189 行，v0.2.1 刚重写）

审计干净，零改动。状态矩阵完整（hover/active/focus/disabled 预留）、容器查询窄态在位（L186-189）、激活段 hover 稳定规则顺序正确（L92 在 L73 后）。

### 4-4 rail.css（251 行）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| R1 | L10-22 | `.ww-rail` 基础块与 workbench.css L21-33 **整块重复定义**（同名同值两处真源） | 合并至 rail.css（唯一真源，含 workbench.css L35-39 的 `--collapsed` 一并迁入）；workbench.css 删重复块 | — | **必改** |
| R2 | L46 | `.ww-rail__search` 高 30px——输入高度散档（30/32/36/40 四档并存） | 30→32px（紧凑档归一，§4-0） | — | 建议 |
| R3 | L180-186 | `ww-rail-new-in` translateY(4px) 与契约 §1-9 #5「高度展开+opacity」不符，且 4px 位移与进度卡 8px（overlay.css L27）语言不一 | keyframes 4px→8px（统一进入位移档；高度展开实现成本高，位移+opacity 是等效轻量实现） | `--ww-motion-slow` 不变 | 建议 |
| R4 | L105 | `.ww-rail-btn` `border-left: 2px solid transparent`（激活换 accent 指示条）——触「侧条纹」敏感点 | **保留**：契约 §1-3 冻结（「本屏两处 accent 之一」），且 Linear 侧栏选中指示同语言，非 AI 模板彩条 | `--ww-accent` | 可缓（不改，契约锁定） |

### 4-5 workbench.css（159 行）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| W1 | L81-84 | `.ww-startup:hover` 裸值阴影 `0 2px 6px rgba(15,17,21,0.08)`——非 token、深色下失效（dark 下该值近不可见且色相不对） | 删 hover `box-shadow` 行，只留 `border-color: var(--ww-border-strong)`（v0.2.1 digest 卡已示范「hover 只提边框」；`--ww-shadow-card` 深色有覆写版但 hover 换阴影档违反 §4-0 总则） | `--ww-border-strong` | **必改** |
| W2 | L21-39 | `.ww-rail` + `--collapsed` 与 rail.css 重复（见 R1） | 迁 rail.css 后本文件删除 | — | **必改**（随 R1） |
| W3 | L112 | `.ww-startup__title` 20px 用 `--ww-tracking-heading`(-0.01em)，token 注释限定「≥24px 标题」（tokens.css L152） | 删 letter-spacing 行（20px 中文标题 0 字距即可） | — | 可缓 |
| W4 | L153 | `.ww-startup__helper` 文字 `--ww-warn` 13px on 白底 ≈2.2:1，**不达 4.5:1**（v0.2.1 在 stale chip 已认定 warn 不可作正文色，此处漏网） | 文字改 `--ww-fg-secondary`（≈4.9:1），icon（settings 12px）保 `--ww-warn` 传警示语义——形状+颜色冗余原则：icon 警示、文字可读 | `--ww-fg-secondary` / icon `--ww-warn` | **必改** |

### 4-6 panels.css（365 行）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| P1 | L121-124 | `.ww-hotspots__keywords:hover` 裸值阴影 `0 2px 6px rgba(15,17,21,0.08)`（同 W1） | 删 hover box-shadow，只留 border-strong | `--ww-border-strong` | **必改** |
| P2 | L192-195 | `.ww-schedule-card:hover` 同款裸值阴影 | 同上 | 同上 | **必改** |
| P3 | L243-365 | `.ww-digest*` 整段（v0.2.1 整卡速览）——v0.3 §0 撤销项 | **全段删除**（123 行）；行渲染语言由 §D1 新族继承（不是照抄 class） | — | **必改**（撤销项） |
| P4 | L56 | `.ww-hotspot--hit .ww-hotspot__row:hover` 与 L55 规则完全同值（重复选择器噪音） | 删 L56 整行 | — | 建议 |
| P5 | L29 | `.ww-hotspot-list` 容器 `shadow-card`——列表容器即「多行卡」，卡级微影合规但与 keywords 卡（同 shadow）在灰底上投影密度叠加 | 保留（两卡同档是刻意节奏）；若 Jerry 觉重，降为纯 border（advisory） | — | 可缓（不改） |

### 4-7 settings.css（182 行）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| S1 | L147-163 | `.ww-icon-btn` 44×44（引 `--ww-row-h`）——icon-only 动作钮用触摸底线档，与全局 ghost 工具档（28）割裂；行本身 `min-height: 44`（L134）已承载触摸底线 | 44→28（`width/height/min-width: 28px`，去 token 引用改常量=工具档惯例写法） | — | 建议 |
| S2 | L121 | `.ww-locked__dot` `margin-top: 6px` 对齐 hack | 保留（首行文字基线对齐的一次性微调，改 `align-items: flex-start` 反而引新问题） | — | 可缓（不改） |
| S3 | L10 | `.ww-settings__nav` `sticky; top: var(--ww-space-2)`——sticky 偏移 8px 与内容区 padding-top 20px 的关系（滚动后 nav 距视口顶 8px，pagebar 已滚出） | 行为正确，保留 | — | 可缓（不改） |

### 4-8 editor.css（220 行 + §D2 追加段）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| E1 | L212-214 | `.ww-rename-input` 高 36px——输入散档 | 36→32（紧凑档归一） | — | 建议 |
| E2 | L146 | `.cm-scroller` `padding: var(--ww-space-5)`（20px）——与 token `--ww-editor-pad`（20px）同值不同名，token 成死定义 | 改 `padding: var(--ww-editor-pad)`（等值换引用） | `--ww-editor-pad` | 建议 |
| E3 | L82 | `.ww-editor-body` padding `12 16` 与编辑器 pad 体系（20）关系未声明 | 保留（body 是双栏容器留白，cm-scroller 才是纸面；两层数值有意不同）——在 editor.css L76-83 补一行注释声明层级即可 | — | 可缓 |
| E4 | L133 | `.ww-editor__tool` 32px——icon 热区第三档 | **保留**（密集工具条档，§4-0 档位表登记在案） | — | 可缓（不改，登记） |
| E5 | L174-191 | `.ww-statusstrip__gate` 状态矩阵完整、chip 2px 微距先例源 | 保留 | — | 可缓（不改） |

### 4-9 preview.css（111 行）

审计干净。骨架 pulse 1.6s 是功能性 loading 动效（Motion=3 允许）；notch 纯 CSS 装饰（96×4px）合规；井化三层（well → frame → canvas）与 §4-0 总则一致。零改动。

### 4-10 states.css（261 行）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| ST1 | L108-116 | `.ww-btn-accent:hover` `transform: translateY(-1px)`——hover 位移是「过度 hover 反馈」（v0.2.1 顶栏已确立「态稳定优先」哲学；Linear/Stripe CTA hover 只变色）；且与 active 的 translateY(0) 形成跳动感 | 删两条 transform 声明（hover/active 只换底色），transition 里的 transform 一并删 | — | 建议 |
| ST2 | L246-259 | `.ww-toast__close` 24×24——icon 钮半档 | 24→28（工具档归一，§4-0） | — | 建议 |
| ST3 | L163-196 | `.ww-view-tab--active` ring 阴影 `0 0 0 1px var(--ww-border)` vs topbar 激活段 `shadow-card`——两档激活语言 | **保留**（v0.2.1 §1-1 决策 1 已裁决：紧凑控件 ring / 主导航投影，同构不同尺） | — | 可缓（不改，已裁决） |

### 4-11 overlay.css（128 行 + §D3 追加两段）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| O1 | L44-56 | `.ww-progress-card__collapse` 24×24——icon 钮半档 | 24→28（同 ST2） | — | 建议 |
| O2 | L26-29 / L82-85 | 进度卡 translateY(8px) / 门禁 translateX(40px) 两个 300ms 进入动画 | **保留**（契约 §1-9 #2/#3 白名单） | — | 可缓（不改，契约锁定） |

### 4-12 generation.css（94 行）

| # | 证据 | 问题 | 改法 | token | 级别 |
|---|---|---|---|---|---|
| G1 | L37 / L45 | `.ww-stage__sub` 与 `.ww-stage__error` `padding-left: 26px`——无据裸值（对齐目标 = lead icon 16 + gap 8 = 24px，26 差 2px 是历史残留） | 26→24px 两处（视觉变化不可辨，网格回归） | — | 建议 |
| G2 | L73 | `.ww-gate__denominator` `margin-left: 2px` 基线微调 | 保留（分数基线一次性微调） | — | 可缓（不改） |

### 4-13 审计汇总（按优先级）

| 级别 | 条目 | 一句话 |
|---|---|---|
| **必改（4 项）** | R1+W2 | `.ww-rail` 重复定义收敛 rail.css 唯一真源 |
| | W1 / P1 / P2（三处同源） | 白卡 hover 裸值阴影全删，hover 只提 border-strong |
| | W4 | startup helper warn 文字对比度不达标，文字降 secondary |
| | P3 | `.ww-digest*` 整段删除（v0.3 撤销项） |
| 建议（9 项） | R2 / E1 | 输入高度归一 32 档（search 30→32、rename 36→32） |
| | R3 | rail-new 进入位移 4→8px 统一语言 |
| | P4 | 删重复 hover 选择器行 |
| | S1 / ST2 / O1 | icon 钮热区归一（44→28、24→28 ×2） |
| | ST1 | 主 CTA 删 hover 位移 |
| | G1 | 26→24px 网格回归 ×2 |
| | T2+E2 | `--ww-editor-pad` 死 token 复活（等值换引用） |
| 可缓（4 项，登记不改） | R4 / E4 / ST3 / O2 | 契约锁定项（rail 指示条 / 32 工具档 / 双档激活语言 / 契约动效白名单） |
| | B1 / W3 / S2 / S3 / P5 / G2 / E3 / E5 | 微距/微调/已裁决项，改动收益低于回归风险 |

深色主题复核（全表）：必改+建议全部为几何/引用层改动，零颜色值变化——深浅双主题结论自动保持；唯一颜色改动 W4 是把不达标 warn 文字换成随主题翻转的 `--ww-fg-secondary`（浅 4.9:1 / 深 #CFD3D6 on #2C2C2E ≈ 9:1），双主题均达标。

---

## 5. 13 点自检表（设计系统 8 + 质量 5）

| # | 检查项 | 结果 | 证据/说明 |
|---|---|---|---|
| 1 | 所有颜色通过 Design Token 引用 | 通过 | §1-4 / §2-5 / §3-4 CSS 全部 `var(--ww-*)`；文档 hex 仅为对比度核算注记（tokens.css 既有注释核对值），非组件代码 |
| 2 | 间距全是 4px 整数倍 | 通过（含声明例外） | 宏观间距全 `--ww-space-*`；声明例外三处：入口按钮 padding `0 10 0 8` + margin `-2`（宿主 badge 字面几何，chrome 对齐优先）、控件内 2px 微距（既有先例）、chip/popover 边缘 clamp 8px（= `--ww-space-2`） |
| 3 | 字体同时指定 UI 中文栈 + 等宽 | 通过（继承） | 零新字体声明：全走 `--ww-font-ui` / `--ww-font-code`（寄生插件跟宿主栈，项目章程零网络字体） |
| 4 | 标题/正文/等宽三层级明确 | 通过 | D1 标签 13/500、正文 13/1.7；D2 chip 13、input 13、快捷 12；D3 浮层标题 16/500、Esc 12；等宽仅 statusstrip/rank 既有场景 |
| 5 | Hero 展示真实产品内容 | 不适用 | Product 寄存器工具 UI 无 Hero；三新面全部真实数据（榜单条目/选中文本/工作台） |
| 6 | 对标品牌 + 行业风格全产品一致 | 通过 | Linear 式工程编辑风延续：行内嵌入件无卡框（Density=6）、浮层三层语言（§4-0 总则）、宿主 chrome 几何照抄（§D3）——与 redesign-v2 / workbench-delta / polish-v0.2.1 同源 |
| 7 | 按钮必要状态（Default/Hover/Focus/Active/Disabled） | 通过 | D2 popover 六态+并发守卫（§2-6）；D3 入口含 Active(浮层开) 态（§3-6）；D1 无按钮（重试=官方 Button 既有态） |
| 8 | 表单验证错误、列表空状态 | 通过 | D1 error=ErrorNote+重试、loading=骨架行（§1-6）；D2 行内错误 12px danger（§2-6）；浮层内空态由内嵌工作台既有件承载 |
| 9 | 图标库锁定一套 + 尺寸统一 | 通过 | lucide 经 `<Icon>` 唯一封装 12/16/20 三档；新用名 wand-sparkles/external-link/loader-circle/pen-line/check/eye-off/x 全在 Icon.tsx:79-149 映射表内，零新增映射；零 emoji |
| 10 | 无纯黑 #000 / 纯灰直接使用 | 通过 | 全 token；阴影为既有 `--ww-shadow-*`（overlay/modal 深色覆写版自动跟随） |
| 11 | 对比度 ≥4.5:1 / 动画 ≤400ms / reduced-motion | 通过 | 逐组实测：D1 title 徽记文字升 fg-secondary（3.9→4.9:1，§1-8 表内修正）；D2 chip 文字 ≈17:1、错误行 4.6:1；D3 入口文字 = fg ≈17:1；W4 修复既有 2.2:1 漏网；动效 100ms 一档新增（chip 浮现）+ 继承档，全部 ≤300ms；reduced-motion 由 tokens.css L235-243 全关覆盖 |
| 12 | 响应式覆盖（断点/导航/触摸） | 通过 | D1 head flex-wrap（窄态徽记折行）；D2 popover `max-width: calc(100% - 16px)` + 水平 clamp；D3 入口双形态由宿主 wide prop 驱动（rail 36 圆 = 触摸底线内、热区 36 接近 44 由宿主列几何决定）；浮层随宿主 overlayLayer inset 自适应 |
| 13 | 组件状态矩阵 9 态 | 通过 | D1 §1-6 九态（empty=直接 loading、success=ready 归并，理由在表）；D2 §2-6 九态含并发守卫与空指令聚焦；D3 §3-6 六态+不适用项逐条标注理由 |

## 6. P0 三规则自查声明

1. **无 emoji 作为功能图标**：本规格所有图标均为 lucide 语义名经 `<Icon>` 封装（wand-sparkles / external-link / loader-circle / pen-line / check / eye-off / x / settings），文档全文不含 U+1F300–1F9FF / U+2600–26FF / U+2700–27BF 区段字符（线框中 `✦ ▪ ✕ ◌` 为等宽 ASCII 线框记号，非 UI 图标交付物，图标交付一律以语义名标注）。
2. **无紫色→粉色渐变**：本规格零 `linear-gradient` / `radial-gradient` 定义（stylelint `declaration-property-value-disallowed-list` 双保险）；紫粉四色 hex 零出现；accent 一律 deepseek 品牌蓝纯色平涂（`--ww-accent` 族）。
3. **无 AI 模板味**：无 Lorem ipsum / "Welcome to" / 空洞占位——全部文案真实中文终稿（「读了原文」「仅标题」「AI 改写」「更口语 / 精简一半 / 扩写细节 / 更有数据感」「写作台」「Esc 收起」）；无硬编码颜色（唯一裸值阴影是**删除项** W1/P1/P2）；无左边框强调条新增（rail 指示条为契约冻结项）、无渐变文字、无毛玻璃、无幽灵卡（1px 边框只配 blur 2px 微影，浮层 24px 阴影无 1px 边框叠加——border-strong+overlay 是浮层合法组合，非幽灵卡判定域）；圆角上限 8px（`--ww-radius-footer: 12px` 为宿主 chrome 对齐显式例外，已在 §3-1 决策 2 论证并限定使用域）。

---

## 7. 施工落点汇总（给前端的放置清单）

| 改动 | 文件 | 性质 |
|---|---|---|
| D1 速览块样式 | `src/client/styles/panels.css` | §1-4 追加 + §4-6 P3 digest 段删除（L243-365） |
| D1 组件 | 新 `src/client/components/HotspotItemDigest.tsx`（拆 HotspotDigest.tsx 行渲染先例） | 总监 delta §1 已定契约，本规格管视觉与命名（§1-2） |
| D2 chip/popover 样式 | `src/client/styles/editor.css` | §2-5 追加 |
| D2 组件 | 新 `src/client/components/editor/RewritePopover.tsx` + EditorWorkbench 选区监听 | 总监 delta §3 已定契约，本规格管视觉/定位/避让（§2-2/2-4） |
| D3 入口+浮层样式 | `src/client/styles/overlay.css` | §3-4 追加两段 |
| D3 token | `src/client/styles/tokens.css` + `docs/design/design-tokens.json` | §3-8 追加 1 token（同步两处） |
| R4 必改 | rail.css / workbench.css / panels.css / settings 同源三处 | §4-13 表（R1+W2 / W1+P1+P2 / W4 / P3） |
| R4 建议 | rail.css / editor.css / states.css / overlay.css / generation.css | §4-13 表（9 项，Jerry 验收可取舍） |
