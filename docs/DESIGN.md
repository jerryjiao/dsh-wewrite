# dsh-wewrite 设计契约（DESIGN.md）

> 生成日期：2026-08-18 | 设计师：颜好看（MVP 开发专家团）
> 基于：docs/FACTS.md + docs/spec.md v0.1.0（§7 页面清单 / §8 设计 Token 为锁定契约）+ docs/uiux-direction.md v0.1（Phase 1 方向）
> 机器可读真源：`docs/design/design-tokens.json` ｜ 运行时真源：`src/client/styles/tokens.css`（两文件一一对应）
> 寄存器：**Product**（工具 UI，设计服务产品，标杆是「赢得熟悉感」）
> 三轴刻度：Variance=3 / Motion=3 / Density=6

---

## 1. Visual Theme & Atmosphere（视觉主题与氛围）

- **关键词**：宿主同源、克重平涂、工程编辑风、状态即界面、安全默认可见
- **氛围描述**：像 DSH 宿主亲生长出的一块工作台——白底（浅色主题）近黑正文、1px 线框分层、deepseek 品牌蓝纯色平涂只出现在主操作上；等宽字体承载一切「机器味」信息；长时异步的写作管线以阶段化状态视图为第一公民，不是一个 spinner 打天下。
- **对标**：Linear（密度与克制）+ Stripe Docs（层级与排版）+ doocs/md（编辑/预览空间语法）
- **形态约束**：寄生型插件 UI（DSH 中心栏面板）。不自带主题开关，浅/深/皮肤全跟宿主 `--dsw-*` token 翻转；不引入任何第三方组件框架。

## 2. Color Palette & Roles（色彩与角色）

### 2.1 引用链与构造保证

所有颜色经 `--ww-*` 语义名 → 宿主 `--dsw-*` token 引用（三层体系：`--dsw-static-*` → `--dsw-alias-*` → `--dsw-specific-*`，浅色挂 `body`、深色挂 `body[data-ds-dark-theme]`）。宿主缺位处（阴影/画布/焦点环）用自有值，见 tokens.css 注释。

- **零 gradient token**：design-tokens.json 与 tokens.css 不含任何渐变定义——P0-2 由构造保证，非事后扫描保证。
- **紫粉四色 `#7C3AED` / `#A855F7` / `#EC4899` / `#6366F1` 不出现**在任何 token 值。
- **无纯黑 `#000` / 纯灰裸值**：中性色全带宿主 bluish 色调或黑 alpha 分层。
- **组件内禁裸 hex**：唯一例外域 = 微信预览画布内的 UGC 排版主题 CSS（作用域限定画布容器）。

### 2.2 角色表（完整 30 色见 design-tokens.json，此处列核心）

| 角色 | Token | 宿主引用 | light | dark | 用途 |
|---|---|---|---|---|---|
| 品牌强调 | `--ww-accent` | `--dsw-alias-button-info-fill` | `#4176E6` | `#679EFE` | 主 CTA、选中 Tab（每屏 ≤2 处） |
| 强调悬停 | `--ww-accent-hover` | `--dsw-alias-button-info-hover` | `#679EFE` | `#4176E6` | 悬停态 |
| 强调按下 | `--ww-accent-active` | `--dsw-static-deepseek-600` | `#4868B2` | `#4868B2` | 按下态 |
| 强调前景 | `--ww-accent-on` | `--dsw-static-neutral-bluish-00` | `#FFFFFF` | `#FFFFFF` | accent 上的文字 |
| 强调浅底 | `--ww-accent-subtle` | `--dsw-static-deepseek-50` | `#EDF3FE` | `#EDF3FE` | 选中行/命中标签底 |
| 焦点环色 | `--ww-accent-ring` | 自有值 | `rgba(65,118,230,.32)` | `rgba(103,158,254,.40)` | 组装 `--ww-focus-ring` |
| 页面基底 | `--ww-bg` | `--dsw-alias-bg-base` | `#FFFFFF` | `#151517` | 面板底 |
| 卡片表面 | `--ww-surface` | `--dsw-alias-bg-layer-2` | `#FFFFFF` | `#2C2C2E` | 卡片/表格/输入框 |
| 凹区表面 | `--ww-surface-sunken` | `--dsw-specific-sidebar-fill` | `#F9FAFB` | `#1B1B1C` | 表头/画布外圈/阶段视图 |
| 主文字 | `--ww-fg` | `--dsw-alias-label-primary` | `#0F1115` | `#F9FAFB` | 正文（≈17:1） |
| 次级文字 | `--ww-fg-secondary` | `--dsw-alias-label-secondary` | `#61666B` | `#CFD3D6` | 来源/摘要/表头（≈4.9:1） |
| 默认边框 | `--ww-border` | `--dsw-alias-border-l2` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.12)` | 卡片/输入框 |
| 分隔线 | `--ww-divider` | `--dsw-alias-border-l1` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` | 列表行间 |
| 成功 | `--ww-success` | `--dsw-alias-state-success-primary` | `#22C55E` | `#22C55E` | 门禁通过/已进草稿箱 |
| 警示 | `--ww-warn` | `--dsw-alias-state-warn-primary` | `#F59E0B` | `#F59E0B` | 门禁未过/定时拦停 |
| 失败 | `--ww-danger` | `--dsw-alias-state-error-primary` | `#EC1313` | `#F25A5A` | 推送失败/管线错误 |
| 交互悬停 | `--ww-interactive-hover` | `--dsw-alias-interactive-bg-hover` | `rgba(38,49,72,.06)` | `rgba(255,255,255,.08)` | 列表行/菜单项 |
| 等宽带底 | `--ww-code-bg` | `--dsw-alias-markdown-inline-code` | `#EBEEF2` | `#2C2C2E` | slug/RRULE/规则 ID 底 |
| 画布底 | `--ww-canvas-bg` | 自有固定值 | `#FFFFFF` | `#FFFFFF` | 预览画布（不随主题，UGC 域） |

### 2.3 每屏 accent ≤2 处

主 CTA（「开始写作」/「推草稿箱」）+ 单一选中态（当前 Tab 或选中行）。热榜「写这个」等次级动作用 Ghost/Outline 按钮（近黑或描边），不抢主路径。状态色（success/warn/danger）是语义信息不是装饰，不计入 accent 限额。

## 3. Typography（排版）

### 3.1 字体栈（零网络字体，全跟宿主）

| Token | 栈 | 用途 |
|---|---|---|
| `--ww-font-ui` | `var(--dsw-font-family)` = -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', … | 全部界面文字 |
| `--ww-font-code` | `var(--ds-font-family-code)` = 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, …（宿主刻意不带裸 monospace 尾巴，防 Windows CJK 回落宋体） | slug、模型名、时间戳、RRULE 原文、门禁规则 ID、流式输出、状态栏信息带 |
| `--ww-font-canvas` | 系统中文栈（自有值） | 预览画布默认字体；文章实际字体由排版主题 CSS 接管（作用域限定画布内） |

**等宽应用域是本产品的视觉签名**（工程编辑风）：凡「机器生成/机器可读」的信息一律等宽 + `--ww-code-bg` 底，与「人读的中文」形成材质对比。

### 3.2 字号 8 级（正文基准 14px，面板级密度）

`12 / 13 / 14（正文基准）/ 16 / 18 / 20 / 24 / 32`，对应 `--ww-text-xs` 至 `--ww-text-3xl`。32px 仅用于门禁报告分数一处。画布内文章字号由排版主题控制，不走本阶梯。

### 3.3 行高 / 字重 / 字距

- 行高：UI 文本 1.5（`--ww-leading-ui`）、中文阅读文本 1.7（`--ww-leading-body`，每行 ≤34 字）、标题 1.3
- 字重：**仅 400 / 500 / 700**（宿主约束：Figma 510 一律渲染 CSS 500，禁 510/590 幻想值）——400 正文、500 表头/按钮/Tab 激活、700 门禁分数等关键强调
- 字距：中文正文一律 0（禁给中文加字距）；全大写拉丁标签 `0.06em`（RRULE 标签行、版本号）；≥24px 标题 `-0.01em`

## 4. Components（组件规范）

### 4.1 基座：官方 `@deepseek-ai/dsh-client-ui-primitives` 优先（不整库引入第三方框架）

**直接使用（已核实导出，本机 v0.1.0-rc.6）**：

| 官方组件 | 本项目用途 | 关键 props（实测） |
|---|---|---|
| `Button` | 全部按钮 | `variant: 'primary' \| 'ghost' \| 'outline' \| 'toolbar'`，`size: 'md'`(36px) `\| 'sm'`(28px) |
| `Input` | 表单输入 | — |
| `Menu` | 「推草稿箱 ▾」下拉、筛选下拉、行操作菜单 | — |
| `Modal` | 定时弹层、RiskConfirmation 载体 | — |
| `Toast` | 推送成功/失败反馈、系统通知 | — |
| `Tooltip` | 图标按钮悬浮说明（无标签图标按钮必须配） | — |
| `Pill` | 状态标签、来源标签、关键词标签 | — |
| `StateDot` | 状态点（`state: 'done' \| 'warning' \| 'ongoing' \| 'error'`，默认 10px，aria-hidden 需配文字） | — |
| `DisclosureRow` | 门禁报告规则折叠行、设置分组 | — |
| `RiskConfirmation` | 「启用 freepublish 群发」显式 opt-in 确认（输入「我理解群发不可撤回」） | — |
| `SearchBlock` | 文章库搜索 | — |
| `ReadBlock` / `DiffBlock` | 门禁报告正文、AI 修稿前后 diff | — |
| `CodeBlock` / `TerminalBlock` | 流式输出预览（末 6 行滚动） | — |
| `HoverCard` | 热榜条目悬浮摘要 | — |
| `ConnectionBanner` | 公众号连接状态（顶栏右侧） | — |
| `MarkdownText` | 待办/历史记录里的富文本 | — |
| `use-copy-feedback` | 复制按钮反馈 | — |

**蓝色主 CTA 实现口径**：官方 `Button variant="primary"` 默认是宿主近黑填充（`--dsw-alias-button-primary-fill`）。本项目主 CTA 用品牌蓝：`<Button variant="primary" className="ww-btn-accent">`，`.ww-btn-accent` 仅覆写填充三态（`background: var(--ww-accent)` / hover `--ww-accent-hover` / active `--ww-accent-active`，文字 `--ww-accent-on`）——结构、字号、focus 环、禁用态全部继承官方件，不重写按钮。

### 4.2 自建组件清单（官方缺位处，全部挂 `--ww-*` token）

| 自建组件 | 用途 | 要点 |
|---|---|---|
| `PanelTabBar` | 面板顶栏 5 Tab + 右侧连接状态 | 高 `--ww-header-h` 48px；Tab 激活 = 500 字重 + 下沿 2px `--ww-accent` 指示条（全栏唯一 accent 位之一） |
| `PipelineStepper` | 生成中六阶段进度（选题→研究→写作→门禁→排版→配图） | 完成项折叠单行摘要；当前项展开子状态；失败阶段红 + 续跑按钮 |
| `HotspotRow` | 热榜条目行 | 行高 44px；展开摘要 + 相关链接；命中关键词行底 `--ww-accent-subtle` |
| `ArticleTable` | 文章库数据表 | 等宽列 = slug/分数/定时；状态点三态（见 4.4） |
| `EditorWorkbench` | CodeMirror 6 编辑区 + 浮动格式工具条 | `@uiw/react-codemirror`；等宽 `--ww-font-code` |
| `PreviewCanvas` | 375px 微信预览画布 | 底 `--ww-canvas-bg` 固定浅色；排版主题 CSS 作用域限定画布容器；与 API 载荷字节一致 |
| `ScheduleCard` | 定时队列卡片 | RRULE 等宽原文 + 人类可读翻译双行 |
| `SettingsNav` | 设置页左栏 5 组竖导航 | 结构同宿主设置页 |
| `CredentialField` | 凭据掩码输入 | 掩码回显（前4后4）；eye 切换；「仅存本机」标注 |
| `GateReport` | 门禁报告 | 3xl 分数 + 失败规则列表（规则中文名 + 等宽内部 ID + 定位 + 单项修复） |
| `StatusStrip` | 编辑器底部状态栏信息带 | 等宽：字数 · 门禁分 · 图 N/N · 模型名 |
| `EmptyState` | 统一空状态 | 图标 20px + 主文案（16px）+ 具体动作按钮；文案见各页，禁模板句式 |

### 4.3 图标系统（锁定 lucide-react 唯一库）

- 尺寸两档：**16px 行内 / 20px 按钮内**（面板级 UI 无 24px 场景）；颜色一律 `currentColor`，无多色无填充图标；细描边。
- 业务代码只经 `<Icon name="...">` 封装访问（内部映射 lucide-react 具名导出），不直接写 SVG。
- 语义映射（均为 lucide-react 真实导出，已逐名核验）：

| 语义 | 图标 | 语义 | 图标 |
|---|---|---|---|
| 写作/动笔 | `pen-line` | 门禁通过 | `shield-check` |
| 门禁失败 | `shield-alert` | 发布纪律 | `shield` |
| 排队/定时 | `clock` / `calendar-clock` | 耗时/历史 | `timer` / `history` |
| 热榜 | `flame` | 公众号 | `message-circle` |
| 模型服务 | `cpu` | 图片供应商 | `image` / `image-plus` |
| API 代理 | `globe` | 推送 | `send` |
| 刷新 | `refresh-cw` | 重试 | `rotate-ccw` |
| 收藏 | `bookmark` | 筛选 | `filter` |
| 搜索 | `search` | 返回/继续 | `arrow-left` / `arrow-right` |
| AI 动作 | `sparkles` / `wand-sparkles` | 展开 | `chevron-down` / `chevron-right` |
| 立即执行/暂停 | `play` / `pause` | 删除/关闭 | `trash-2` / `x` |
| 复制 | `copy` | 文章 | `file-text` / `file-pen` / `square-pen` |
| 待办清单 | `list-todo` / `list-checks` | 加载 | `loader-circle` |
| 警示 | `circle-alert` / `triangle-alert` | 成功 | `check` / `circle-check` |
| 实机预览 | `scan-line` / `smartphone` / `qr-code` | 更多 | `ellipsis` / `ellipsis-vertical` |
| 显隐凭据 | `eye` / `eye-off` | 连接测试 | `plug-zap` |
| 设置 | `settings` | 排版主题 | `layout-template` / `palette` |
| 外链 | `external-link` / `link-2` | 空状态 | `inbox` |
| 格式工具条 | `bold` / `italic` / `list` / `list-ordered` / `quote` / `code` / `link` / `heading-2` | 撤销 | `undo-2` |

### 4.4 状态点语言（形状+颜色双重冗余编码，不靠颜色单独传达）

| 形态 | 含义 | 实现 |
|---|---|---|
| `●` 实心 | 终态：已发布 / 已进草稿箱 | `StateDot state="done"`（绿） |
| `◐` 环形 | 进行中：排队 / 生成中 / 执行中 | `StateDot state="ongoing"`（蓝环动画） |
| `▲` 警示 | 拦停 / 重试中 | `StateDot state="warning"`（琥珀） |
| `×` 错误点 | 失败 | `StateDot state="error"`（红） |
| `○` 无点 | 起始态：草稿 | 纯 `Pill` 文字标签（无点） |

每个状态点必须配文字标签（StateDot 是 aria-hidden 的，可访问性靠文字）。

### 4.5 按钮与卡片基线

- Primary（蓝 CTA）：见 4.1 覆写口径；Secondary（次动作）：`variant="outline"`；Ghost（行内轻动作）：`variant="ghost"`；Danger（删除/停队列）：danger 文字 + `--ww-danger-subtle` hover 底，不整块红底。
- 卡片：`--ww-surface` 底 + 1px `--ww-border` + `--ww-radius-lg`(8px) 圆角 + **无默认阴影**；hover 只变 `border-color`，不加发光。禁止 >1px 彩色左边框/侧边条。
- 输入框：1px `--ww-border`，focus 时 `--ww-border-strong` + `--ww-focus-ring`；错误态 border `--ww-danger` + 字段下方具体错误文字（不只在顶部报错）。

## 5. Layout & Spacing（布局与间距）

- **间距**：4px 网格 8 级（`--ww-space-1`…`--ww-space-12` = 4/8/12/16/20/24/32/48px）；禁非标值。
- **圆角**：4 / 6 / 8px 三档 + 9999 胶囊；**8px 是上限**。
- **面板骨架**：顶栏 48px（Tab 条）+ 内容区；内容区左右 `--ww-page-pad` 24px。
- **列表行高 44px**（触摸底线）；等宽列（slug/分数/RRULE）与中文列用材质对比分组。
- **编辑器双栏**：默认 `1fr / minmax(420px, 45vw)`，右侧 = 375px 画布 + 45px padding；拖拽调宽。
- **面板内断点**（按面板内容区宽，非视口）：≥1200 双栏全开；900–1200 窄双栏；<900 编辑器三视图退化单栏 Tab 切换、列表降列。
- **导航**：5 顶级 Tab（写作台/选题中心/文章库/定时任务/设置），认知负荷 ≤5；编辑器是文章库下钻态不占 Tab，内有显式返回。

## 6. Depth & Elevation（深度与阴影）

- **线框分层优先于阴影**：卡片、表格、列表全部靠 `--ww-divider` / `--ww-border` / `--ww-border-strong` 三层 1px 线表达层级，深色主题靠宿主亮度递进（bg #151517 → surface #2C2C2E → raised #353638）而非阴影。
- **阴影仅两级且仅浮层用**：`--ww-shadow-overlay`（下拉/Tooltip）、`--ww-shadow-modal`（模态/抽屉/生成视图）。宿主无 shadow token（Phase 1 草案此处为勘误），此两级为自有 primitive，深色下加深。
- **禁幽灵卡片**：带 1px 边框的元素不再叠 blur ≥16px 阴影。
- **无发光、无毛玻璃、无渐变**：`backdrop-filter` 仅宿主自身使用，插件一律不用。
- **z-index 梯**：dropdown 1000 / sticky 1100 / modal 1200 / toast 1300。

## 7. Do's & Don'ts（设计守则）

### Do（应该做）

1. 颜色一律经 `--ww-*` token 引用（host 引用自动跟主题翻转）；换肤零适配。
2. 等宽字体 + `--ww-code-bg` 承载一切机器味信息（slug/模型名/RRULE/规则 ID/时间戳）。
3. 空状态 = 图标 + 真实中文文案 + 具体动作按钮（各页文案已写死在 §9，前端照抄不造句）。
4. 长时异步操作用阶段化状态视图（PipelineStepper），支持转入后台 + 失败续跑。
5. 凭据永远掩码回显（前4后4）+「仅存本机」标注；错误信息给出分类 + 出路（如 40164 → 出口 IP + 配代理/加白名单两步）。
6. 状态点 + 文字标签双重编码；表单错误贴字段；图标按钮配 Tooltip/aria-label。
7. 发布动作永远先落草稿箱；freepublish 藏二级菜单 + RiskConfirmation 双确认（安全默认长在 UI 结构里）。
8. 示例数据用有机真实值（「阅读 4,721」「2.4M 热度」「88/100」），禁整数化虚构指标。

### Don't（P0 三条 + 高频反模式）

1. **禁 emoji 作功能图标**（CI 扫描正则 `[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]`；白名单仅文章正文 UGC）。
2. **禁任何 linear-gradient**（含 UI chrome；stylelint 规则 `declaration-property-value-disallowed-list: linear-gradient: null` 挂全局，画布 UGC 排版主题文件走文件级豁免且微信主题本身不含紫粉渐变）。
3. **禁 AI 模板味**：Lorem ipsum /「欢迎使用」/「Welcome to」/ 空洞占位文案一律不得出现；无营销 Hero。<!-- p0-allow:rule-quote（禁令条文自引用禁词，QA 扫描器豁免标记） -->
4. 禁裸 hex 进组件（`#fff`/`#000` 也要 token 化）；禁 >1px 彩色侧边框；禁渐变文字（background-clip: text）。
5. 禁给中文加字距；禁 510/590 幻想字重（只有 400/500/700）。
6. 禁装饰性动画（毛玻璃入场/持续脉冲）；动效 >400ms 一律砍。
7. 禁同尺寸卡片网格无限重复（文章库是表格；写作台最近文章限 6 条）。
8. 禁自带主题切换开关（宿主已有；插件再做一个 = 冲突源）。

### CI 扫描配置（Phase 3 落地）

```yaml
# emoji 扫描（AC-14）：src/ 与 docs/design 产物
rg '[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]' src/ --glob '!**/canvas-themes/**'   # 期望零命中
# 渐变扫描：UI chrome 零 linear-gradient（画布排版主题目录豁免）
rg 'linear-gradient' src/ --glob '!**/canvas-themes/**'                                            # 期望零命中
# stylelint：
#   declaration-property-value-disallowed-list: { linear-gradient: null }（canvas-themes 文件级豁免）
```

## 8. Responsive & Accessibility（响应式与无障碍）

- **断点**：面板内容区 900 / 1200 两档（寄生 UI 无自有视口）；<900 编辑器退化单栏三视图 Tab、表格隐藏次要列（slug 等宽列优先保）。
- **触摸目标**：列表行 44px 底线；图标按钮命中区 ≥44×44px；按钮间距 ≥8px。
- **键盘**：表格/编辑器是键盘主战场——Tab 序 = 视觉序；CodeMirror 原生键位保留；所有动作按钮键盘可达；`Tab`/`ArrowUp/Down` 走官方 primitives 自带。
- **焦点**：统一 `--ww-focus-ring`（3px accent 半透明环）；官方件自带 focus-visible，自建组件必须同款；禁移除焦点环。
- **对比度**：正文 `--ww-fg` on `--ww-bg` ≈17:1（light）/≈15:1（dark）；次级 ≈4.9:1，全部过 WCAG AA 4.5:1。`--ww-fg-caption` 仅用于 ≥12px 非关键元信息。
- **reduced-motion**：tokens.css 已写全局关闭块（animation/transition 0.01ms）；StateDot ongoing 的环动画同样被关。
- **5 态覆盖**：每个交互组件覆盖 Loading（骨架/spinner/流式输出）/ Empty（§9 各页文案）/ Error（分类 + 重试/出路）/ Populated / Edge（超长标题截断 + title 提示、零结果、超限提示）。
- **屏幕阅读器**：StateDot aria-hidden 配文字；纯图标按钮必须有 aria-label；状态变化用 aria-live（生成完成/推送结果）。

## 9. Agent Implementation Guide（前端实现指南 + 六页提示词）

### 9.0 全局实现要点

1. **入口**：React 挂载根元素带 `class="dsh-wewrite-panel"`，面板内 `import './styles/tokens.css'`（--ww-* 作用域即生效；深色自动跟随宿主）。
2. **颜色纪律**：组件样式只写 `var(--ww-*)`；design-tokens.json 是查 token 的真源，不手抄色值。
3. **图标**：`<Icon name="pen-line" size={16|20}>` 封装；name 必须来自 §4.3 表；新增图标先核验 lucide-react 真实导出名。
4. **文案**：以下各页文案为写死的真源，照抄；新文案遵循「具体动词 + 真实对象」句式，禁模板句。
5. **已知坑**（摘自 spec §11）：React 必须 peerDep 不捆绑（双实例破坏 slots）；`dsh.bundle` 声明缺失 = 装而不活；md2html 真身 vendored 进 `src/render/`（预览与推送载荷字节一致的前提）。

---

### 9.1 写作台（`/`）

- **布局**：纵向三段——今日待办（列表）→ 最近文章（横向卡片列，≤6 张，非等宽强调）→ 底部主题输入条（sticky）。顶栏 = PanelTabBar（本页 Tab 激活）+ 右侧 ConnectionBanner。
- **组件**：`PanelTabBar`、`ConnectionBanner`、待办行（图标 + 时间 + 摘要 + 动作链接）、文章卡（标题 + 状态 Pill + 元信息）、输入条（Input + 主 CTA Button）、`EmptyState`、生成中行（StateDot ongoing）。
- **状态**：
  - 空（新用户）：待办区 `还没有排队中的任务。先去选题中心挑一条热榜，或直接输入主题。` + `[去选题中心]`；未配置公众号时该按钮换 `[配置公众号]`。
  - 空（无文章）：`第一篇还没诞生。上面输入主题，3 分钟后回来预览。`
  - 加载：snapshot 拉取中用骨架行（`--ww-skeleton` 底），不用 spinner 转圈。
  - 生成中（转入后台后）：待办区显示 `◐ 正在生成《…》` 行，完成后 aria-live 通知 + 红点。
  - 成功：输入主题 → 进生成流程（§9.4 编辑器页内 PipelineStepper 全屏态）。
- **文案示例**（待办行，真实数据格式）：`09:30 排队发布《DSH 插件开发指南（三）》` ／ `门禁未过 1 篇 ·《V4 Pro 实测补记》` ／ `热榜更新 23 条 · 2 条命中你的关键词`；输入条 placeholder：`输入主题，直接开写…`；主按钮：`开始写作`。
- **图标**：`pen-line` `clock` `shield-alert` `flame` `sparkles` `arrow-right` `calendar-clock` `loader-circle` `inbox` `message-circle` `file-text`。

### 9.2 选题中心（`/hotspots`）

- **布局**：左右双栏（≥1200）——左热榜列表（主区，行 44px，按热度排序），右「我的选题关键词」窄栏（关键词标签 + 添加 + 命中筛选开关）；<900 右栏折叠为顶部抽屉。页头：来源标签（微博/知乎/HN）+ 更新时间 + 刷新按钮。
- **组件**：`HotspotRow`（可展开：摘要 + 相关链接 + AI 分析按钮）、关键词 `Pill`（带 x 移除）、`Button variant="ghost"`（写这个/收藏）、`HoverCard`（条目悬浮摘要）、`EmptyState`、单源失败隔离条。
- **状态**：
  - 空：`热榜还没拉取。点击刷新，或检查设置里的数据源配置。` + `[去设置]`。
  - 加载：列表骨架 + 刷新按钮转 `loader-circle`。
  - 失败（单源）：该源区块显示 `此源暂时拉不到（HTTP 503）。其他源不受影响。`，其余源正常展示（AC-3）。
  - 成功：`更新于 07:00`；「写这个」→ 带 topic 直进生成流程，选题上下文自动注入。
  - Edge：命中筛选开启且零命中：`没有命中「DSH 插件」的条目。换个关键词，或关掉筛选看全部。`
- **文案示例**：`#1 DeepSeek 发布 V4 Pro 限量版` ／ `热度 2.4M · 微博 · 3 小时前` ／ 按钮 `写这个` `收藏` `AI 分析选题角度`。
- **图标**：`flame` `refresh-cw` `pen-line` `bookmark` `sparkles` `filter` `plus` `x` `external-link` `chevron-down` `inbox` `loader-circle`。

### 9.3 文章库（`/articles`）

- **布局**：页头（计数 + 状态筛选下拉 + 搜索框）+ 数据表格（非卡片网格）：列 = 标题 / 状态 / 门禁 / 定时 / 更新 / 操作；等宽列 = slug、门禁分数、定时表达式。行 44px，hover `--ww-interactive-hover`。
- **组件**：`ArticleTable`、状态 `StateDot` + `Pill`（4.4 状态点语言）、`SearchBlock`、筛选 `Menu`、行操作（编辑/去修复/删除确认 `Modal`）。
- **状态**：
  - 空：`还没有文章。去选题中心挑一条热榜，或在写作台输入主题开始第一篇。` + `[去选题中心]`。
  - 加载：表格骨架（表头 + 5 行 skeleton）。
  - 失败：`文章列表拉取失败（存储不可用）。重试` + `[重试]`。
  - 成功：状态过滤即时生效；门禁列 `<阈值` 显示 `shield-alert` + 红色分数。
  - Edge：超长标题单行截断 + `title` 提示；>200 篇提示 `仅显示最近 200 篇（可在设置调整保留上限）`。
- **文案示例**（行数据）：`开源一夜 91k 星之后` ／ `● 已发布` ／ `92/100` ／ `◐ 排队中` `明天 09:30`；操作 `编辑` `去修复`。
- **图标**：`search` `chevron-down` `shield-alert` `file-text` `file-pen` `trash-2` `inbox` `clock`。

### 9.4 编辑器（`/articles/:id`，文章库下钻）

- **布局**：页头（返回 + 标题 + 状态 Pill + 自动保存时间 + 动作区：三视图 Tab[编辑/微信预览/门禁报告] + 配图 + 推草稿箱 ▾）→ 主区双栏（左 CodeMirror 6 + 浮动格式工具条；右 375px 预览画布，`1fr / minmax(420px, 45vw)` 拖拽调宽）→ 底部 StatusStrip 状态栏。<900 三视图退化单栏 Tab。
- **组件**：`EditorWorkbench`（CodeMirror 6）、`PreviewCanvas`、`StatusStrip`、`GateReport`、`Menu`（推草稿箱 ▾：推草稿箱 / 推草稿箱并定时…；freepublish 若启用藏第二级 + RiskConfirmation）、格式工具条、`Toast`。
- **状态**：
  - 加载：`article/get` 期间编辑区骨架 + 画布 skeleton；预览刷新 <1s 本地渲染（AC-8），期间画布角标 `渲染中…`（不整屏遮罩）。
  - 保存：失焦/停顿自动保存，页头显示 `自动保存于 12 秒前`；保存失败 StatusStrip 变 `保存失败 · 网络不可用` + 重试。
  - 推送成功：按钮态 `推送中…`（loader-circle）→ Toast `已进草稿箱` + 状态变 `● 草稿箱`。
  - 推送失败：Toast 分类原因（IP 白名单 / token 过期）+ `[去设置代理]` 直达（AC-1/AC-6：errcode 40164 显示出口 IP 与两条出路）。
  - 门禁未过推草稿箱：阻断默认路径，弹 `门禁未过（68/100）。修改后再推，或显式选择「仍然推送」。`（AC-7）。
  - 门禁报告态（§4.3 流程）：`3xl` 分数 + 失败规则行（规则中文名 + 等宽 ID + 定位 + `[定位到段落]` `[AI 修这稿]`）；示例文案：`人味不足 humanness 41（阈值 55）` ／ `L42–L58 连续 3 段无具体数字/专名` ／ `编号配图不一致 文中「图 3」缺对应图片`；全修按钮 `AI 修这稿（全部）`（只重写问题段落，diff 展示）。
  - 生成中（从选题/写作台进入）：PipelineStepper 全屏态——六阶段折叠行 + 当前项子状态 + 等宽流式输出末 6 行 + `[转入后台]` `[取消生成]`（取消二次确认）；失败阶段红 + `[重试本阶段]` 续跑（AC-4）。
- **文案示例**（状态栏）：`2,841 字 · 门禁 88/100 · 图 3/3 · 模型 deepseek-v4`（全等宽）。
- **图标**：`arrow-left` `file-pen` `eye` `shield-check` `image` `image-plus` `send` `chevron-down` `palette` `layout-template` `scan-line` `smartphone` `qr-code` `loader-circle` `circle-check` `circle-alert` `globe` `shield-alert` `wand-sparkles` `bold` `italic` `list` `list-ordered` `quote` `code` `link` `heading-2` `undo-2` `x`。

### 9.5 定时任务（`/schedule`）

- **布局**：页头（Tab：排队中(n) / 全部历史(n) + `[+ 新建定时]`）→ 排队队列（ScheduleCard 列表）或执行历史（时间线列表）。dsh-automation 是此页形态直接参照。
- **组件**：`ScheduleCard`（RRULE 等宽原文 + 人类可读翻译双行 + `[暂停]` `[改期]` `[立即执行]`）、历史时间线行（结果 StateDot + 耗时 + 动作）、`Modal`（新建/改期：时间选择 + 重复规则一次/每天/每周几，实时翻译成 RRULE 等宽原文展示；目标 = 草稿箱，默认锁定）、`EmptyState`。
- **状态**：
  - 空：`队列是空的。在编辑器里点「推草稿箱 ▾ → 定时」，或从选题中心创建每日选题任务。`
  - 加载：队列骨架卡。
  - 排队态生命周期：`○ 已排期 → ◐ 时间到·执行中 → ● 已进草稿箱`；执行失败 → `▲ 失败·已重试 1/3`，3 次后停队列 + 写作台待办红点（不静默丢弃）。
  - 门禁拦停：`定时到达但门禁未过，已拦停`（不推不合格稿）。
  - 错过（DSH 未运行）：下次启动提示 `DSH 离线期间错过 2 个定时任务`（错过即错过，无云端补偿，AC-11）。
  - 成功历史示例：`08-17 09:30 《插件开发指南（二）》 3 分 12 秒 · 已进草稿箱`；失败历史示例：`08-16 07:00 图片供应商全链失败 · 已重试 1 次 · [日志]`。
- **图标**：`clock` `calendar-clock` `timer` `history` `play` `pause` `file-pen` `plus` `check` `rotate-ccw` `triangle-alert` `inbox` `ellipsis`。

### 9.6 设置（`/settings`）

- **布局**：左栏 5 组竖导航（每组一屏，避免长表单滚动迷失）+ 右侧内容区。宿主 `settings.plugin.item` slot 另挂「入口卡」（插件总开关 + 打开完整设置）。
- **组件**：`SettingsNav`、`CredentialField`（掩码 + eye 切换 + `仅存本机`）、`Input`、`Menu`（模型/供应商选择）、图片供应商 fallback 链（拖拽排序 + 每家 `[测试]`）、`Button`（测试连接）、`DisclosureRow`（折叠高级项）、`RiskConfirmation`（freepublish opt-in：输入 `我理解群发不可撤回` 才能打开）。
- **状态**：
  - 凭据已配置：回显掩码（前4后4，如 `wx1a…3c7d`）+「已配置」徽标（credentials/describe 驱动）。
  - 测试中：按钮 `测试中…`（loader-circle）。
  - 测试成功：`草稿箱 API 可达`（success 提示条）。
  - 测试失败：分类显示具体 HTTP 状态与解释——`无法访问微信接口（超时）。检查代理地址是否可达。` ／ 40164 场景：`出口 IP 1.2.3.4 不在白名单。两条出路：① 设置里配置 API 代理地址；② 微信后台把该 IP 加入白名单。`（AC-6）。
  - 发布纪律页：默认只到草稿箱（锁定态开关 + 文案解释为什么）；`发布目标：草稿箱（锁定）——群发不可撤回，v0.1 不提供自动群发。`
  - Edge：代理 URL 格式非法时字段级错误 `代理地址必须以 http(s):// 开头`。
- **图标**：`message-circle` `cpu` `image` `globe` `shield` `eye` `eye-off` `plug-zap` `key-round` `check` `circle-alert` `loader-circle` `image-plus` `settings`。

---

## 附：设计门禁自检记录（P0 三条扫描，2026-08-18 实际执行）

扫描对象 = 本 Phase 三个产物：`docs/design/design-tokens.json`、`src/client/styles/tokens.css`、`docs/DESIGN.md`。

```bash
cd /Users/mac/Documents/workspace/apps/dsh-wewrite

# ① emoji 扫描（P0-1，人格指定正则）
rg -n '[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]' \
  docs/design/design-tokens.json src/client/styles/tokens.css docs/DESIGN.md
# 结果：零命中（exit=1）。首轮扫描曾命中 DESIGN.md 中 3 个文档标注字形
#（状态表叉号与 Do/Don't 标题的勾叉符号，均为文档记号非 UI 图标），
# 已替换为 2600-27BF 区外写法（× 与纯文字标题）后归零。

# ② 渐变扫描（P0-2）
rg -n 'linear-gradient\(' src/client/styles/tokens.css
# 结果：零命中（exit=1）——CSS 值位零渐变定义。
rg -c 'linear-gradient' docs/design/design-tokens.json src/client/styles/tokens.css docs/DESIGN.md
# 结果：7 处均为「禁令条文/stylelint 配置/CI 示例」文本自身（tokens.css 注释 2、
# JSON guarantees 字符串 1、DESIGN.md 规则与 CI 配置 4），无一处是样式定义。

# ③ 紫粉四色扫描
rg -in '#7C3AED|#A855F7|#EC4899|#6366F1' \
  docs/design/design-tokens.json src/client/styles/tokens.css docs/DESIGN.md
# 结果：3 处命中全部是「禁令声明文字」本身（JSON guarantees / tokens.css 头注释 /
# DESIGN.md §2.1），任何 token 值中零出现。

# ④ AI 模板味占位扫描（P0-3）
rg -in 'lorem|ipsum|welcome to|sign up today|get started|欢迎使用|敬请期待|coming soon' \ # p0-allow:rule-quote
  docs/design/design-tokens.json src/client/styles/tokens.css docs/DESIGN.md
# 结果：1 处命中 = DESIGN.md §7 Don't 第 3 条禁令条文自身引用的禁词；
# 全部空状态/按钮/提示文案为 §9 各页写死的真实中文产品文案，零占位味。
```

**结论**：P0 三条全过。① 零 emoji（含文档层）；② token 层零 gradient 定义（构造保证成立）；③ 紫粉四色零出现；④ 空文案零占位味。Phase 3 CI 按 §7 配置同款扫描固化。

## 附：产物清单与统计

| 产物 | 路径 | 统计 |
|---|---|---|
| Design Token（机器可读真源） | `docs/design/design-tokens.json` | 81 个 leaf token（颜色 30 / 字体 20 / 间距 8 / 圆角 4 / 描边 1 / 阴影 2 / 动效 4 / 布局 5 / 断点 2 / z-index 4 / 焦点 1）；JSON 语法校验通过 |
| CSS 实现（运行时真源） | `src/client/styles/tokens.css` | 79 个 `--ww-*` 定义 + 3 个深色覆写（accent-ring/shadow-overlay/shadow-modal）；断点 2 项为媒体查询值仅存 JSON（media query 不支持 var()） |
| 设计契约 | `docs/DESIGN.md` | 九节契约 + 6 页实现提示词（写作台/选题中心/文章库/编辑器/定时任务/设置）+ 门禁自检记录 |
| 图标语义表 | DESIGN.md §4.3 | 64 个 lucide-react 图标名，全部经本机 lucide-react 图标文件逐名核验为真实导出（零「待核验」项） |
