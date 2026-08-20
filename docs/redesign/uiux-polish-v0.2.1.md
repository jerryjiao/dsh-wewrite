# dsh-wewrite UI/UX 打磨 Delta（v0.2.1）

> 作者：Jarvis（项目总监，MVP 开发专家团） | 日期：2026-08-20
> 输入：Jerry 指令（「UI 还是不好看，比如两个顶栏不符合 UX 设计逻辑」+「AI 总结热门榜」）+ 浏览器实测问题清单
> 性质：在 `uiux-workbench-delta.md` §1 DOM 契约之上的**视觉与交互 delta**。§1 契约的 class/testid/role 命名一律不破；本文只改视觉处理与新增功能面。
> 门禁：tsc / vitest / eslint / build 四连 + 既有 E2E 全绿 + P0 视觉门禁（禁 emoji 图标、禁紫粉渐变、禁裸 hex）。

---

## 0. 实测问题清单（浏览器 DOM snapshot 实证，2026-08-20）

| # | 问题 | 证据 | 级别 |
|---|---|---|---|
| P1 | 双顶栏：宿主 banner（会话层级 + 对话/轨迹/自动化/写作台 tablist）与插件 `ww-topbar`（写作/选题/定时）两根全宽 bar 上下叠加，各自带底边框，像两个系统的 chrome 硬拼 | DOM：两个 `banner` 兄弟节点 | 用户点名 |
| P2 | 热门榜 = 30 条英文 HN 标题裸列，无任何加工；中文作者难以快速判断今天什么值得写 | hotspots-panel 快照 | 用户点名（AI 总结） |
| P3 | 编辑器三视图 tab 无可访问名：editor.css 在编辑器页头 `.ww-view-tab__label { display:none }` 后按钮无 aria-label，role=tab 全空名 | 快照 `tab:` ×3 空名 + editor.css:50 | a11y bug |
| P4 | 定时列表把 RRULE 代码 `FREQ=WEEKLY;BYDAY=WE;...` 当正文段落展示 | schedule-panel 快照 | 开发者视角残留 |
| P5 | 热门榜关键词 Pill 整体点击即删除，无确认无撤销，误触风险 | hotspots-panel `Pill onClick=remove` | 交互细节 |
| P6 | 「写这个」按钮 hover/键盘聚焦才可见——触屏设备（hover:none）无 fallback 需核对 | hotspots-panel L5 注释 | 交互细节 |

## 1. D1 顶栏视觉降级（解 P1，不改 DOM 契约）

宿主 banner 插件不可控，因此把 `ww-topbar` 从「系统级 bar」降级为「工作台内工具行」：

- 背景 `--ww-bg`（白）+ 全宽 `border-bottom strong` → **透明底（随 `.ww-content` 的 `--ww-bg-page`）+ 去掉全宽底线**；顶栏与内容区之间不再有硬分隔，视觉上与页面融为一体。
- 导航 3 Tab 从「浏览器 tab」（通高 + 底部 accent 下划线）改为 **segmented control（胶囊分段）**：容器浅底圆角槽（`--ww-surface-sunken`），激活项白底/`--ww-surface` + accent 文字 + 微阴影，非激活项次级文字。这是「控件」语言而非「chrome」语言。
- `ww-topbar__conn` / `ww-topbar__settings` / 进度点保持右端，视觉重量不变（次级文字 + 28px 热区）。
- 高度维持 `--ww-toolrow-h`（40px），padding 左右与 `.ww-content` 非 flush 态对齐（`--ww-space-6`）。
- **不变**：`header.ww-topbar` / `nav.ww-topbar__nav` / `button.ww-tab(.ww-tab--active)` / 全部 data-testid / `aria-current="page"` 语义 / 进度点+conn+settings 结构顺序。
- sticky 行为保留（长列表滚动时导航常驻）。

## 2. D2 热门榜 AI 速览（解 P2，新功能）

一键把当前榜单 + 我的选题关键词交给宿主 LLM，生成中文「选题速览卡」：

- **RPC**：新增 `hotspots/summarize`（contract.ts + rpc.ts dispatch + service 方法）。
  - request：`{ items: Array<{ rank: number; title: string; url: string }>, keywords: string[] }`（strictObject，items 1–100 条）
  - response：`{ summary: string; model: string; generatedAtIso: string }`
  - host 侧复用 `src/host/pipeline/llm.ts` 的 `streamLlmText` + `settings.llmDefault` 的 provider/model，`purpose: 'wewrite-hotspots-digest'`，maxTokens 2000，60s 超时 AbortController。
  - 系统提示：技术公众号选题编辑，中文输出，行结构纯文本（见下），不写套话。
  - 用户提示：榜单（rank+title+域名）+ 关键词列表。输出格式约束（**纯文本行结构，不依赖 markdown 解析**）：
    - 首行 `主线：` 一句话今天榜单整体在说什么
    - `· 〈主题〉：#n #m #k —` 若干分组行（2–4 组）
    - `值得写：` 后跟 1–3 行 `· #n 〈中文推荐角度〉 — 理由一句话`
    - `命中：` 一行（哪些 rank 命中关键词，没有则写「无」）
- **UI**（hotspots-panel）：
  - pagebar 增「AI 速览」ghost 按钮（`wand-sparkles` 16px 图标 + 文案），loading 态转圈；失败 ErrorNote 带重试。
  - 速览卡置于列表上方：头部行（sparkles 图标 + 「AI 速览」 + model + 生成时间 + 重新生成 + 收起），正文按行渲染（`主线：`/`值得写：`/`命中：` 行加粗前缀，`·` 行缩进列表化）。
  - 缓存：localStorage `dsh-wewrite.hotspot-digest`，键含榜单签名（首条 title + 条数 + 日期）；签名变化时卡片仍展示旧摘要但标注「榜单已更新，重新生成」，点击重新生成覆盖。
  - 不新增 npm 依赖（react peer 冲突坑，见 .agent/memory/pitfalls.jsonl）。
- **E2E**：group-c-hotspots 增 1 用例（mock RPC 返回固定摘要 → 按钮出现、卡片渲染、缓存生效）；live 相位不跑真 LLM（避免烧 token/慢测）。

## 3. D3 细节修复（P3–P6）

- **P3**：`EditorHeadActions` 三视图 tab 按钮加 `aria-label={tab.label}`（label 被 CSS 隐藏时名字仍在）。
- **P4**：schedule 卡移除可见 RRULE code 段落，人话行（`每周三 07:00 · 下次 …`）保留；RRULE 移入 `title` attr 供悬停查看。
- **P5**：关键词 Pill 点击目标改为 Pill 内的 `×` 图标（Pill 本体不再整删；Pill 悬停时 × 才显色提示可点）。
- **P6**：核对 hotspots `ww-hotspot__write` 的显示条件，补 `@media (hover: none)` 常显 fallback。

## 4. 非目标

- 不动宿主 banner（不可控）。
- 不改 DOM 契约命名/结构角色（56 E2E 依赖）。
- 不 commit——工作区已有 270 文件被 Mimosa 门禁卡住待 Jerry 裁决；本轮改动一并留在工作区。
- 不新增 npm 依赖；不做榜单标题逐条翻译（速览卡已覆盖信息提炼，避免过度工程）。
