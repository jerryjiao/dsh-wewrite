# dsh-wewrite v0.3 需求 Delta（逐条速览 + 侧边栏直进 + AI 改写 + 全局精修）

> 作者：Jarvis（项目总监，MVP 开发专家团） | 日期：2026-08-20
> 输入：Jerry 四条需求（2026-08-20 口头）+ grill-with-docs 共识清单（Q1=B 逐条抓原文 / Q2=A 选中即改 / Q3=D 设计师主导精修 / Q4=A 侧边栏入口叫「写作台」）
> 前序：uiux-polish-v0.2.1.md（上一轮，其中 §2 整卡 AI 速览被本文 §1 撤销替代）
> 门禁：tsc / vitest / eslint / build / check:p0 + E2E fresh+demo 全绿 + 浏览器 live 实测（逐条速览真抓原文真 LLM、侧边栏入口、AI 改写）

---

## 0. 决策记录（grilling 定案，不再翻案）

| # | 需求 | 决策 |
|---|---|---|
| R1 | 热榜 AI 速览 | **逐条**（不是整卡）：信息源 = 抓原文→正文→LLM 中文总结；抓不到降级标题速览；点开才生成；逐条缓存 |
| R2 | 侧边栏直进 | `sidebar.footer.action` 挂「写作台」入口（设置旁）；点击 → `shell.overlay` 全屏浮层 = 完整写作台；会话内 tab 保留；「新建会话」是宿主 chrome 不碰 |
| R3 | AI 修改草稿 | **选中即改**（Notion AI 式）：选区→「AI 改写」→一句指令→只重写选中段→替换可撤销；不做全文指令重写 |
| R4 | UI 再专业化 | 设计师按 Linear/Stripe 标准全局面精修（间距节奏/层级/字重/动效/噪音清理），Jerry 验收 |

**撤销项**：v0.2.1 §2 的整卡 AI 速览全链路（RPC `hotspots/summarize`、HotspotDigest.tsx、pagebar 按钮、C07 E2E、hotspots-summarize.test.ts、i18n hotspots.aiDigest 族、panels.css digest 段）——本轮 §1 替代。可复用件：digestSystemPrompt/digestUserPrompt 的行结构风格、WewriteServiceError 错误分流模式、llm seam 调用模式。

## 1. R1 逐条 AI 速览（热榜）

### 契约
- 新 RPC `hotspots/digestItem`：request `strictObject { rank: int 1-100, title: string 1-500, url: string http(s) }`；response `{ digest: string 1-4000, source: 'article' | 'title', model: string, generatedAtIso: ISO }`。
- 移除 `hotspots/summarize` 端点（contract/rpc/service/测试同步删；端点总数 21→22）。

### host 侧（新模块 `src/host/hotspot-digest.ts`，≤300 行）
1. **抓取**：fetchImpl GET `url`，8s 超时，重定向跟随，2MB 截断，只接受 text/html（Content-Type 前缀判断）。
2. **抽取**：零依赖启发式——剥 `<script>/<style>/<noscript>/<nav>/<header>/<footer>/<aside>/<svg>` 块与 HTML 注释；`<article>/<main>` 优先（存在则在其内抽取）；剥全部标签后折叠空白；取前 8000 字符；结果 < 300 字符视为抽取失败。
3. **LLM**：复用 `streamLlmText` + `settings.llmDefault`；purpose `wewrite-hotspot-item-digest`；maxTokens 800；45s AbortController。
   - article 模式提示：输入=标题+域名+正文节选；输出=中文两段行结构纯文本：首行 `这条在讲什么：` 一句话；后跟 2-4 行 `· 要点`（具体事实/数字/结论，不写套话）。
   - title 模式（降级）提示：输入=标题+域名；输出=首行 `标题解读：` 中文译名+一句话；`· 角度：` 一行，从公众号选题视角给一个可写角度。**输出必须带模式自说明**——`source` 字段由 host 依抽取结果判定，不由模型自报。
4. 错误分流（WewriteServiceError）：`llm-not-configured`（沿用）/ `digest-timeout` / `digest-empty`；抓取失败**不是错误**——静默降级 title 模式；`digest-item-error`（LLM 供应商错误透传）。
5. 日志：成功一行（source/model/耗时/正文字符数）、失败一行（code）。

### client 侧
- 热榜行展开区（现 `ww-hotspot__expand`）重构：展开 = 原文链接行（保留）+ AI 速览块。首次展开自动触发生成（懒加载），loading 骨架行；错误显示 ErrorNote+重试。
- 逐条缓存：localStorage `dsh-wewrite.hotspot-item-digests` = `{ [url]: { digest, source, model, generatedAtIso } }`，单日有效（次日同 URL 重新生成，榜单日更语义）；缓存命中不调 RPC。
- 速览块视觉按设计文档（§D1）。

### E2E
- C07 改写为逐条版：预置 localStorage 缓存 → 展开首条 → 速览块渲染（source 标签 + 行结构锚点）+ 原文链接仍在；清缓存→展开→loading 态断言（不 mock RPC，同 v0.2.1 理由：进程内 loopback 拦不到）。

## 2. R2 侧边栏直进（写作台全屏浮层）

- `src/client/index.tsx` 在既有 conversation.view 注册之外**追加两个注册**（同一 apply()，同一 `rpc`/`fallbackT` 闭包）：
  1. `sidebar.footer.action`（list/root）：`WewriteSidebarEntry`——按官方 `wide` prop 双形态：wide=图标+「写作台」整行、窄=36px 图标钮；点击 `setOverlayOpen(true)`（模块级状态）。
  2. `shell.overlay`（list/root）：`WewriteOverlay`——closed 渲染 null；open 渲染全屏浮层：`ww-overlay` 容器（inset 全屏、`--ww-bg-page` 底）+ 顶行（pen-line 图标+「写作台」标题 + 收起按钮）+ 内嵌完整 `WewriteApp`（同一组件复用，独立实例）。
- 关闭路径：顶行收起钮 + Escape（浮层内 keydown）。
- 宿主契约注：两个 slot 均为官方公开 additive（dsh-client-ui-sidebar slots.d.ts / dsh-app-boot SKILL.md:308 先例 cordis-panel），绑定宿主 0.1.0-rc.7，注册失败降级 console.warn 不炸（沿用 warnDegraded 模式）。
- 会话内 conversation.view tab 原样保留（双入口）。
- 新 DOM 命名（不在冻结清单）：`ww-sidebar-entry` / `ww-overlay` / `ww-overlay__head` / `ww-overlay__close` + data-testid 同名族。

## 3. R3 AI 修改草稿（选中即改）

### 契约
- 新 RPC `article/rewrite`：request `strictObject { text: string 1-8000, instruction: string 1-200, title: string 0-200（文章题名，语气锚点，可空） }`；response `{ text: string 1-16000 }`。

### host 侧（service 方法，提示词进 llm.ts 照 digest 先例）
- system：公众号写作改稿助手；只输出改写后的文本，无前言后语无代码围栏；保持 Markdown 结构（标题层级/列表/代码块不动骨）；忠实原意执行指令。
- user：指令一行 + 原文。maxTokens `min(4000, text.length * 3 + 500)`；45s 超时；错误分流 `llm-not-configured` / `rewrite-timeout` / `rewrite-empty` / 透传供应商 code。
- 日志一行（model/耗时/原文长/产出长）。

### client 侧（EditorWorkbench + 新组件 `RewritePopover.tsx` ≤300 行）
- CodeMirror `updateListener` 监听选区：非空选区且未开浮条时，选区上方浮出小 chip「AI 改写」（wand-sparkles 16px）；点击开 popover：指令输入框（Enter 提交）+ 4 个快捷 chip（更口语 / 精简一半 / 扩写细节 / 更有数据感）+ 生成中态 + 取消。
- 生成完成：`view.dispatch` 以 LLM 文本替换选区（单一 transaction，进 undo 历史，Ctrl+Z 可回滚）；选区被替换后 popover 关闭。
- 并发守卫：同屏一次；生成中禁再触发；RPC 失败 ErrorNote 式行内提示（不 toast 轰炸）。
- 与既有浮动格式工具条互不干扰（浮条=格式、chip=AI，分层级视觉按设计文档 §D2）。

### E2E
- group-e 增一例：编辑器选中文本（键盘 shift+end）→「AI 改写」chip 出现 → 点开 popover → 快捷 chip 可见 → 取消关闭。真 LLM 生成由总监浏览器人工验（E2E 不跑真模型）。

## 4. R4 全局面精修（设计师主导）

- 颜好看对 `src/client/styles/` 全部 12 个 css 做一轮 Linear/Stripe 标准审计，产出**逐文件可照抄 CSS delta**：间距节奏统一（4px 网格回归）、层级（边框/阴影/底色三档语言收敛）、字重与字号阶梯、动效时长曲线复核、视觉噪音清理（多余边框/重复分隔线/过度 hover 反馈）。
- 范围含本轮新面（速览块/侧边栏入口/浮层/改写 popover）与存量（rail/editor/preview/settings/schedule/generation）。
- 硬约束不变：零渐变、零裸 hex、零新 token（除非声明宿主引用源）、零新依赖、DOM 契约不破、深浅双主题成立、Motion=3 纪律（无进入动效）。

## 5. 非目标

- 不碰「新建会话」（宿主 chrome，无贡献点）。
- 不做全文指令重写、不做改写历史 diff 面板（撤销走 CodeMirror undo 即可）。
- 不做速览的批量预生成/后台预热（懒生成够用）。
- 不 commit（Mimosa 门禁悬置，工作区叠加）；版本号不动（0.2.0，等解锁时与 v0.2.0/v0.2.1 一并定 tag 切法）。
- E2E live 相位不跑（真 LLM 由总监浏览器人工验）。
