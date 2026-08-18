# dsh-wewrite — 共享事实包（Phase 0 产出，总监维护，专家只读）

> 所有专家 spawn 前必读。这里是已核实的事实，不要重新调研这些，直接引用。
> 最后更新：2026-08-18（Jarvis，项目总监）

## 产品一句话

一个开源 DeepSeek Harness（DSH）插件：把一条经过 30+ 篇真实文章验证的微信公众号 AI 写作管线（选题→研究→写作→质量门禁→排版→配图→草稿箱）产品化，任何 DSH 用户 `npx @deepseek-ai/dsh plugin add github:<owner>/dsh-wewrite` 即装即用。

## 已核实的 DSH 平台事实（2026-08-14 本机实测，来源：apps/dsh-hub field notes）

- DSH = `github.com/deepseek-ai/deepseek-harness`，MIT，v0.1 developer preview（2026-08-13 随 V4 Pro 发布），TypeScript，91k+ stars。
- 启动：`npx @deepseek-ai/dsh web` → 本地 `http://127.0.0.1:3080`，无账号系统，全本地。
- 架构：Cordis 插件加载器为核心；models/tools/skills/sessions/sandboxes/storage/UI 全是插件。换模型插件和换文件编辑器在架构上等价。
- 四种模式（默认插件集）：Standard / PTC / Minimal / Create。
- Session = append-only 事件流（system prompt、thought、tool call、result 全记录），支持 resume/fork/search/replay。
- 插件安装：`npx @deepseek-ai/dsh plugin --profile web add github:titanwings/dsh-automation#v0.1.5`（pnpm 装进 `~/.dsh/profiles/web`）。
- **插件必须声明 `dsh.bundle`**，否则装上但不激活（CLI 会警告 "installed as a plain dependency"）。
- git-hosted 插件若要 build-on-install（prepare 脚本），需用户在 `pnpm-workspace.yaml` 加 `allowBuilds`——我们的插件应尽量走 no-build 路径降低信任门槛。
- 发布要打 version tag 并 pin（干净安装的关键）。
- 本机已有 DSH 安装：`~/.dsh/`（settings.yaml + profiles/web + storages），可用于实测。
- 社区参照插件：`titanwings/dsh-automation`（RRULE 归一化调度、每次 dispatch 起新 Agent+Session、持久化运行历史带 revision 快照、带 Web UI tab）——**定时发布的直接参照**。
- 插件目录生态：`AdamPlatin123/awesome-dsh-plugins`（雷达索引）；官方 `deepseek-ai/awesome-deepseek-agent`。

## 源管线资产（Jerry 私有，位于本 workspace，产品化时移植）

真身：`workspace-writer/wewrite/`（skill 形态）。可移植的脚本资产（`workspace-writer/wewrite/scripts/`，全 Node ESM）：

| 脚本 | 作用 |
|---|---|
| fetch_hotspots.mjs | 抓热门榜（选题源） |
| quality_validate.mjs | 质量门禁（--strict --json） |
| md2html.mjs | Markdown→微信 HTML |
| inline_styles.mjs | 内联样式（微信要求） |
| validate_numbering.mjs | 编号配图一致性门禁 |
| push_to_draft.mjs | 推草稿箱（统一入口，云主机代理） |
| publish_article.mjs / fetch_stats.mjs | 发布/数据回流 |
| image_gen.mjs | 图片生成（**实测仅实现 zhipuai+openai 两家**；9 家矩阵只存在于 config.example.yaml 文档，需产品化时从零实现） |
| humanness_score.mjs / seo_keywords.mjs / solid_cover.mjs | 诊断/关键词/封面 |
| fetch_article.mjs / extract_exemplar.mjs / learn_edits.mjs | 范文导入与风格学习 |

配置面（config.example.yaml）：`wechat:{appid,secret,author}` + `image:{provider(s)}` 多供应商 fallback 结构。

## 硬约束

1. **P0 视觉门禁**（workspace 全局，违反=退回重做）：① 禁 emoji 作功能图标，图标统一一套 SVG 库；② 禁紫→粉渐变主视觉（#7C3AED/#A855F7/#EC4899/#6366F1 参与 linear-gradient；Indigo/Slate 纯色可用）；③ 禁 AI 模板味（Lorem ipsum/"Welcome to"/空洞占位文案/无意义硬编码颜色）。
2. **微信 API 事实**：草稿箱 API（draft/add）有 IP 白名单约束，本机 IP 不在白名单时必须走可配置的代理/云端 base URL。产品必须把「API 代理地址」做成配置项。
3. **安全默认**：定时发布默认只到草稿箱；群发（freepublish）若提供必须是显式 opt-in（这是产品价值观，也是Jerry 自己账号的运行纪律）。
4. **gpt-image-2 是图片生成第一供应商**（Jerry 指令），其余 8 家沿用 fallback 矩阵。
5. 技术栈：**跟随 DSH 平台**（TypeScript/Node/Cordis 插件体系，Web UI 框架以 DSH web 端实际所用为准——架构师核实），不套 workspace 默认的 Cloudflare+Astro 锁定（那是对我们自托管产品的 ADR，DSH 插件形态由平台 dictates，Jerry 明确指令「基于 DeepSeek harness 开发」优先）。
6. v0.1 breaking changes 预期：插件要做好 API 版本防御（feature detection / 版本探测），README 明示支持的 DSH 版本。
7. 开源：MIT，repo = jerryjiao/dsh-wewrite，尽量 no-build 安装路径。
8. 凭据安全：微信 secret/API key 只落本地（DSH storage 插件目录），不明文进 git，日志脱敏。

## 竞品参照（PM/架构师调研起点，不是结论）

- `doocs/md`（微信公众号 markdown 编辑器，社区最成熟的微信排版编辑器）——编辑/预览形态参照。
- `titanwings/dsh-automation`——DSH 内调度 + UI tab 形态参照。
- 微信公众平台文档：草稿箱/素材/freepublish API 族。
- Jerry 实测文章《DeepSeek Harness 开源一夜 8 万星》（2026-08-14，workspace-writer 归档）——平台背景。

## 流程状态

- Phase 0 ✅ 2026-08-18（带案入场：Jerry 功能清单即需求，不再澄清提问）
- 项目位置：`/Users/mac/Documents/workspace/apps/dsh-wewrite/`（独立 git repo，workspace 侧 gitignore——沿用 apps/sitemap-generator 先例）
