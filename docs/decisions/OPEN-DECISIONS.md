# OPEN-DECISIONS（只追加+就地关闭）

| # | 决策/悬置项 | 状态 | 日期 | 说明 |
|---|---|---|---|---|
| D-1 | 三文档用户确认点 | 已关闭（自动确认） | 2026-08-18 | Jerry 功能清单为带案入场需求真源+明确指令全流程交付；一致性检查通过后总监自动确认进 Spec。Jerry 可随时审阅 docs/ 三文档推翻，走 Spec 变更记录 |
| D-2 | 技术栈偏离 workspace ADR-0001（Cloudflare+Astro） | 已关闭（例外登记） | 2026-08-18 | DSH 插件形态由平台 dictates（TS/Cordis/React18/storage domain），Jerry 明确指令「基于 DeepSeek harness 开发」。见架构文档 §0/ADR-001 |
| D-3 | 契约载体 openapi.yaml → zod schema | 已关闭 | 2026-08-18 | 无独立 HTTP 服务，DSH RPC 通道形态；src/shared/contract.ts 双端共用 |
| D-4 | 图片 9 家 v0.1 全量实现 vs 裁剪 3 家首发 | 已关闭（全量） | 2026-08-18 | 架构师建议裁剪（R1）；总监裁定全量实现——Jerry 要求「完善的产品」，接口+registry 先行后 9 家单文件并行，单测 mock 传输层覆盖；README 标注 gpt-image-2 为默认第一供应商 |
| D-5 | UI 全局槽位（F12 UNKNOWN） | 已关闭（按 tab 形态锁） | 2026-08-18 | conversation.view 官方证实路径承载工作台；Phase 2 可顺带探测 ui-layout root 槽位但不阻塞 |
| D-6 | SSH 云主机中继模式 | 已关闭（不进 v0.1） | 2026-08-18 | 对插件用户过重；direct/自托管 relay 双模式 + tools/wechat-relay docker 参考实现 |
