# 热榜逐条 AI 速览加固记录（2026-08-20）

QA 实测确诊报告：`tests/e2e/artifacts/qa-digest/qa-digest-report.json`（8 条目 89.5s 全流程；item-01 报错、item-04 白降级、item-07 反爬 403、item-04 角度行幻觉）。

## 问题

用户报热榜逐条 AI 速览「还是有问题」，三种独立症状：

1. **P0 错误信封被宿主整包拒收**（item-01，sprocketfox.io）：glm-4.5-flash 概率性命中内容过滤（流式 finish_reason:"sensitive"，bigmodel 1301）→ pi-ai SDK 报 error → 插件 `WewriteServiceError('PI_AI_ERROR', ...)` → RPC 错误信封 `{ok:false,error:{code:'PI_AI_ERROR'}}` → 宿主 `rpcResultSchema` 联合校验失败 → zod invalid_union 全文（~1.7KB，含 39 个宿主 code 枚举清单）成为用户看到的错误消息。1305 拥挤 / 429 / 网络错误同链路同症状。
2. **抽取回退缺失**（item-04，grapheneos.social Mastodon 帖）：首个 article 块只装头像/时间戳（剥壳 <300 字），但整页剥壳 9860 字——按块判失败，白白降级 title 模式（「仅标题」徽章），且 title 模式下角度行编造了原文没有的「健康监测/电池续航」（item-07 Casio 同症状）。
3. **反爬 403**（item-07，casio.com）：无 UA 裸请求被站点直接 403。

## 根因

- RPC 错误信封 code 用了插件自有码，不在 DSH 宿主 `rpcErrorSchema` 的 39 个 code 枚举内；且宿主每个枚举分支必填 `details` 字段（多数分支带必填结构化字段），插件侧只发 `{code,message}`。宿主枚举实测自 `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js` 的 `rpcErrorSchema` discriminatedUnion。
- 抽取逻辑「有 article/main 块就用块，块文本 <300 直接判失败」缺少整页回退分支。
- fetch 无浏览器式请求头。
- maxTokens 800 在宿主 reasoning=off 时可用，但 reasoning≥low 时宿主注入 thinking 参数，bigmodel 规则要求此时 max_tokens 必须 >32000，否则 HTTP 400 code 1214——用户一旦调高宿主 reasoning 所有条目必炸。

## 修法

| 文件 | 改动 |
|------|------|
| `src/host/rpc.ts` | 新增 `toHostRpcErrorEnvelope`：信封 code 统一收敛 `internal` + `details:{}`（唯一 details 形状恒可满足的安全分支），真实 code 以 `[code] ` 前缀保留进 message（前端按前缀映射错误文案）；宿主既有 500 字截断保持；无 code 的 Error/裸抛值归一 `[rpc-failed]` 前缀 |
| `src/host/hotspot-digest.ts` | ① `fetchArticleText` 带浏览器式请求头（主流 Chrome UA + `accept: text/html`）治 403；② `extractArticleText` 块文本 ≥300 用块，块 <300 但整页剥壳 ≥300 回退整页，双不足才降级 null；③ title 模式提示词加「不得虚构原文没有的事实；角度只做方向性建议，不提具体功能、数字或参数」，article 模式加「要点只能来自给定正文，不得补充外部信息」；④ maxTokens 800→33000（bigmodel 1214 规则，两态安全，行结构提示词约束输出长度 + 45s 超时兜底） |

## 测试

- `tests/host/rpc.test.ts`（新增，6 用例）：插件自有码（PI_AI_ERROR/digest-timeout/llm-not-configured）→ internal + `[code]` 前缀 + `details:{}`；code 已 internal 不加前缀；无 code Error/裸抛值归一 `[rpc-failed]`；超长 message 截断；信封 code 必须落在测试内钉死的宿主 39-code 枚举快照内。
- `tests/host/hotspot-digest.test.ts`（改+补，19 用例）：浏览器请求头断言（Chrome UA + text/html accept）；Mastodon 型页面块 <300 整页回退；maxTokens 33000 契约；article/title 两模式防幻觉约束行断言。

运行：`npx vitest run tests/host/rpc.test.ts tests/host/hotspot-digest.test.ts` → 2 files, 25 tests 全绿（2026-08-20）。

平台契约坑已沉淀 `.agent/memory/pitfalls.jsonl`：`dsh-host-rpc-error-code-must-be-in-host-enum`。
