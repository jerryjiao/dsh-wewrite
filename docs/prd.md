# dsh-wewrite 产品需求文档（PRD）

| 项 | 内容 |
|---|---|
| 产品 | dsh-wewrite — DeepSeek Harness（DSH）微信公众号 AI 写作插件 |
| 版本 | v0.1 PRD（对应产品 v0.1.0） |
| 作者 | 许清楚（MVP 专家团 PM），2026-08-18 |
| 状态 | Draft → 待项目总监裁决 |
| 上游输入 | `docs/FACTS.md`（Phase 0 共享事实包，本文直接引用不重述）；Jerry 功能清单（带案入场，不再澄清提问） |
| 下游 | 架构师（技术选型/插件结构）、设计师（UI 规范）、QA（验收基线） |

---

## 1. 问题陈述

**谁**：已经在用 DSH（本地 AI Agent harness，91k+ stars，`npx @deepseek-ai/dsh web` 即起）的技术博主、独立开发者、内容创业者——他们运营微信公众号，且已经为本机配置好了大模型供应商。

**什么痛点**：想用 AI 持续产出公众号文章，现有方案全部断裂成几截：

1. **排版工具只有排版**：doocs/md 这类编辑器解决「Markdown→微信图文」，但选题、写作、配图、推送全靠人肉串联，最终还要手动复制粘贴进公众号后台。
2. **AI 写作工具是黑盒 SaaS**：135编辑器、壹伴、讯飞绘文等闭源工具按年订阅，模型不是用户自己的，风格不可控，数据经过第三方。
3. **开源管线工具上手门槛高**：md2wechat-skill（Go CLI）等项目的用户反馈集中在三件事——微信 IP 白名单/凭据配置踩坑、CLI 环境折腾、出稿慢（知乎实测者原话大意：「用那点时间我手动排版 10 篇都够了」，来源见 §3）。
4. **没有定时化**：以上方案几乎都没有「RRULE 定时跑管线 → 自动进草稿箱」的能力，内容创作者每天仍要手动触发。

**现在怎么解决、为什么不行**：Jerry 自己用一条私有 skill 管线（workspace-writer/wewrite，30+ 篇真实文章验证）解决了这个问题，但它是个人工作流，不是产品——没有配置界面、没有安装路径、没有对外文档。**dsh-wewrite 要做的就是把这条已验证的管线产品化给所有 DSH 用户**：一条命令安装，界面里配好凭据和供应商，之后「给主题出一篇」或「每天 4 点自动跑」。

---

## 2. 目标用户与场景

### 2.1 主要画像：技术型公众号号主（核心，占预期 80%+）

- **身份**：开发者 / AI 从业者 / 独立博主，25-40 岁，运营科技、AI、开发向公众号（周更 2-7 篇）。
- **环境**：本机已装 DSH（`~/.dsh/` 已存在，已配模型插件与 API key），会用命令行但不享受折腾配置。
- **技术水平**：高。能读懂报错、会配环境变量；但期待「装完即用」，不接受为了发一篇文章研究半天 IP 白名单。
- **核心诉求**：把我自己的模型订阅变成内容生产力；写作风格稳定可复现；发出前我必须能过目（默认只进草稿箱）。

### 2.2 次要画像：重度内容创业者（v0.1 服务其单账号场景）

- **身份**：多平台内容创业者，AI 工具早期使用者，技术能力中等。
- **诉求**：热门榜选题 + 定时出稿，把「选题焦虑」和「日更纪律」外包给管线。
- **边界**：多账号管理、团队协作、数据看板不是 v0.1 范围（见 §8）。

### 2.3 核心场景（3 个）

**场景 A — 给定主题出稿**：用户在 DSH Web UI 里对 dsh-wewrite 说「写一篇关于 XX 的公众号文章」。管线执行：选题确认 → 联网研究 → 写作 → 质量门禁 → 排版 → 配图 → 推草稿箱。用户在编辑器 tab 里预览微信样式、改稿、重新推草稿。全程 10-20 分钟，人只在选题确认和终稿过目两个点介入。

**场景 B — 热门榜选题**：用户打开「热门榜」面板，看到 AI/科技向热榜（Hacker News、微博/知乎等聚合）条目，点选一条 → 以该热点为主题进入场景 A。

**场景 C — 定时自动出稿**：用户配好 RRULE（如每天 04:00），管线自动选题（或按预设主题轮换）→ 出稿 → 推草稿箱。第二天早上用户在公众号后台草稿箱里审稿，满意就手动群发。**插件永不自动群发**（除非用户显式 opt-in，见 §4.2）。

---

## 3. 竞品结论

### 3.1 竞品矩阵（调研日期 2026-08-18）

| 竞品 | 形态 | 核心功能 | 优势 | 劣势（来自差评/issue） | 定价 |
|---|---|---|---|---|---|
| [doocs/md](https://github.com/doocs/md) | Web 编辑器（开源） | Markdown→微信图文渲染、主题样式、多图床、AI 助手小功能、浏览器扩展 [doocs/cose](https://github.com/doocs/cose) 多平台同步 | 排版体验成熟、社区大（微信排版事实标准）、可私有部署 | **只有排版**：无选题、无管线、无定时；进草稿箱仍靠复制粘贴/扩展 | 免费开源 |
| [geekjourneyx/md2wechat-skill](https://github.com/geekjourneyx/md2wechat-skill) | Go CLI（开源，最接近的竞品） | md→微信 HTML→封面配图→就绪检查→推草稿箱；6 家图片供应商；小绿书图文 | 管线化、机器可读命令、有 inspect 诊断；**同样把「微信固定出网代理」和 gpt-image-2 作为关键路径**（与我们判断一致，交叉验证） | 用户反馈三大痛点：① 微信 IP 白名单（errcode 40164）与凭据门槛高；② CLI/Go 环境对非开发者不友好，出稿慢；③ 免费模式只出提示词不出成品 HTML，免费/付费边界后置暴露（来源：[zread issue 分析](https://zread.ai/geekjourneyx/md2wechat-skill/5-issues-and-feedbacks)） | 免费模式 + 付费 API 代理（md2wechat.com） |
| [imraywang/wewrite](https://github.com/imraywang/wewrite) | Agent Skill（开源） | 抓热点→选题→搜素材→按人格出稿→审稿→配图/排版/推草稿 | 全流程概念与我们最像 | 纯 skill 无 UI、无配置界面、无定时调度、无安装分发形态；绑定特定 Agent 运行时 | 免费开源 |
| [iniwap/AIWriteX](https://github.com/iniwap/AIWriteX) | CrewAI 多智能体平台（开源） | 热点选题+实时搜索+AI 创作+排版+配图+自动发布 | 功能面最全、有 Web UI | 重（Python/CrewAI 独立部署）、不是 DSH 原生、自动发布与「人过目」价值观冲突 | 免费开源（自托管成本高） |
| [135编辑器](https://www.135editor.com/) | SaaS | 135AI 写作（40+ 场景）、「生文 Agent」3 秒成文+排版、SVG 互动 | 运营者基数大（官网宣称 2000 万，UNVERIFIED 宣传口径）、排版模板海量 | 闭源 SaaS、订阅制、模型非用户自己的、风格不可控、内容数据过第三方 | 免费+订阅会员 |
| [壹伴](https://yiban.io/) | 浏览器插件（闭源） | 嵌入公众号后台，AI 编辑器+模板+数据+定时群发 60+ 功能 | 与公众号后台贴合最紧、上手快 | 闭源、年订阅（搜索口径约 400 万用户，UNVERIFIED）；群发自动化强但无「管线可复现」概念 | 基础免费+年订阅 |
| [讯飞绘文](https://turbodesk.xfyun.cn/) | 企业 SaaS | AI 写作+选题+配图+排版+发布一体（宣称通用稿 30 分钟） | 企业级全流程、多平台分发 | 偏企业定价、闭源黑盒、重平台 | 套餐/按量 |
| [titanwings/dsh-automation](https://github.com/titanwings/dsh-automation) | DSH 插件（非竞品，参照物） | RRULE 调度、每次 dispatch 起新 Agent+Session、运行历史带 revision 快照、Web UI tab | 证明了 DSH 内做定时任务+UI tab 的完整形态（FACTS 实测 v0.1.5） | 不做内容生产，与 dsh-wewrite 无重叠 | 免费开源 |

**DSH 生态空白确认**：`AdamPlatin123/awesome-dsh-plugins`（[仓库](https://github.com/AdamPlatin123/awesome-dsh-plugins)）的研究目录收录约 60 个插件（dsh-weixin-bot / dsh-wecom-bot 为 IM 桥接，dsh-feishu-bot 为飞书 bot 等），**没有任何一个微信公众号写作/发布管线插件**。PLUGINS.md 登记清单目前仅 4 条且支持 PR 收录（约定 `@dsh-external/*` scope + repo 打 `dsh-plugin` topic）。→ **dsh-wewrite 是 DSH 生态内该品类第一个**，先发窗口明确。

### 3.2 热门榜数据源可用性（场景 B 的供给面）

| 源 | 可用性 | 说明 |
|---|---|---|
| Hacker News 官方 API | ✅ 公开免费无 key | `https://hacker-news.firebaseio.com/v0/`（文档：[HackerNews/API](https://github.com/HackerNews/API)）；AI hot 选题的主源 |
| [imsyy/DailyHotApi](https://github.com/imsyy/DailyHotApi) | ✅ 开源自托管（约 2.7k+ star） | 聚合微博/知乎/百度/抖音/B站/头条/豆瓣/V2EX/GitHub 等热榜，JSON+RSS，Docker/Vercel 一键部署；**产品内置支持用户填自建实例 URL，不内置第三方公共实例**（公共实例无 SLA 且合规主体不明） |
| 源管线自带 fetch_hotspots.mjs | ✅ 已有资产 | FACTS.md 脚本资产表；v0.1 优先移植此脚本的数据源清单，DailyHotApi 作为可配置扩展源 |

**结论**：选题数据源供给无风险；合规姿态是「用户自备聚合源 URL + 公开 HN API」。

### 3.3 我们的差异化（用户为什么选 dsh-wewrite）

1. **DSH 原生，一条命令装进已有生产力工具**：竞品要么是独立部署的重平台（AIWriteX），要么是裸 CLI（md2wechat-skill），要么是 SaaS（135/壹伴/讯飞）。我们装进用户每天已经在用的本地 harness，模型、会话、UI tab 全部复用，零额外部署。
2. **管线经过 30+ 篇真实文章验证**：不是 prompt demo，是 Jerry 实际运营纪律的产物（质量门禁 --strict、编号配图一致性门禁都在管线里）。
3. **安全默认的产品价值观**：默认只进草稿箱、群发必须显式 opt-in、凭据只落本地、日志脱敏——闭源竞品以「全自动群发」为卖点，我们以「人过目」为卖点，这是对公众号账号资产的保护（号被封的损失远大于省下的审稿时间）。
4. **免费开源 MIT + 无锁定**：微信 API 代理地址是**用户可配置项**（可指向任何固定出口 IP 的代理），不把用户锁到我们的付费代理上——直接反打 md2wechat-skill 被差评的「免费/付费边界后置」痛点。
5. **先发**：DSH 生态该品类空白（§3.1），借助 awesome-dsh-plugins 收录 + 官方 awesome 清单获取自然流量。

---

## 4. 产品原则与硬约束（PRD 级红线，实现不得违反）

### 4.1 P0 视觉门禁（workspace 全局，违反=退回重做）

1. **禁 emoji 作功能图标**：所有功能图标统一一套 SVG 图标库（具体库由架构师按 DSH web 端技术栈锁定），PRD 及 UI 文案中图标一律用文字描述（如「火焰图标」表示热点）。
2. **禁紫→粉渐变主视觉**：`#7C3AED` / `#A855F7` / `#EC4899` / `#6366F1` 不得参与 linear-gradient；Indigo/Slate 纯色可用（对齐知识库 ai-native.md：主色深蓝/靛蓝方向，强调色翠绿仅用于 AI 生成标识，每屏强调色≤2 处）。
3. **禁 AI 模板味**：不出现 Lorem ipsum / "Welcome to" / 空洞占位文案 / 无意义硬编码颜色；空状态文案必须给真实引导（如「先在设置页填入公众号凭据」而非「暂无数据」）。

### 4.2 安全默认（产品价值观，不可谈判）

1. **定时发布默认只到草稿箱**；群发（freepublish）**只在用户显式 opt-in 后才可用**，opt-in 开关默认关闭且开启需二次确认。v0.1 不实现 freepublish 调用（见 §8），本条作为未来引入时的前置契约写入。
2. **微信 API 走可配置代理**：草稿箱/素材 API 有 IP 白名单约束（errcode 40164 是竞品差评第一大来源），产品必须把「API 代理 base URL」做成配置项（含「不代理直连」选项），并在连接测试里给出明确的白名单诊断指引。
3. **凭据本地存储**：微信 appid/secret、模型 API key、图片供应商 key 只落本地（DSH storage 插件目录），不入 git、不出网络（除各自 API 端点）。
4. **日志脱敏**：任何日志/UI 报错中 secret、access_token、API key 出现即掩码（保留前后各 4 字符以内可见）。
5. **gpt-image-2 为图片生成第一供应商**（Jerry 指令），其余 8 家（doubao/dashscope/jimeng/minimax/azure_openai/gemini/openrouter/replicate，来自源管线 image_gen.mjs 的 fallback 矩阵）按序 fallback。

---

## 5. 功能列表（MoSCoW + RICE）

RICE 口径：Reach=受影响用户占比（1-10）；Impact=单用户影响（0.25/0.5/1/2/3）；Confidence=确信度（100%=源管线已验证/80%=有竞品佐证/50%=直觉）；Effort=人月（1=半天 … 10=3 个月+）。Score = R×I×C/E。

| ID | 功能 | MoSCoW | R | I | C | E | Score | v0.1 |
|---|---|---|---|---|---|---|---|---|
| F1 | 管线核心：给定主题出成稿（研究→写作→门禁→排版） | Must | 10 | 3 | 100% | 4 | **7.5** | ✅ |
| F3 | 草稿箱推送（push_to_draft 移植 + 可配置代理 + 连接测试） | Must | 9 | 3 | 100% | 2 | **13.5** | ✅ |
| F5 | 热门榜选题（HN API + fetch_hotspots + 自建 DailyHotApi 源） | Must | 7 | 2 | 100% | 1.5 | **9.3** | ✅ |
| F2 | 配置界面：公众号凭据 / 大模型供应商 / 图片供应商（gpt-image-2 第一）+ 连接测试 | Must | 10 | 2 | 80% | 3 | **5.3** | ✅ |
| F6 | 质量门禁（quality_validate --strict --json + 编号配图一致性） | Must | 10 | 1 | 80% | 1.5 | **5.3** | ✅ |
| F4 | 文章编辑器 + 微信样式预览（md2html + inline_styles） | Must | 8 | 2 | 80% | 3 | **4.3** | ✅ |
| F7 | 配图生成（9 供应商 fallback，gpt-image-2 第一） | Should | 8 | 1 | 100% | 2.5 | **3.2** | ✅ |
| F9 | 运行历史（每次管线运行的记录 + revision 快照） | Should | 6 | 1 | 80% | 1.5 | **3.2** | ✅（简化版：列表+产物，不做 replay UI） |
| F8 | RRULE 定时出稿（默认进草稿箱，参照 dsh-automation） | Should | 5 | 2 | 80% | 3 | **2.7** | ✅ |
| F10 | 群发 freepublish（显式 opt-in） | Could | 2 | 1 | 80% | 1 | 1.6 | ❌ v0.2+ |
| F11 | 数据回流（fetch_stats 阅读量回看） | Won't (v0.1) | 4 | 1 | 80% | 2 | 1.6 | ❌ Backlog |
| F12 | 风格学习（learn_edits / extract_exemplar / fetch_article） | Won't (v0.1) | 4 | 2 | 80% | 3 | 2.1 | ❌ Backlog |

> 说明：MoSCoW 以 Jerry 功能清单为准（带案入场），RICE Score 决定**实现顺序**：F3→F5→F1→F2/F6→F4→F7/F9→F8。F3 得分最高且 Effort 最小（脚本已验证），应最先打通「能推草稿箱」这条信任链。

---

## 6. 功能详述：用户故事与验收要点（EARS）

> 验收句式采用 EARS：「When [触发], the system shall [响应]」「While [状态]…」「If [非期望条件], then the system shall…」「Where [可选特性包含]…」。EARS 条目即 QA 验收基线。

### F1 管线核心：给定主题出成稿

**用户故事**：作为一个 DSH 用户/公众号号主，我想在 Web UI 里输入主题就得到一篇过完质量门禁、排好版的成稿，这样我不需要在 5 个工具之间搬运。

**范围**：移植源管线「研究→写作→质量门禁→排版」主干（对应资产：quality_validate.mjs、md2html.mjs、inline_styles.mjs 的逻辑进入插件管线），选题输入来自用户主题或 F5。

**验收要点（EARS）**：
- When 用户提交主题且模型供应商连接测试通过，the system shall 在单次管线运行内产出：Markdown 原稿 + 微信内联样式 HTML + 门禁报告三件产物，并在 UI 呈现产物列表。
- When 管线任一阶段失败（研究/写作/门禁/排版），then the system shall 停止后续阶段、显示失败阶段与原因（脱敏后），并保留已完成阶段的产物供续跑。
- While 管线运行中，the system shall 展示阶段进度（至少：研究中/写作中/门禁中/排版中四态）且提供中止按钮。
- If 用户中途关闭页面或 DSH 重启，then the system shall 可从运行历史中恢复未完成运行的产物（产物持久化，不依赖页面会话）。
- Where 质量门禁以 --strict 口径执行，the system shall 将门禁未通过的稿子标记为「未过门禁」，且**禁止**直接进入 F3 推草稿（用户修改或显式覆盖后可推）。

### F2 配置界面（凭据/大模型供应商/图片供应商）

**用户故事**：作为不想碰配置文件的用户，我想在设置页填一次凭据和供应商就能用，并在保存前知道配置对不对，这样我不会在深夜对着 errcode 40164 发呆。

**验收要点（EARS）**：
- When 用户首次安装插件并打开任一功能，the system shall 引导进入设置页（空状态给真实引导文案，不许「暂无数据」式占位）。
- When 用户保存公众号凭据（appid/secret），the system shall 仅将其写入本地 DSH storage 目录，且界面回显掩码（前 4 后 4）。
- When 用户点击任一供应商的「测试连接」，the system shall 给出 通过/失败 + 失败原因分类（凭据错误 / IP 白名单 / 网络不可达 / 代理未配置），失败时不写盘。
- Where 图片供应商配置存在，the system shall 将 gpt-image-2 置为默认第一供应商，fallback 链顺序可在 UI 调整。
- When 微信连接测试返回 errcode 40164（IP 不在白名单），then the system shall 显示出口 IP 与「配置代理 base URL 或将 IP 加入白名单」两条出路的具体步骤。
- The system shall 在所有配置保存路径上阻止明文 secret 进入日志或错误消息。

### F3 草稿箱推送（含可配置代理）

**用户故事**：作为号主，我想一键把成稿推进公众号草稿箱，这样发不发的决定权在我手里，但搬运工作归机器。

**验收要点（EARS）**：
- When 用户对一篇「已过门禁」的文章点击「推送到草稿箱」，the system shall 调用微信草稿 API（draft/add，经配置的 base URL 直连或代理）并在成功后展示公众号后台可查的提示。
- When 推送因 IP 白名单/凭据/网络失败，then the system shall 呈现分类错误 + 诊断指引（同 F2 口径），且不产生半成品草稿（失败原子化，不重复插入）。
- Where 配置了代理 base URL，the system shall 所有微信 API 调用（含素材上传）统一走该 URL，不出现部分直连部分代理的混合路径。
- When 同一篇文章重复推送，the system shall 询问「再次插入新草稿 / 覆盖」而非静默重复。
- The system shall 在草稿推送成功回执中记录媒体 ID 与时间到运行历史（脱敏）。

### F4 文章编辑器 + 微信样式预览

**用户故事**：作为要对终稿负责的号主，我想在推送前用微信的真实渲染效果预览并就地改稿，这样不用在公众号后台来回试样式。

**验收要点（EARS）**：
- When 用户打开一篇文章产物，the system shall 提供左侧 Markdown 编辑 + 右侧微信样式（内联样式 HTML）实时预览的分栏视图。
- When 用户编辑 Markdown，the system shall 在 1 秒内完成预览刷新（本地渲染，无网络往返）。
- Where 预览组件存在，the system shall 以公众号实际渲染约束为准（内联样式、受限标签集），预览即所得。
- When 用户保存修改，then the system shall 更新运行历史中的 revision（成稿可追溯，不覆盖历史版本）。

### F5 热门榜选题

**用户故事**：作为不知道写什么的号主，我想在一个面板里看 AI/科技热榜并一键转成选题，这样选题从「刷半小时手机」变成「点一下」。

**验收要点（EARS）**：
- When 用户打开热门榜面板，the system shall 展示默认源（Hacker News API）的条目列表（标题/热度/链接/抓取时间），加载中显示骨架屏。
- Where 用户配置了自建聚合源 URL（如自部署 DailyHotApi），the system shall 拉取并按来源分组展示，未配置时展示「直连可用源」而不报错。
- When 用户选中一条热点并点击「以此为题」，the system shall 以该条目标题+链接作为主题与参考材料进入 F1 管线。
- If 热榜源超时或不可达，then the system shall 标记该源失败并继续展示其他可用源，不允许单一源失败清空整个面板。
- The system shall 不内置任何无 SLA 的第三方公共热榜实例为默认值（合规与稳定性）。

### F6 质量门禁

**用户故事**：作为读者会仔细看文的号主，我想让机器先按我的质量标准筛一遍（结构、编号配图一致性、AI 味指标），这样推出去的稿子不砸招牌。

**验收要点（EARS）**：
- When 管线写作阶段完成，the system shall 自动执行质量门禁（strict 口径）并输出结构化报告（通过/未过 + 分项）。
- When 文章包含编号配图，the system shall 执行编号一致性校验，不一致即判未过并指出具体编号。
- When 门禁未通过，then the system shall 在 UI 明确列出未过项与建议动作，且阻断 F3 的默认推送路径（见 F1）。
- The system shall 门禁报告全量落运行历史，可对比不同 revision 的分数变化。

### F7 配图生成

**用户故事**：作为要封面和插图的号主，我想按文章段落生成配图并自动上传素材库，这样一篇文章的视觉物料不用开三个网站。

**验收要点（EARS）**：
- When 用户对成稿请求配图，the system shall 以 gpt-image-2 为第一供应商生成，失败时按用户配置的 fallback 链自动降级，并在产物中标注实际使用的供应商。
- When 全部供应商失败，then the system shall 允许「无图推进」（配图是增强项不是阻断项），门禁中配图相关项降级为警告。
- Where 配图成功，the system shall 完成微信素材上传并回填 media_id（走 F3 的统一代理路径）。

### F8 RRULE 定时出稿（默认草稿箱）

**用户故事**：想要日更纪律的号主，我想配一个「每天 04:00 自动跑管线进草稿箱」的计划，这样早上一睁眼后台就有待审稿。

**验收要点（EARS）**：
- When 用户创建 RRULE 计划（频率/时间/主题策略：固定主题轮换或热榜自动选题），the system shall 按 dsh-automation 已验证的调度形态执行：每次 dispatch 起新 Agent+Session、运行历史留 revision 快照。
- While 定时计划启用，the system shall **默认且强制**产物去向为草稿箱；v0.1 无任何自动群发路径（freepublish 不实现）。
- When 一次定时运行失败，then the system shall 记录失败并可配置重试策略（默认不自动重试，避免重复插稿），失败可见于运行历史。
- If DSH 在计划时刻未运行，then the system shall 错过即错过（本地插件不做云端补偿），并在下次启动时提示错过的计划数。

### F9 运行历史

**用户故事**：作为要复盘的号主，我想看到每次管线运行的输入/产物/门禁分数/去向，这样我知道这套管线到底产出了什么。

**验收要点（EARS）**：
- When 任一次管线运行结束（成功或失败），the system shall 落一条含 时间/主题/各阶段产物指针/门禁报告/推送状态 的记录。
- When 用户打开历史列表，the system shall 支持按时间倒序、按状态（成功/失败/未过门禁）过滤。
- The system shall 历史记录中所有凭据类字段脱敏；历史数据仅存本地。

---

## 7. 非功能需求

| 类别 | 要求 | 优先级 |
|---|---|---|
| 安全-凭据 | 凭据仅存本地 DSH storage 插件目录；不入 git（.gitignore 覆盖）；导出/备份功能 v0.1 不提供（避免误导出明文） | P0 |
| 安全-日志 | 全链路日志脱敏（secret/access_token/API key 掩码）；错误上报给 UI 前过同一脱敏器 | P0 |
| 安全-默认 | 定时只进草稿箱；无自动群发；群发 opt-in 契约预留（§4.2） | P0 |
| 网络-代理 | 微信 API base URL 可配置（直连/自定义代理二选一）；连接测试给出白名单诊断（errcode 40164 专项指引） | P0 |
| 兼容-平台 | 声明支持的 DSH 版本（v0.1.x developer preview，以 FACTS 实测的 2026-08-14 版本为基线）；对平台 API 做 feature detection，不硬依赖内部符号；插件声明 `dsh.bundle`（否则装而不活） | P0 |
| 性能 | 预览渲染本地 <1s（F4）；管线阶段进度可感知；单阶段超时有上限并可中止 | P1 |
| 视觉 | §4.1 P0 视觉门禁三条；图标统一 SVG 库（架构师锁定）；空状态/错误态给真实引导文案 | P0 |
| 可用性 | 热榜单源失败不清空面板（F5）；图片全供应商失败不阻断出稿（F7）；微信 API 失败原子化（F3） | P1 |
| 可观测 | 运行历史结构化记录（F9）；本地日志按运行 ID 归档 | P1 |
| 国际化 | UI 中文为主（产品面向中文市场）；代码层文案集中管理，预留后续 i18n 空间 | P2 |
| 可访问性 | 键盘可达 + 对比度基本合规（WCAG 2.1 AA 目标） | P2 |

**数据埋点（开源本地插件的特殊口径）**：不做默认遥测（与「凭据不出本地」的信任卖点一致）。埋点采用**本地计数**（安装量由 GitHub clone/安装日志不可得，用 GitHub stars/releases 下载量等公开指标替代）；产品内置可选「匿名使用统计」开关，默认关闭，若开启仅上报事件名+版本（`pipeline_run_completed`、`draft_push_succeeded`、`schedule_created` 等 `{对象}_{动作}` 命名），不上报主题、文章内容、任何凭据或 IP。README 明示此策略。

---

## 8. MVP 范围划界（v0.1.0）

### 做（§5 全部 Must + Should）

主题写作管线（F1）、草稿箱推送+可配置代理+连接测试（F3）、热门榜选题（F5）、配置界面（F2）、质量门禁（F6）、编辑器+微信预览（F4）、配图生成 9 供应商（F7）、简化版运行历史（F9）、RRULE 定时出稿-默认草稿箱（F8）。

### 不做（out-of-scope，写入 README 管理预期）

1. **群发 freepublish**：v0.1 不实现调用；opt-in 契约（§4.2）留给 v0.2。
2. **数据回流**（fetch_stats 阅读量看板）。
3. **风格学习**（learn_edits/extract_exemplar/fetch_article 范文导入）。
4. **多公众号账号管理**（v0.1 单账号；多账号是 md2wechat-skill 用户提出的真实需求，排 v0.2 候选）。
5. **团队协作/云端部署/多用户**（本地单人插件）。
6. **小绿书（newspic）等其他微信内容形态**。
7. **自建热榜聚合服务**（只消费 HN 官方 API + 用户自备的聚合源 URL）。
8. **自有付费代理服务运营**（代理 URL 是用户配置项，我们不卖代理）。

### 明确不做的产品形态

不做 SaaS、不做账号系统、不做付费墙——MIT 开源，变现不在本产品内闭环（对齐 workspace 生产资料定位 ADR-0001：agent 系统是资产端的手段）。

---

## 9. 开源产品化要求

| 项 | 要求 |
|---|---|
| License | MIT，repo = `jerryjiao/dsh-wewrite` |
| 安装路径 | README 首屏一条命令：`npx @deepseek-ai/dsh plugin --profile web add github:jerryjiao/dsh-wewrite#v0.1.0`（**必须打 version tag 并 pin**，干净安装关键） |
| no-build | 交付预构建产物，不依赖 install 时 prepare 脚本——避免用户手动加 `allowBuilds` 的信任门槛（FACTS 已核实该机制） |
| 插件声明 | 必须声明 `dsh.bundle`，否则装而不活（CLI 警告 plain dependency） |
| 版本兼容声明 | README 明示「支持 DSH v0.1.x developer preview（2026-08-13 发布）」+ 兼容表；DSH v0.1 处于 breaking changes 预期窗口，插件做 feature detection 防御 |
| README 结构 | 是什么（一句话+30 篇验证管线的可信度陈述）/ 5 分钟快速开始（装→配凭据→出一篇）/ 配置说明（凭据、供应商、代理、热榜源）/ 安全声明（草稿箱默认、凭据本地、日志脱敏、无默认遥测）/ FAQ（IP 白名单 errcode 40164 专条，吸收竞品差评教训）/ 版本兼容表 / Roadmap（v0.2: freepublish opt-in、多账号、数据回流） |
| 生态收录 | 发布后向 `AdamPlatin123/awesome-dsh-plugins` 的 PLUGINS.md 提 PR（遵守其约定：repo 名即插件名、`dsh-external/*` scope 思路对齐、打 `dsh-plugin` topic）；并争取官方 `deepseek-ai/awesome-deepseek-agent` 收录 |
| 命名空间 | 不占用 `@deepseek-ai/*` 保留命名空间 |
| 文档语言 | README 中文为主（目标用户中文市场）+ 英文简版段落 |

---

## 10. 风险与开放问题（给总监/架构师）

| 风险 | 等级 | 缓解 |
|---|---|---|
| DSH v0.1 breaking changes 导致插件频繁失活 | 高 | feature detection + 版本兼容表 + 快速跟进发版（awesome-dsh-plugins 每日扫描会暴露失活，反而是免费监控） |
| 微信凭据/IP 白名单仍是第一大上手流失点（竞品已验证） | 高 | F2 连接测试 + errcode 40164 专项指引 + FAQ；把「代理 base URL」做成一等公民配置 |
| 用户没有固定出口 IP 且不想自建代理 | 中 | README 给自建反代最小示例；明确「我们没有也不卖代理服务」 |
| 热榜源不稳定 | 中 | F5 多源隔离失败设计；HN API 无 key 稳定为底 |
| 开源后被闭源 SaaS 抄功能 | 低 | 护城河是管线质量（30+ 篇验证的门禁标准）+ DSH 原生形态 + 生态先发，不是代码本身 |

---

## 11. 端到端验证（规格收尾，v0.1 验收总口径）

在干净机器上执行并通过以下全程，才判定 v0.1 交付完成：

1. `npx @deepseek-ai/dsh plugin --profile web add github:jerryjiao/dsh-wewrite#v0.1.0` 安装且无 plain dependency 警告（dsh.bundle 生效、no-build 生效）。
2. 打开 DSH Web UI → 出现 dsh-wewrite tab → 空状态引导到设置页。
3. 设置页填入测试公众号凭据 + 任一模型供应商 → 连接测试通过（含故意填错 secret 看到分类报错）。
4. 热门榜面板出现 HN 条目；选一条「以此为题」。
5. 管线跑通：四阶段进度可见 → 门禁报告生成 → 编辑器可改稿、预览 <1s 刷新。
6. 推草稿箱成功 → 微信后台可见新草稿；再验证错误流：改错代理 URL → 推送失败给出 IP 白名单/代理分类指引且无半成品草稿。
7. 配置 RRULE 每天 04:00 → 下一触发点运行历史出现新记录、草稿箱出现新稿；确认全程无任何群发调用。
8. grep 运行日志与历史存储：无明文 secret/access_token。
9. 视觉走查：无 emoji 功能图标、无紫→粉渐变、无占位文案（§4.1 三条逐一过）。

---

## 附：调研来源

- doocs/md: https://github.com/doocs/md ／ 在线版 https://md.doocs.org/ ／ 扩展 https://github.com/doocs/cose
- md2wechat-skill: https://github.com/geekjourneyx/md2wechat-skill ／ issue 痛点分析 https://zread.ai/geekjourneyx/md2wechat-skill/5-issues-and-feedbacks ／ 凭据与 IP 白名单 https://zread.ai/geekjourneyx/md2wechat-skill/23-wechat-credentials-and-ip-whitelist
- wewrite（imraywang）: https://github.com/imraywang/wewrite
- AIWriteX: https://github.com/iniwap/AIWriteX
- workbuddy-wechat-publisher: https://github.com/cnproduct/workbuddy-wechat-publisher
- DailyHotApi: https://github.com/imsyy/DailyHotApi
- Hacker News API: https://github.com/HackerNews/API （`https://hacker-news.firebaseio.com/v0/`）
- awesome-dsh-plugins: https://github.com/AdamPlatin123/awesome-dsh-plugins （PLUGINS.md 登记清单与 research/ 插件研究目录）
- 135编辑器: https://www.135editor.com/ ／ 壹伴: https://yiban.io/ ／ 讯飞绘文: https://turbodesk.xfyun.cn/ （用户数为官网/搜索宣传口径，标 UNVERIFIED）
- DSH 平台机制、dsh-automation、源管线资产、微信 API 约束：`docs/FACTS.md`（2026-08-14 本机实测，不重述）
