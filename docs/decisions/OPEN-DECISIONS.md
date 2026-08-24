# OPEN-DECISIONS（只追加+就地关闭）

| # | 决策/悬置项 | 状态 | 日期 | 说明 |
|---|---|---|---|---|
| D-1 | 三文档用户确认点 | 已关闭（自动确认） | 2026-08-18 | Jerry 功能清单为带案入场需求真源+明确指令全流程交付；一致性检查通过后总监自动确认进 Spec。Jerry 可随时审阅 docs/ 三文档推翻，走 Spec 变更记录 |
| D-2 | 技术栈偏离 workspace ADR-0001（Cloudflare+Astro） | 已关闭（例外登记） | 2026-08-18 | DSH 插件形态由平台 dictates（TS/Cordis/React18/storage domain），Jerry 明确指令「基于 DeepSeek harness 开发」。见架构文档 §0/ADR-001 |
| D-3 | 契约载体 openapi.yaml → zod schema | 已关闭 | 2026-08-18 | 无独立 HTTP 服务，DSH RPC 通道形态；src/shared/contract.ts 双端共用 |
| D-4 | 图片 9 家 v0.1 全量实现 vs 裁剪 3 家首发 | 已关闭（全量） | 2026-08-18 | 架构师建议裁剪（R1）；总监裁定全量实现——Jerry 要求「完善的产品」，接口+registry 先行后 9 家单文件并行，单测 mock 传输层覆盖；README 标注 gpt-image-2 为默认第一供应商 |
| D-5 | UI 全局槽位（F12 UNKNOWN） | 已关闭（按 tab 形态锁） | 2026-08-18 | conversation.view 官方证实路径承载工作台；Phase 2 可顺带探测 ui-layout root 槽位但不阻塞 |
| D-6 | SSH 云主机中继模式 | 已关闭（不进 v0.1） | 2026-08-18 | 对插件用户过重；direct/自托管 relay 双模式 + tools/wechat-relay docker 参考实现 |
| D-7 | lib/ dist-committed 入 git | 已关闭 | 2026-08-18 | DSH git 安装不跑 build 脚本，预构建产物随 repo 是 no-build 安装路径（ADR-008 的 git-tag 形态）；README 已注明 |
| D-8 | storage 单元名 dsh-wewrite → dsh_wewrite | 已关闭 | 2026-08-18 | 部署冒烟抓到 UNIT_NAME_RE ^[a-z][a-z0-9_]*$ 拒绝连字符（StorageError malformed-medium）；仅存储单元名改动，插件名/RPC channel/包名不变；测试加正则断言防复发 |
| D-9 | npm publish | 悬置（Jerry 决定） | 2026-08-18 | ADR-0008 主路径；git tag 安装路径已验证可用，npm 发布可后补 |
| D-10 | awesome-dsh-plugins 收录 PR | 悬置（Jerry 决定） | 2026-08-18 | 发布后自然流量入口；对外提交需 Jerry 点头 |
| D-11 | 启动 brief 合同（OD-4 另解，v0.5 立项） | 已关闭（立项，开发未开工） | 2026-08-24 | Jerry grilling 六问拍板：变密度输入（一句话是下限不是标准）；分层绑定（标题/思路硬、大纲骨架、来源硬+URL 可见性门禁）；双入口（agent 蒸馏+启动卡折叠区）；一句话不追问；管线原子六步不动。开发前置=v0.4.0 截图重拍+两项人工验收收尾。见 docs/v0.5-launch-brief.md / ADR-010 |
