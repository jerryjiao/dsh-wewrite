# Spec — dsh-wewrite v0.2.0（写作台工作区化重设计 + 智谱真通道 + E2E 回归）

> 生成日期：2026-08-19 | 状态：**已确认**（Jerry 2026-08-19 指令「制定完善计划后执行」，Phase 1 三文档回传后总监裁决定稿）
> 基于：`docs/redesign/prd-layout-v2.md`（PM 布局 PRD）+ `docs/redesign/uiux-redesign-v2.md`（设计师视觉系统）+ `docs/redesign/test-zhipu-architecture.md`（架构师智谱/E2E 架构）
> 性质：v0.2.0 迭代契约，与 v0.1 `docs/spec.md` 冲突处以本文为准；上游三文档是细节真源，本文只锁裁决与验收。

---

## 0. 总监裁决记录（Phase 1 一致性检查产出）

| 冲突点 | 裁决 | 理由 |
|---|---|---|
| PM 提 4 Tab 工作区 vs 设计师「不改清单」锁 5 Tab | **采纳 PM 4 Tab 工作区范式**，设计师视觉系统（token 增量/密度/反廉价清单/五态规范）全量叠加于新 IA；设计师需补 delta 把视觉规格映射到工作区结构（Phase 2） | Jerry 三痛点本质是信息架构问题；竞品铁律（8 家无一仪表盘首屏）支持结构性重排；视觉系统与 IA 正交可全量继承 |
| 编辑器视图模型：PM 提「三视图+门禁独立」vs 设计师保留 编辑/预览/门禁 三 Tab | **三视图分段控件 [仅编辑｜双栏｜仅预览] + 门禁报告独立**为右侧滑出覆盖面板（入口=StatusStrip 门禁分 chip + 左栏门禁标记行），不再与视图模式混排 | 门禁是「检查报告」不是「编辑视图」，混排是分类不清的病灶之一（Jerry 痛点 3） |
| v0.1.5（llm seam 修复单独发版）vs 本轮合并 | **合并发 v0.2.0**（llm 修复 0318e7b + 重设计 + 智谱通道 + E2E 一次交付） | 0318e7b 已 commit 未发版，拆两版增加发版成本无收益 |
| 架构师 51 用例锚点基于旧 5 Tab DOM | **A–G 组用例按新 IA 重锚**（导航对象 4 个、左栏 class、工作区路由），H/I 组（管线真跑/异常）锚点不变 | E2E 必须测新结构，否则测的是将被删除的 UI |

---

## 1. 产品定义

- **一句话**：寄生在 DSH 宿主内的公众号 AI 写作管线插件，本轮把「仪表盘式面板」重构为「工作区范式」创作工具，接通智谱免费模型真通道，建立 Playwright 无头全用例回归。
- **目标用户**：DSH 宿主用户中运营公众号的开发者（Jerry 本人是 first user）。
- **本轮核心问题**：Jerry 三痛点——写作台难看（视觉执行层丢失）/ 面板排列与空间利用差（IA 错配+白底白卡）/ 功能分类不清（5 平级 Tab 映射管线视角而非用户心智）。

## 2. 本轮范围（锁定——不在列表的一律不做）

| 优先级 | 功能 | 来源 | 验收标准摘要 |
|---|---|---|---|
| P0 | **L2 顶栏重排**：5 Tab→4 导航对象（写作/选题/定时 + 设置齿轮），Tab 条 48→40px，图标+文字，页头与动作合并 40px pagebar，页内大标题行取消 | PM L2 + 设计师 §1a | prd-layout-v2 §5-L2 四条 GWT |
| P0 | **L1 写作工作区化**：左栏文章列表（240-280px 可折叠、36px 行、搜索/状态筛选、门禁标记、底部新文章按钮）+ 主区编辑器默认载入最近一篇；旧 /articles 路由重定向 | PM L1 + 设计师视觉 | prd-layout-v2 §5-L1 五条 GWT |
| P0 | **视觉系统 P0 批**：bg-page 底色分区、shadow-card、CTA enabled 策略修正、卡片 hover 复合反馈、编辑器 head 单行化+状态归一 StatusStrip | 设计师 §6 P0 批 | uiux-redesign-v2 §2/§3 对应条目 |
| P1 | **L4 启动视图**：零文章时主区=单一启动卡（主题输入+两路次级入口），有文章后退位 | PM L4 | prd-layout-v2 §5-L4 三条 GWT |
| P1 | **L3 空间专项**：三视图分段+分栏拖拽+预览缩放档；生成进度去全屏化（右下可收卡片+顶栏进度点） | PM L3 | prd-layout-v2 §5-L3 四条 GWT |
| P1 | **L5 选题动作前置**：热榜行 hover 显「写这个」；无行为按钮（收藏）隐藏 | PM L5 | prd-layout-v2 §5-L5 三条 GWT |
| P1 | **视觉系统 P1/P2 批**：画布井化+notch、空状态组合 glyph、表格行高 44、focus ring inherit、Tab 图标、Toast 抬高、选题窄态横条、操作收纳 ellipsis、设置组头 | 设计师 §6 | uiux-redesign-v2 §3 清单逐条 |
| P1 | **智谱真通道收尾**：hostctl.mjs（launch 时注入 ZHIPU_API_KEY）、默认模型 glm-4.7-flash、dev-install.mjs 原子三连 | 架构师 §1 | 架构文档 ADR-010；G04 断言三免费模型可见 |
| P1 | **E2E 测试套件**：裸 playwright 轻量 runner + 相位制（fresh/demo/live/restore）+ 用例矩阵（A-G 重锚新 IA + H 智谱真跑 5 + I 异常 3） | 架构师 §2 | 架构文档 §2.4 全用例通过 |

## 3. 明确不做（锁定）

| 不做 | 原因 | 何时考虑 |
|---|---|---|
| 自由画布/拖拽排版（秀米式） | 重交互宽空间需求，与 Markdown 管线定位冲突 | 永不（范式排除） |
| 多级侧边导航（微信后台式） | 单功能插件，900px 内挤占内容 | 永不 |
| 独立 AI 对话页 | AI 是管线执行者不是聊天对象（v0.1 已排除） | 永不 |
| freepublish 群发链路改动 | 安全默认（群发人工）不翻案 | — |
| 图片供应商矩阵改动 | 9 家矩阵与智谱无关（glm-4v-flash 是识图）；E2E 走真实失败降级路径 | 独立迭代 |
| npm publish / awesome-dsh 收录 | 记忆悬置项，本轮不碰 | Jerry 发令 |
| 主题模板库/样式市场 | Backlog（PRD §6） | 有用户反馈后 |

## 4. 技术架构（锁定——除新增三项外全部不变）

| 层 | 技术 | 版本锚定 | 说明 |
|---|---|---|---|
| 前端 | React（peer, external 不打包） | ^18.3.1 | 不变；沿用官方 primitives + lucide-react 单库 |
| 编辑器 | CodeMirror 6（@uiw/react-codemirror） | ^4.25.11 | 不变 |
| 宿主接缝 | cordis + dsh ModuleLoader | @deepseek-ai/cordis ^4.0.1 | 不变；build.mjs 工厂壳不动 |
| LLM | 宿主 dsh-llm seam（llm-pi-ai providers.zhipu） | settings.yaml 已配 | 默认模型 glm-4.7-flash（maxTokens 65536）；降级序 4.7-flash→4-flash-250414；**不改 glm-4.5-flash 为默认**（8192 截断风险） |
| **新增** 宿主生命周期 | scripts/hostctl.mjs | node:child_process detached spawn | key 从 ~/.zcode/cli/config.json 现读注入 ZHIPU_API_KEY（ADR-010 方案 B） |
| **新增** dev loop | scripts/dev-install.mjs | — | build→cp lib→hostctl restart 原子三连 |
| **新增** E2E | tests/e2e/（裸 playwright + 自研 runner，不加 @playwright/test） | playwright 1.62.1（workspace 根） | ADR-011；CI 探测 process.env.CI 即跳过 |

RPC 契约（src/shared/contract.ts）与存储（dsh_wewrite 单元）**零改动**。

## 5. 页面清单（锁定——新 IA）

| 导航对象 | 路由 | 核心组件 | 说明 |
|---|---|---|---|
| 写作（默认） | `/` | WorkbenchPanel = 左栏 ArticleRail + 主区（EditorPanel 或 启动卡） | 原 TopicPanel 退役；待办语义→左栏徽标+顶栏进度点 |
| 选题 | `/hotspots` | HotspotsPanel（增量：动作前置+窄态横条） | 不变骨架 |
| 定时 | `/schedule` | SchedulePanel（增量：操作收纳+摘要行 L6 降 P2 可选） | Tab 图标化降权 |
| 设置（齿轮） | `/settings` | SettingsPanel（增量：组头+激活 icon） | 从文字 Tab 改顶栏右端图标 |
| 兼容重定向 | `/articles` `/articles/:id` | navigate() 重写 | 老路由不断 |

顶栏（40px）：`[▪pen-line 写作] [▪flame 选题] [▪calendar-clock 定时] ··· 进度点(运行中) · 连接状态 · [⚙设置]`

## 6. 设计 Token（锁定——增量 5 个，零改名零改值）

`--ww-bg-page` / `--ww-canvas-well` / `--ww-shadow-card` / `--ww-toolrow-h` / `--ww-content-pad-bottom`，定义与宿主引用见 uiux-redesign-v2 §2-2；Phase 2 同步进 `docs/design/design-tokens.json` 与 `src/client/styles/tokens.css`。其余继承 DESIGN.md 九节契约 + P0 三条构造保证（零渐变/紫粉四色/emoji 图标禁令）。

## 7. 验收标准（EARS，QA 测试唯一依据）

细节真源：prd-layout-v2 §5 各项 GWT + uiux-redesign-v2 §3 十六条 + 架构文档 §2.4 矩阵。关键 EARS 摘录：

| 编号 | 验收 | 优先级 |
|---|---|---|
| AC-1 | 打开面板时，顶栏有且仅有 4 个导航对象，总高 ≤40px，无页内独立大标题行 | P0 |
| AC-2 | 存在文章时，默认视图为工作区且编辑器载入最近编辑一篇；切换文章 ≤1 次点击无整页跳转 | P0 |
| AC-3 | 宽 <900px 时左栏退化为顶部文章下拉，编辑器单栏 | P0 |
| AC-4 | 门禁未过文章在左栏显示红色标记，点击直达门禁面板 | P0 |
| AC-5 | 空输入时「开始写作」CTA 不 disabled（点击聚焦输入框）；仅 starting 时禁用 | P0 |
| AC-6 | 管线运行中切到任意 Tab，进度不遮挡内容，顶栏进度点可见可点 | P1 |
| AC-7 | 三视图切换（仅编辑/双栏/仅预览）生效，分栏可拖拽，预览缩放为视觉变换（载荷字节不变） | P1 |
| AC-8 | 热榜行 hover 可见「写这个」，单击即启动管线；无行为按钮不出现 | P1 |
| AC-9 | E2E 图片步走真实失败降级（fallback 链裁单家 openai 1 次 401 快速失败），run 仍 succeeded | P1 |
| AC-10 | 设置页模型菜单出现 zhipu 三个免费模型（glm-4.7-flash/glm-4.5-flash/glm-4-flash-250414） | P1 |
| AC-11 | live 相位智谱真跑：六步全绿产出非空成稿；取消/打断路径行为正确 | P1 |
| AC-12 | P0 视觉门禁三条扫描零违规（check:p0）+ lint + typecheck + vitest 全绿 | P0 |

## 8. 边界与约束

- 断点：≥1200 宽双栏 / 900–1200 窄双栏（视图分段 icon-only）/ <900 单栏+左栏退化下拉（narrow 逻辑沿用）
- 宿主 composer 遮挡兜底：`.ww-content` padding-bottom 96px + Toast 抬高同值
- 性能：预览刷新口径不变；左栏列表阈值沿用 MAX_VISIBLE=200
- localStorage 兼容：既有键不动，新增 `ww.rail.collapsed` 等命名空间键
- E2E 独占窗口：live 相位 kill/重启宿主并独占 storage，与并行 session 冲突——跑前总监协调

## 9. 内嵌已知坑（pitfalls.jsonl 指纹交集）

react-dual-instance-breaks-slots（peer external）/ npm-workspaces-hoist-trap（install 加 --workspaces=false）/ dsh-module-loader-wrapper-needs-module-decl（build 壳勿动）/ dsh-rpc-envelope-and-leading-slash（通道前导斜杠）/ dsh-slot-props-t-is-common-namespace（t 绑定本插件 ns）/ dsh-llm-seam-real-protocol（v0.1.5 重写已 validated）/ dsh-storage-unit-name-regex（dsh_wewrite 下划线）。

## 10. 端到端验证步骤

1. `npm run build`（esbuild client + tsc host）
2. `node scripts/dev-install.mjs`（cp lib → hostctl restart 带 ZHIPU_API_KEY）
3. `npm test`（vitest 单测）+ `npm run lint` + `npm run typecheck` + `npm run check:p0`
4. `npm run test:e2e`（相位 fresh→demo→live→restore；宿主驱动穿越 onboarding→workspace→首消息→写作 Tab）
5. `node scripts/capture-screenshots.mjs`（6 张新截图：工作区/选题/编辑器双栏/定时/设置/空态启动卡）
6. 收尾：README+website 截图替换、版本 0.2.0、host profile pin 更新、commit

## 11. 变更记录

| 日期 | 变更 | 原因 | 影响 |
|---|---|---|---|
| 2026-08-19 | 初版（v0.2.0 迭代 Spec） | Jerry 三痛点指令 + mvp-dev-team Phase 1 三文档 | 面板 IA/视觉/测试/发版 |
