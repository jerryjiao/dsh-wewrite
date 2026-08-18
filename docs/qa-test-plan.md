# dsh-wewrite QA 测试计划（Phase 2 先写测试轮产出）

> 作者：严过关（MVP 专家团 QA），2026-08-18
> 依据：docs/spec.md v0.1.0（§2/§5/§6/§9/§11/§12）+ docs/tech-architecture.md v0.1（§5/§6/§7/§8）+ .agent/memory/pitfalls.jsonl
> 状态：测试基建与测试套件已交付。**红灯是预期态**——src/ 实现尚不存在，红灯清单即 Phase 3 实现入口。

---

## 1. 定位与纪律

本轮执行「先写测试」变革：QA 基于 Spec 的 EARS 验收标准编写测试，Phase 3 开发按测试实现。测试是契约的可执行形态。

- 测试作者（QA）与实现作者（前端/后端）分离，测试只看 Spec 与架构文档，不看实现（实现尚不存在）。
- 断言纪律：精确值（`toBe`/精确集合/字节级比较），禁用 `toBeTruthy` 打天下；全文零 `skip`/`only`/空壳 describe。
- 每个测试文件头部注释写明它钉定的模块导出面（消费面契约），Phase 3 照单实现。

## 2. 测试金字塔

```
        /  E2E 手工  \      安装验收（AC-15）、真实微信草稿箱往返、预览 <1s 计时 —— 见 §6
       /--------------\
      /  集成（host 层）\    管线引擎全链（mock LLM/门禁/渲染）、微信客户端编排流（mock HTTP）、
     /------------------\   fallback 链（mock provider）、durable claim（mock 持久层）
    /      单元（大量）   \   zod 契约形状 ×20 端点、RRULE 归一化/投影、脱敏器、渲染产物形状、
   /----------------------\  ImageProviderError 派生、pruneTerminalRuns、scanOccurrences
```

比例：单元为主（~75%）、host 集成 ~20%、E2E 手工少量（本地插件产品无法 CI 化安装与微信外部系统）。

## 3. 测试基建与命令

| 命令 | 作用 | 本轮基线 |
|---|---|---|
| `npm test`（vitest run） | 全套测试 | 9 文件红（import 未实现模块）+ sanity 绿 |
| `npm run lint`（eslint .） | flat config + typescript-eslint recommended | PASS |
| `npm run typecheck`（tsc --noEmit） | strict ESM | 26 个 TS2307（纯模块缺失，零连锁噪音） |
| `npm run check:p0` | P0 视觉门禁扫描（scripts/checks/scan-p0.mjs） | PASS（0 违规） |

- 脚手架：package.json（name=dsh-wewrite, type=module, engines `^22.19.0 \|\| >=24.0.0`）、tsconfig.json（ESM/bundler/strict）、vitest.config.ts（alias `@/` → `src/`）、eslint.config.js。
- 运行时依赖：zod ^4.4.3（Spec 锚 ^4.1.5，解析到最新 4.x）、rrule ^2.8.1（**事实修正**，见 §7.1）。
- devDependencies：vitest ^4.1.10、typescript ^6.0.3、eslint ^10.8.1、typescript-eslint ^8.67.0、@types/node ^26.2.0。
- scan-p0.mjs 检测能力已用已知违规样本验证（emoji/紫粉渐变/三类占位文案全命中，`preview-ugc` 与 `p0-allow:rule-quote` 豁免生效，合法蓝色渐变零误报），并对 tests/、脚本自身、src/、docs/DESIGN.md 实扫通过。

## 4. Phase 3 实现契约（红灯清单 = 实现入口）

以下模块路径与导出面由测试钉定。**红灯文件 → 需实现的模块**：

| # | 测试文件（红） | 需实现模块 | 钉定的关键导出 |
|---|---|---|---|
| 1 | tests/shared/contract.test.ts | `src/shared/contract.ts` | `RPC_CHANNEL='dsh-wewrite'`、`RPC_AUTHORITY='loopback'`、`CONTRACT_VERSION=1`、`RPC_ENDPOINTS`（20 端点全集）、`rpcContract`（每端点 `{request,response}` zod schema，顶层 strict）、`RunParamsSchema`、`HotspotItemSchema`、`ArticleListItemSchema`、`ArticleDetailSchema`、`RunSummarySchema`、`ScheduleViewModelSchema`、`ConfigViewSchema`、`SnapshotResponseSchema` |
| 2 | tests/host/domain.test.ts | `src/host/domain.ts` | `domainSpec`（name/version/tables 四表）、`SettingsRecordSchema`（默认值见 §7.2）、`ArticleRecordSchema`、`RunRecordSchema`、`ScheduleRecordSchema`、`ImageRecordSchema` |
| 3 | tests/host/pipeline-engine.test.ts | `src/host/pipeline/engine.ts` | `PIPELINE_STEP_NAMES=['topic','outline','draft','gates','render','images']`、`RunStore`（put/get/update/all）、`PipelineLlm`（stream 返回 text/finish chunk 流）、`createPipelineEngine(deps)`→`{start(opts),cancel(runId),resumeInterrupted()}`、`pruneTerminalRuns(runs,limit)` |
| 4 | tests/host/hotspots.test.ts | `src/host/pipeline/steps/topic.ts` | `aggregateHotspots(sources,limit)`→`{items,failures}`（AC-3 隔离语义） |
| 5 | tests/host/providers-registry.test.ts | `src/host/providers/types.ts` + `registry.ts` + 9 家单文件 + `src/shared/image-provider-ids.ts` | `ImageProviderError{providerId,code,message}`（retryable 按 code 派生：AUTH=F，RATE_LIMIT/TIMEOUT/NETWORK/PROVIDER=T）、`ResolvedProviderConfig{apiKey,baseUrl?,model?,extra?}`、`ImageProvider{id,generate(req,cfg)}`、`runImageFallback(providers,resolveConfig,req)`→`{result,providerId,attempts}`（全失败抛 `ImageFallbackExhaustedError{attempts}`）、`IMAGE_PROVIDER_IDS`、`DEFAULT_IMAGE_PROVIDER_CHAIN`（openai 第一）、9 个 `createXxxProvider()` 工厂（openai/doubao/dashscope/jimeng/minimax/azure-openai/gemini/openrouter/replicate） |
| 6 | tests/host/wechat-client.test.ts | `src/host/wechat/client.ts` | `WeChatApiError(errcode,classification,hint?)`、`createWeChatClient({fetchImpl,getCredentials,getSettings,now?})`→`{fetchAccessToken,uploadContentImage,uploadThumbMaterial,addDraft,pushDraft,diagnose}` |
| 7 | tests/host/scheduler.test.ts | `src/host/scheduler/rrule.ts` + `service.ts` | `normalizeRrule`（非法抛 `RruleValidationError`）、`computeNextRunAt(rrule,timeZone,from)`、`createOccurrenceClaimer(persist{load,save})`、`scanOccurrences(occurrences,now,graceMs)`、`DEFAULT_MISFIRE_GRACE_MS=600000` |
| 8 | tests/host/redaction.test.ts | `src/host/redaction.ts` | `maskSecret`（≤8 全掩，>8 前 4+`****`）、`redactText(text,secrets)`、`redactKeys(value)`（深遍历敏感键→`[redacted]`，纯函数）、`truncateMessage(msg,max=500)` |
| 9 | tests/render/parity.test.ts | `src/render/convert.ts` | `convertArticle({markdown,theme?})→string`（纯函数；无 style/link/h1；内联样式；script/iframe 转义） |

## 5. AC 覆盖矩阵（Spec §9 AC-1 ~ AC-15）

| AC | 内容 | 自动化测试 | 覆盖度 |
|---|---|---|---|
| AC-1 | 推送失败分类+无半成品 | wechat-client「AC-1：推送失败原子化」×2（draft errcode 拒返 mediaId；token 失败后续零调用）+「errcode 分类诊断」×3 + push-gate「draft/add 失败不误标 pushed」（Phase 4 补） | 自动，完整（客户端+service 双层） |
| AC-2 | 代理 base URL 全链路统一 | wechat-client「AC-2」×1（全请求 relay 前缀+零直连混入）+ 端点形状用例逐 URL 断言 | 自动，完整 |
| AC-3 | 单热榜源失败不清空 | hotspots.test.ts ×5（单源失败隔离/全失败空态不抛/limit/空源） | 自动，完整 |
| AC-4 | 阶段失败停止+保留产物 | pipeline-engine「AC-4」×3（gates 失败停后续；产物保留传递；llm 步失败） | 自动，完整 |
| AC-5 | 凭据只写本地+掩码回显 | contract「ConfigViewSchema 脱敏面」×4（settings 无机密键/描述符仅 configured+writable/注入拒/边界）+ domain「SettingsRecord」×3 + credentials-write service 层 ×8（Phase 4 补：write-only/读面无原文/describe-only/config-set 拒注入） | 自动（契约+存储+service 三层）；UI 前 4 后 4 掩码像素渲染属 client 组件，留 E2E 走查（掩码函数 maskSecret 已由 redaction 套件锁定） |
| AC-6 | errcode 40164 诊断 | wechat-client「AC-6」×2 + diagnose ×3（40164 分类+出口 IP+两条出路文案锚点） | 自动，完整 |
| AC-7 | 门禁未过阻断推送 | pipeline-engine AC-4（gates 失败→run failed 不产 pushed）+ push-gate service 层 ×5（Phase 4 补：editing/failed 阻断零网络调用、rendered 可推原子转 pushed、端到端真门禁链路） | 引擎层+service 层自动；端到端用例 1 条红灯——**P0-1**：管线 images 步产出的 coverImageId 从不回绑 article（engine.ts:182 只写 run metrics；images.ts:78 ImageRecord.articleId 恒 'pending'；全 RPC 面无绑定端点），真实管线产出的文章推送必抛 cover-missing，AC-7 正向分支生产不可达。修复后该用例转绿 |
| AC-8 | 预览=产物+<1s | parity.test.ts ×13（无 h1/style/link、内联样式、字节级确定性、XSS 转义、超长不截断） | 自动（一致性与产物形状）；<1s 计时属 E2E 手工（§6 步骤 5） |
| AC-9 | 图片 fallback 链+无图推进 | providers-registry（fallback 编排 ×8+错误派生 ×2）+ pipeline-engine「AC-9」×2（images 失败 run 仍 succeeded） | 自动，完整 |
| AC-10 | 恒 draft+freepublish 不可达 | scheduler「AC-10」×2（zod literal 拒 publish/freepublish/mass + 源码树 freepublish 扫描）+ contract ScheduleViewModel | 自动，完整（类型层+源码扫描双保险） |
| AC-11 | misfire 错过即错过+提示 | scheduler「misfire 宽限」×2（10min 宽限/三桶分类/错过计数）+ pipeline-engine「恢复扫描不重新派发」 | 自动，完整 |
| AC-12 | run 结构化记录+脱敏 | pipeline-engine「RunRecordSchema 合法」+ domain RunRecord ×4 + redaction 全套 | 自动，完整 |
| AC-13 | 日志脱敏 ≤4 字符可见 | redaction.test.ts ×16（maskSecret 边界/多 secret/深遍历/纯函数/截断） | 自动，完整 |
| AC-14 | P0 视觉三禁 | scripts/checks/scan-p0.mjs（`npm run check:p0` 进 CI；检测能力已验证）+ tests 自身实扫 0 违规 | 自动（静态扫描）；真机视觉走查留 E2E |
| AC-15 | 安装无 plain dependency 警告 | 无单测（需真实 DSH 环境） | E2E 手工（§6 步骤 1）；Phase 3 交付 package.json `dsh.bundle` 后可加 manifest 静态断言 |

矩阵结论：15 条 AC 中 11 条自动覆盖完整、3 条部分覆盖（AC-1/5/7 的 service/UI 层分支已注明补齐路径）、1 条（AC-15）本质手工。无 AC 零覆盖。

## 6. E2E 手工步骤（Spec §12 九步 + 自动化程度标注）

| # | Spec §12 步骤 | 自动化程度 |
|---|---|---|
| 1 | 干净机器 `plugin add github:…#v0.1.0` 无 plain dependency 警告 | 手工（AC-15；pitfalls `no-dsh-bundle-inert` 对应） |
| 2 | Web UI 出工作台 tab→空状态引导 | 手工（client 渲染） |
| 3 | 设置页填凭据→连接测试（含错 secret 分类报错流） | 半自动：错 secret 分类已自动（wechat-client AUTH/40164 用例）；真实填写与 UI 徽标手工 |
| 4 | 热榜出现 HN 条目→「以此为题」 | 半自动：聚合隔离已自动；真实 HN API 往返与选条动作手工 |
| 5 | 管线四阶段可见→门禁→编辑改稿+预览 | 半自动：引擎六步/门禁阻断/渲染产物已自动；「四阶段可见」UI 进度与预览 <1s 计时手工 |
| 6 | 推草稿箱成功（微信后台可见）→错误流：错代理 URL→分类指引+无半成品 | 半自动：编排/原子化/40164 已自动（mock HTTP）；微信后台可见性手工 |
| 7 | RRULE 计划触发→历史新记录+草稿箱新稿；全程无 freepublish | 半自动：调度语义+freepublish 扫描已自动；真实等待触发（次日 4 点）用 `schedule/runNow` 手工触发验证 |
| 8 | 日志与存储 grep 无明文 secret/access_token | 半自动：redaction 单元已自动；真实运行后的磁盘 grep 手工（`~/.dsh/storages/` 与日志文件） |
| 9 | 视觉走查 P0 三条 + `npm run lint && npx tsc --noEmit && npm test` + 正则扫描 | 自动（本轮已交付四个命令；真机视觉走查手工） |

## 7. 契约裁决与事实修正（QA 钉定的模糊处，Phase 3 必须遵守）

### 7.1 事实修正（高优先）

1. **rrule 版本**：架构 §4.1 锚定 `rrule@^8.0.0` 在 npm 不存在（notarget 实证），真实最新为 **2.8.1**，已按 `^2.8.1` 安装。请架构文档同步更正，Phase 3 按 rrule 2.x API 实现。
2. **npm workspaces 污染风险**：本项目位于 workspace monorepo 的 `apps/*` glob 内，`npm install` 默认被 hoist 到 root。**本项目所有安装命令必须带 `--workspaces=false`**（已在实操中验证）。

### 7.2 Spec 模糊处的钉死（测试即契约）

1. **端点计数**：Spec §5 表格 18 行实际含 20 个端点（schedule/delete/toggle/runNow 同行）。契约测试锁 20 个。
2. **schedule/delete 响应**：Spec 写「视图」，钉为 `{deleted: boolean}`（与 article/delete 对称）；**schedule/runNow** 钉为 `{runId: string}`（与 run/start 对称，它派发 run）；schedule/toggle 钉为 ScheduleViewModel。
3. **maskSecret 规则**：「保留 ≤4 字符可见」钉为：长度 ≤8 全掩 `****`（短值全掩防泄露），>8 保留前 4+`****`。
4. **未执行步骤状态**：钉为 `pending`（六步始终全列出，可观测性优于缺失）。
5. **图片步降级语义**（AC-9 与 AC-4 的交集）：images 是末步，全失败→该步 `failed` 但 run `succeeded`（无图推进）；门禁失败→run `failed`（阻断）。
6. **engine.start resolve 时机**：await 至终态；RPC 层 run/start 可不 await 立即回 runId。
7. **DEFAULT_MISFIRE_GRACE_MS = 600000**（10 分钟，参照 dsh-automation 宽限惯例，QA 钉定值）。
8. **provider 内部响应协议**：9 家 provider 的解析统一支持 `{data:[{b64_json}]}` 与 `{data:[{url}]}` 双形态（源脚本 image_gen.mjs 先例）；各家远端原始形状由 adapter 内部归一——**本轮不锁各家远端 API path/参数名**（架构 R2 gpt-image-2 ASSUMPTION；防幻觉依赖接口）。唯一例外：openai 家锁 `/images/generations`+Bearer+`model:'gpt-image-2'`（源管线先例）。
9. **signal 透传**：provider 调 fetch 时 `init.signal` 必须是原 `req.signal` 实例（身份相等断言）。
10. **ConfigView 默认值**：SettingsRecord parse `{}` 须产出 `runHistoryLimit=200`、`wechatApiBaseUrl='https://api.weixin.qq.com'`、`agentToolsEnabled=false`、`imageProviders` 首位 openai。
11. **limits**：`hotspots/fetch.limit` 1–100；`runHistoryLimit` 1–1000；`imageCount` 0–10；ImageRecord base64 ≤10MB 二进制等效；`credentials/set.ref` 锚 `^[A-Z][A-Z0-9_]*$`（F19 POSIX）。
12. **image base64 上限断言口径**：测试用 14MiB 字符串（>10MB 二进制的 base64 编码长度）断言拒收；实现可用字符数或解码字节数任一口径，只要该输入被拒。

### 7.3 豁免标记登记（scan-p0.mjs）

- `preview-ugc`：微信预览画布 UGC 内容区 emoji 豁免（行级）。
- `p0-allow:rule-quote`：规范文档禁令条文自引用禁词的豁免（DESIGN.md §7 第 3 条与 §8 rg 示例两处已加注，QA 逐行人工核对为规则描述而非占位文案）。

## 8. 红灯基线记录（2026-08-18 21:40，Node v22.22.3）

```
npx vitest run
 Test Files  9 failed | 1 passed (10)
      Tests   2 passed (2)          ← tests/sanity.test.ts 恒绿哨兵
```

9 个红灯文件全部因 `Cannot find package '@/...'`（模块未实现），与 §4 表一一对应：
contract / domain / pipeline-engine / hotspots / providers-registry / wechat-client / scheduler / redaction / parity（render）。

- 静态 `it()` 计数 154，表驱动展开后运行时用例约 306（contract 20 端点 ×5 断言组、providers 9 家 ×7 传输用例为循环展开）；`expect()` 约 410。
- `npm run lint` PASS；`npm run typecheck` 26 错全为 TS2307（纯模块缺失）；`npm run check:p0` PASS。
- 工具自证：scan-p0.mjs 对构造的违规样本（emoji/紫粉渐变/三类占位）全部命中且豁免标记生效后实扫 tests/、scripts/、src/、docs/DESIGN.md 均 0 违规。

## 9. 反作弊自检（QA 自身）

| 检查项 | 结果 |
|---|---|
| skip/only/xfail/空壳 describe | 0（grep 全文无 `it.skip`/`describe.skip`/`.only`） |
| toBeTruthy/toBeFalsy 泛断言 | 0（全文精确断言；唯一弱断言为 hotspots 排序用 toContain，已配数量断言） |
| 测试与实现同文件 | 不可能（实现不存在）；测试全部位于 tests/，src/ 仅设计师 tokens.css |
| 断言来自 Spec 而非实现 | 必然（实现不存在；所有期望值溯源 Spec/架构章节，见各文件头注释） |
| 本轮无既有绿灯可回归 | 首轮基线；回归率自 Phase 3 起算 |

## 10. 遗留与 Open Questions（Phase 3/4 处理）

1. ~~client 组件测试（AC-5 UI 掩码）~~ **Phase 4 已按本条第二路径闭环**：仓内无 DOM 测试基建，AC-5 在 service/contract 层补齐（tests/host/credentials-write.test.ts ×8，掩码数据源「无原文可显」被锁定）；UI 掩码像素渲染并入 E2E 走查清单。
2. ~~AC-7 推送闸门 service 层回归~~ **Phase 4 已补**（tests/host/push-gate.test.ts ×5，含 AC-1 的不误标 pushed 用例）。端到端用例当前红灯 = **P0-1 封面回绑缺失**（见 §5 AC-7 行），修复前发布门禁 NO-GO。
3. **AC-15 manifest 断言**：package.json 定稿（dsh.bundle/exports/peerDeps）后可加静态读取断言，降低对人工安装验收的依赖。（Phase 4 QA 已人工核验 manifest+产物结构；断言测试仍未加，留下一轮）
4. **微信 token 中途过期（42001）自愈重试**：本轮未锁契约（架构未提）；如 Phase 3 实现，须补回归用例。（Phase 4 复核：实现未做 42001 自愈，契约面维持不变，无需补）
5. **misfire grace 可配置性**：钉死 10 分钟常量；如产品要求可配，改常量导出即可，测试断言同步调整。
6. **gpt-image-2 实测校准**（架构 R2）：首版开发 curl `/v1/images/generations` 后，如请求形状与 openai 专锁断言冲突，先改本测试计划 §7.2-8 裁决再改测试（活规格纪律），禁止静默改断言。（留真实凭据首跑时校准）

## 11. 变更记录

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-08-18 | 初版：测试基建 + 10 测试文件 + scan-p0 + 本计划 | Phase 2 先写测试轮 |
| 2026-08-18 | Phase 4 复测：+tests/host/push-gate.test.ts（AC-7×4 + AC-1×1）、+tests/host/credentials-write.test.ts（AC-5×8）、+tests/host/service-harness.ts（共享 harness）；§5 矩阵 AC-1/5/7 更新；登记 P0-1（封面回绑缺失，端到端用例红灯） | Phase 4 发布前门禁复测轮 |
