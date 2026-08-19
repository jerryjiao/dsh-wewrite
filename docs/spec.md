# Spec - dsh-wewrite v0.1.0

> 生成日期：2026-08-18（项目总监 Jarvis）
> 基于：PRD v0.1（docs/prd.md）+ 架构文档 v0.1（docs/tech-architecture.md，含 F1-F32 事实清单与 ADR-001~009）+ UIUX 方向文档 v0.1（docs/uiux-direction.md）
> 状态：已确认（带案入场自动确认——Jerry 功能清单为需求真源，三文档一致性检查通过；Jerry 可随时审阅 docs/ 三文档推翻本 Spec，走变更记录）

---

## 1. 产品定义

- **一句话描述**：开源 DeepSeek Harness 插件，把一条经真实生产使用检验的微信公众号 AI 写作管线（选题→研究→写作→质量门禁→排版→配图→草稿箱）产品化，一条命令装进任何 DSH 用户的本地环境。
- **目标用户**：已用 DSH 的技术型公众号号主（开发者/AI 从业者，本机已配模型供应商）；次要是重度内容创业者（v0.1 单账号场景）。
- **核心问题**：现有方案断裂——排版工具只有排版（doocs/md）、AI 写作是闭源 SaaS 黑盒（135/壹伴/讯飞）、开源管线工具上手门槛高且无定时化（md2wechat-skill 差评实证：IP 白名单/CLI 门槛/出稿慢）。

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要（EARS 详见 PRD §6） | RICE |
|---|---|---|---|
| P0 | F3 草稿箱推送（可配置代理 + 连接测试 + errcode 40164 诊断） | 推送成功回填 media_id；失败原子化无半成品；代理全链路统一 | 13.5 |
| P0 | F5 热门榜选题（HN API + fetch_hotspots 移植 + 自建聚合源 URL） | 单源失败不清空面板；选中即带上下文进管线 | 9.3 |
| P0 | F1 管线核心（主题→研究→写作→门禁→排版） | 单次运行产 Markdown+HTML+门禁报告三件产物；四态进度+可中止；中断可恢复 | 7.5 |
| P0 | F2 配置界面（公众号凭据/模型/图片供应商） | 凭据只写本地+掩码回显；连接测试四类失败分类 | 5.3 |
| P0 | F6 质量门禁（strict + 编号配图一致性） | 未过门禁阻断默认推送路径；报告全量落历史 | 5.3 |
| P0 | F4 编辑器 + 微信样式预览 | 双栏编辑+375px 预览 <1s 刷新；预览与 API 载荷字节一致 | 4.3 |
| P1 | F7 配图生成（9 家 provider，gpt-image-2 第一） | fallback 链按序降级+尝试史入 metrics；全失败可无图推进 | 3.2 |
| P1 | F9 运行历史（简化版） | 每次 run 落一条结构化记录；按状态过滤 | 3.2 |
| P1 | F8 RRULE 定时出稿（默认草稿箱） | 每次	dispatch 起 run；publishTarget 恒 'draft'；失败可见 | 2.7 |

**实现顺序**（RICE 决定）：F3→F5→F1→F2/F6→F4→F7/F9→F8（先打通草稿箱信任链）。

## 3. 明确不做（Out-of-Scope——锁定，每条带原因防范围蔓延）

| 不做的功能 | 原因 | 何时考虑 |
|---|---|---|
| 群发 freepublish | 产品价值观：定时默认草稿箱；opt-in 契约预留（ScheduleRecord.publishTarget 类型恒 'draft'） | v0.2（显式 opt-in + 双确认） |
| 数据回流（fetch_stats 看板） | 非管线核心闭环 | Backlog |
| 风格学习（learn_edits/exemplar） | 重交互功能 | Backlog |
| 多公众号账号 | v0.1 单账号；社区有真实需求信号 | v0.2 候选 |
| 团队协作/云端部署/多用户/SaaS/付费墙 | 本地单人开源插件，MIT | 不做 |
| 小绿书等微信其他内容形态 | 聚焦图文 | Backlog |
| 自建热榜聚合服务/内置第三方公共热榜实例 | 合规与稳定性（无 SLA 主体不明）；只消费 HN 官方 API + 用户自备 DailyHotApi URL | 不做 |
| 自有付费代理运营 | 代理 URL 是用户配置项，不卖代理（反打竞品付费边界后置） | 不做 |

## 4. 技术架构（锁定——含版本锚定；对 workspace ADR-0001 栈锁定的登记例外，见架构文档 §0/ADR-001）

| 层 | 技术 | 版本锚定 | 锁定原因 |
|---|---|---|---|
| 语言/运行时 | TypeScript + Node ESM | Node `^22.19.0 \|\| >=24.0.0`（参照插件 engines 实测） | DSH 平台即 TS/Cordis/ESM |
| 插件框架 | @deepseek-ai/cordis（host+client 双端单包，ADR-002） | peer `*`，首版以本机 `~/.dsh/profiles/web` 实测锁范围 | 平台唯一插件形态 |
| 前端 | React（peerDep 不捆绑）+ DSH ui-primitives 官方件优先 | `^18.2.0`（F8 实测） | 平台锁定；双实例破坏 slots |
| 编辑器 | CodeMirror 6 | 最新 stable | doocs/md 同款，微信编辑器用户已被教育 |
| 图标 | lucide-react（唯一图标库，ADR-009） | 最新 stable | P0 视觉门禁①：一套 SVG 库 |
| 校验 | zod | `^4.1.5`（与 DSH storage domain/参照插件一致） | 双端契约载体 |
| RRULE | rrule（RFC 5545）+ Intl 时区 | 最新 stable | 标准实现 |
| 渲染 | vendored convertArticle（自 shared-ops/md-html 平移，C2） | 内置 | 真实生产使用检验；无 npm 等价物 |
| LLM | 复用 ctx.llm.stream()（ADR-003，不建自有抽象） | — | 用户原生配置零迁移（F21-F23） |
| 图片 | 自建 ImageProvider 抽象 9 家（§7.1） | — | 图片≠文本流协议，平台装不下（架构 §2） |
| 持久化 | DSH storage domain（sqlite 路由优先 json 兜底，ADR-005） | domain version 1 | 平台唯一受支持通道（F15-F18） |
| 凭据 | ctx.credentials（ADR-006） | — | 平台只写+脱敏描述符机制（F19/F20） |
| 调度 | 自建 RRULE 调度服务（ADR-004，dsh-automation durable claim 模式） | — | 官方 dsh-schedule 不满足（F29） |
| 发布 | npm 预构建 lib/（no-build 安装，ADR-008）+ git tag pin 备选 | — | 免 allowBuilds 信任门槛（F5） |
| 测试 | vitest（单测+契约测，fetch/mock 传输层） | 最新 stable | Node ESM 原生支持 |

## 5. RPC 端点清单（锁定——开发唯一依据；契约载体=`src/shared/contract.ts` zod schema，双端共用；OpenAPI 不适用因无独立 HTTP 服务，架构 §6）

通道 `dsh-wewrite`，authority `loopback`（F13）。payload/response 全过 zod 双端校验。

| endpoint | request | response | 说明 |
|---|---|---|---|
| `snapshot` | `{}` | `Snapshot{articles[],runs[],schedules[],config,serverNow,capabilities}` | 首拉全量+版本协商 |
| `hotspots/fetch` | `{limit?}` | `HotspotItem[]` | HN API+聚合源，单源失败隔离 |
| `article/list` | `{}` | `ArticleListItem[]` | 轻量视图 |
| `article/get` | `{id}` | `ArticleDetail` | 含 markdown |
| `article/save` | `{id?,slug,title,digest,markdown,theme}` | `ArticleDetail` | 创建/更新 |
| `article/delete` | `{id}` | `{deleted}` | |
| `article/preview` | `{id}\|{markdown,theme}` | `{html}` | host 侧渲染，预览=产物 |
| `run/start` | `{articleId?,params:RunParams}` | `{runId}` | 手动跑管线 |
| `run/cancel` | `{runId}` | `{ok}` | AbortSignal 贯穿 |
| `schedule/save` | `{id?,name,rrule,timeZone,params,enabled}` | `ScheduleViewModel` | revision++ |
| `schedule/delete` / `schedule/toggle` / `schedule/runNow` | `{id}` / `{id,enabled}` / `{id}` | 视图 | |
| `config/get` | `{}` | `ConfigView`（全脱敏） | credentials describe() 描述符 |
| `config/set` | `Partial<SettingsRecord>` | `ConfigView` | 非机密项 |
| `credentials/set` | `{ref,value}` | `{ok}` | 只写直通 |
| `credentials/describe` | `{}` | `Record<ref,{configured,writable}>` | 「已配置」徽标 |
| `llm/options` | `{}` | `{providers:[{id,models[]}]}` | 透传平台 |
| `wechat/pushDraft` | `{articleId}` | `{mediaId,thumbMediaId}` | 用户显式动作；全链路校验 |
| `wechat/diagnose` | `{}` | `{reachable,ipWhitelisted?,errcode?,hint}` | 40164 特判 |

## 6. 数据表清单（锁定——storage domain `dsh-wewrite` v1；zod schema 为权威，字段详见架构 §5）

| 表/全局 | 核心字段 | 约束 |
|---|---|---|
| global: SettingsRecord | wechatAppId/wechatApiBaseUrl/wechatAuthor/defaultTheme/llmDefault/imageProviders[]/agentToolsEnabled/runHistoryLimit | 机密一律走 credentials 不入此记录 |
| articles | id/slug/title/digest/status(editing\|rendered\|pushed\|failed)/markdown/theme/coverImageId/bodyImageIds/wechatMediaId?/lastRunId | digest 必填（draft/add 需要） |
| runs | id/trigger(manual\|schedule)/paramsSnapshot/status(queued\|running\|succeeded\|failed\|cancelled\|interrupted)/steps[]/error? | paramsSnapshot=触发时意图；runHistoryLimit 修剪 |
| schedules | id/revision/rrrule/timeZone/params/publishTarget('draft' 恒)/nextRunAt/lastRunAt | rrule 归一化校验后存储；nextRunAt 是投影 |
| images | id/articleId/kind(cover\|body)/mime/base64/provider/model/prompt/wechatUrl? | 单张 ≤10MB；base64 入库（ADR-005） |

## 7. 页面清单（锁定）

| 页面 | 面板内路由 | 核心组件 | 对应 RPC | Token 主题 |
|---|---|---|---|---|
| 写作台 | `/` | 今日待办/最近文章卡/主题输入条 | snapshot, run/start | ww-light |
| 选题中心 | `/hotspots` | 热榜列表/关键词订阅右栏 | hotspots/fetch, run/start | ww-light |
| 文章库 | `/articles` | 表格列表/状态点/门禁分列 | article/list | ww-light |
| 编辑器（下钻） | `/articles/:id` | CodeMirror 6 左栏+375px 预览画布右栏+状态栏 | article/get,save,preview, wechat/pushDraft | ww-light |
| 定时任务 | `/schedule` | 排队队列/执行历史 | schedule/*, snapshot | ww-light |
| 设置 | `/settings` | 左栏 5 组竖导航（公众号/模型/图片/代理/发布纪律） | config/*, credentials/*, llm/options, wechat/diagnose | ww-light |

挂载：conversation.view tab（F9 官方证实路径）注册 WeWrite 工作台；rc.6 无全局槽位（F12 UNKNOWN，已按 tab 形态锁定）。宿主 settings.plugin.item 挂「入口卡」。浅/深主题跟随宿主 `--dsw-*`（不自带主题开关）。

## 8. 设计 Token（锁定；Phase 2 产出 design-tokens.json + tokens.css 双产物）

- 主色：`--ww-accent` = 宿主 deepseek-500 `#4176E6` 纯色平涂（dark: `#679EFE`）；**零渐变 token**（P0②由构造保证）
- 中性：全量引用宿主 `--dsw-alias-*`（bg-base #FFFFFF / label-primary #0F1115 / border-l1-l4 黑 alpha 分层）
- 字体：系统中文栈（PingFang SC 回退）+ JetBrains Mono 等宽用于 slug/模型名/规则 ID/RRULE 原文
- 语义色：success `#22C55E` / warn `#F59E0B` / error `#EC1313`（挂宿主 state token）
- 图标：lucide-react 唯一库，16/20px 两档，细描边；业务代码只经 `<Icon name>` 封装
- 圆角 ≤8px、间距 4px 网格、动效 100/200/300ms（宿主值）；线框分层优先于阴影
- 对标：Linear（密度克制）+ Stripe Docs（层级排版）+ doocs/md（空间语法）

## 9. 验收标准（锁定——QA 测试唯一依据；EARS 全文以 PRD §6 为准，此处收口关键门）

| 编号 | 功能 | EARS 验收标准（收口版） | 优先级 |
|---|---|---|---|
| AC-1 | F3 | When 推送因 IP 白名单/凭据/网络失败, then 呈现分类错误+诊断指引且无半成品草稿 | P0 |
| AC-2 | F3 | Where 配置代理 base URL, 所有微信调用统一走该 URL 无混合路径 | P0 |
| AC-3 | F5 | If 单热榜源失败, 该源标记失败且其他源继续展示 | P0 |
| AC-4 | F1 | When 管线任一阶段失败, 停止后续+显示失败阶段+保留已完成产物 | P0 |
| AC-5 | F2 | When 保存凭据, 仅写本地 storage/credentials 且 UI 回显掩码（前4后4） | P0 |
| AC-6 | F2/F3 | When errcode 40164, 显示出口 IP 与两条出路（配代理/加白名单）具体步骤 | P0 |
| AC-7 | F6 | Where 门禁未过, 阻断默认推送路径（修改或显式覆盖后可推） | P0 |
| AC-8 | F4 | When 编辑 Markdown, 预览 <1s 本地刷新且与 API 载荷字节一致 | P0 |
| AC-9 | F7 | When gpt-image-2 失败, 按配置链降级并在产物标注实际供应商；全失败可无图推进 | P1 |
| AC-10 | F8 | While 定时启用, 产物恒到草稿箱；v0.1 无任何 freepublish 调用路径（类型层面不可达） | P0 |
| AC-11 | F8 | If DSH 计划时刻未运行, 错过即错过+下次启动提示错过数（无云端补偿） | P1 |
| AC-12 | F9 | When 任一 run 结束, 落结构化记录且凭据类字段全脱敏 | P1 |
| AC-13 | 安全 | 日志/错误/历史中 secret/access_token/API key 出现即掩码（保留≤4 字符可见） | P0 |
| AC-14 | 视觉 | 无 emoji 功能图标、无紫→粉渐变、无 Lorem/Welcome/占位文案（CI 正则扫描+走查） | P0 |
| AC-15 | 安装 | `plugin add github:…#tag` 安装无 plain dependency 警告（dsh.bundle+no-build 生效） | P0 |

## 10. 边界与约束

- 性能：预览 <1s；管线阶段进度可感知；单阶段超时上限+可中止；单图 ≤10MB、单篇正文图 ≤10 张
- 兼容：支持 DSH v0.1.x developer preview（README 版本表）；feature detection 六项防御（架构 §9）
- 遥测：无默认遥测；可选匿名统计默认关（事件名+版本，无内容无 IP）
- i18n：中文为主（zh/en 词典结构预留）；可访问性 WCAG 2.1 AA 目标（键盘可达+对比度）
- 代码组织：单文件 ≤300 行、入口零业务（机械门禁 `find src -name '*.ts' | xargs wc -l`）

## 11. 内嵌已知坑（.agent/memory/pitfalls.jsonl 初始条目，Phase 3 按技术栈指纹召回）

| 坑 | 技术栈指纹 | 根因 | 修法 |
|---|---|---|---|
| 无 dsh.bundle 装而不活 | cordis | manifest 缺声明→plain dependency | cordis.patch.yml + package.json dsh.bundle 必须交付并测试 |
| git 安装跑 build 需 allowBuilds | pnpm/git | pnpm 阻止 prepare 脚本 | npm 发布预构建 lib/（no-build 路径） |
| cordis.patch 整行替换不深合并 | cordis | patch 层语义 | 默认 config 全量写在 patch 行；文档告知用户覆盖方式 |
| gpt-image-2 API 形态 ASSUMPTION | openai | 未实测参数名/size | 开发首日 curl /v1/images/generations 校准 openai.ts |
| image_gen 源脚本仅 2 家实现 | providers | C1 勘误 | 9 家按接口从零写，单家单文件 |
| md2html 真身在 shared-ops | render | C2 勘误 | vendored 平移进 src/render/，禁 import workspace 包 |
| React 双实例破坏 slots | react | 自带 React 副本 | peerDependencies 不捆绑，构建 external |

## 12. 端到端验证步骤（v0.1 验收总口径，PRD §11 全文为准）

1. 干净机器 `npx @deepseek-ai/dsh plugin --profile web add github:jerryjiao/dsh-wewrite#v0.1.0`，无 plain dependency 警告
2. Web UI 出现工作台 tab → 空状态引导到设置页
3. 设置页填凭据+模型 → 连接测试通过（含故意填错 secret 的分类报错流）
4. 热榜出现 HN 条目 → 选一条「以此为题」
5. 管线四阶段可见 → 门禁报告 → 编辑器改稿+预览 <1s
6. 推草稿箱成功（微信后台可见）→ 错误流：错代理 URL → 分类指引+无半成品
7. RRULE 计划触发 → 历史新记录+草稿箱新稿；全程无 freepublish 调用（代码 grep 验证）
8. 日志与存储 grep：无明文 secret/access_token
9. 视觉走查：P0 三条逐一过 + `npm run lint && npx tsc --noEmit && npm test` + emoji/渐变正则扫描全绿

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-08-18 | Spec v0.1.0 生成 | Phase 1 三文档确认收口 | 全项目 |
