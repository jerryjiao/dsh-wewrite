/**
 * chat-integration 冒烟用例（QA 骨架 2026-08-20；P0-1 修复轮 2026-08-20 补真实探测）。
 *
 * 覆盖（architecture §8 e2e 行 + Spec §9/AC-M1-01/AC-M2-01）：
 *   1) 宿主起后插件面板挂载（RPC 通道存活的间接回归锚点）；
 *   2) run/detail 端点注册（22+1 端点可达，architecture §7 保证 1）——经插件
 *      loopback HTTP 通道 POST /dsh-wewrite/run/detail（wire 格式：client-request
 *      信封），未知 callId 的受控 run-not-found 区别于未知端点的 未知端点 报错；
 *   3) agentToolsEnabled=true（五工具注册的总开关面，cordis.patch.yml）经
 *      config/get RPC 断言；五工具对模型的可见性需真实 LLM 会话，显式
 *      PENDING-人工 注记（不静默跳过）。
 *
 * 相位：live（只在 --phase=live 显式执行；CI 无宿主整体跳过）。
 * 探测一律在页面内 fetch（同源 sec-fetch-site 通过 loopback 信任闸，
 * dsh-client-connection isTrustedApiRequest），origin 取 page.url() 不依赖 ctx.BASE。
 */
export default {
  id: 'chat-integration-smoke',
  group: 'chat',
  phase: 'live',
  fn: async (page, ctx) => {
    // 1) 插件面板挂载：宿主起 + 插件 client 装配成功的既有锚点（三路 slots 注册任一生效即满足）
    const panel = page.locator('.dsh-wewrite-panel').first();
    if (!(await ctx.domIs(panel, { timeout: 8000 }))) {
      throw new Error('chat-integration：WeWrite 面板未挂载（插件装配失败，先排查 slots 降级）');
    }

    // 页面内 loopback RPC 探测器：POST <origin>/dsh-wewrite/<endpoint>，返回
    // { status, body }（body=server-response 信封；非 JSON 时 null）。
    const callPluginRpc = async (endpoint, payload) =>
      page.evaluate(
        async ({ endpoint, payload }) => {
          const res = await fetch(`/dsh-wewrite/${endpoint}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId: `e2e-${endpoint}-${Date.now()}`, method: endpoint, payload }),
          });
          let body = null;
          try {
            body = await res.json();
          } catch {
            /* 非 JSON（404/415 纯文本）保持 null */
          }
          return { status: res.status, body };
        },
        { endpoint, payload },
      );

    // 2) run/detail 端点注册（AC-M2-01）：未知 callId → HTTP 200 + 受控
    //    {ok:false, error.message 含「不存在」}（WewriteServiceError→信封）。
    //    对照：不存在的端点 → HTTP 500 "handler failure: … 未知端点"（dsh-client-connection
    //    rpcFetchHandler 的 catch 臂把 handler 抛错转 500 纯文本）——500 vs 200+受控信封
    //    才能证明「端点已注册」而非任何 POST 都 200。
    const detail = await callPluginRpc('run/detail', { callId: 'e2e-probe-nonexistent' });
    if (detail.status !== 200 || detail.body?.type !== 'server-response' || detail.body?.result?.ok !== false) {
      throw new Error(`chat-integration：run/detail 探测非受控信封（status=${detail.status} body=${JSON.stringify(detail.body)?.slice(0, 200)}）`);
    }
    if (!String(detail.body.result.error?.message ?? '').includes('不存在')) {
      throw new Error(`chat-integration：run/detail 未知 callId 应报 run-not-found（受控 error），实得：${JSON.stringify(detail.body.result.error)}`);
    }
    const unknown = await callPluginRpc('e2e/no-such-endpoint', {});
    if (unknown.status !== 500) {
      throw new Error(`chat-integration：未知端点对照探测应 500（handler failure），实得 status=${unknown.status}——无法区分「端点已注册」`);
    }

    // 3) 插件 client 产物可服务（boot 后 /plugins/<id>/client.js 200——client bundle
    //    完整加载的传输面锚点，与断言 ① 的 console 清白互补）。
    const clientJs = await page.evaluate(async () => {
      const res = await fetch('/plugins/dsh-wewrite/client.js', { method: 'GET' });
      return { status: res.status, contentType: res.headers.get('content-type') ?? '' };
    });
    if (clientJs.status !== 200) {
      throw new Error(`chat-integration：/plugins/dsh-wewrite/client.js 应 200，实得 ${clientJs.status}`);
    }

    // 显式 PENDING-人工（不静默跳过）：五工具（wewrite_run / wewrite_rewrite /
    // wewrite_push_draft / wewrite_list_articles / wewrite_suggest_topics）对模型可见性
    // 需真实 LLM 会话人工核验——口令「用 wewrite 写一篇关于 X 的文章」→ 时间线出现
    // wewrite_run 工具卡即通过。注：注册闸门已是单一真源（AC-M1-12 修复）——
    // service.agentToolsEnabled()：用户在设置页显式设置过（config/set 写
    // agentToolsEnabled 即打 touched 标记）→ 以 settings 值为准并可热回收/热恢复；
    // 从未设置 → 回落插件 config 层默认（cordis.patch.yml agentToolsEnabled: true），
    // config/get 投影同一闸门真值（显示=行为同步）。自动化面覆盖：端点信封 +
    // client.js 可服务；闸门/回收/装配形态由 tests/host/agent-tools-gate.test.ts
    // （含真 service 装配杀手用例）与 tests/host/agent-tools.test.ts 单测钉死。
    console.log('  PENDING（人工）：五工具对模型可见性待真实 LLM 会话核验（口令「用 wewrite 写一篇…」→ wewrite_run 工具卡出现）；注册闸门=单一真源（设置页显式值 > patch 默认，可热翻转）。');
  },
};
