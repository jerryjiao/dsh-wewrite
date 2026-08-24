/**
 * H 组 管线 E2E——智谱真跑（5 条，live）——蓝本 §2.4 H01-H05 校对重锚。
 * 相位：live（宿主保持运行、storage 不动；llmDefault=glm-4.7-flash 由 fresh 相位 G05
 * 贯穿；ZHIPU_API_KEY 由 hostctl launch 注入，ADR-010）。
 * 入口重锚：写作台输入卡已转生为 rail 底部新文章表单（RailNewButton）。
 * B04（AC-6 进度卡/进度点跨 Tab）按蓝本原文并入 H01 执行体（见 fn 内注释块），
 * 不独立注册——避免多付一次 LLM 真跑（架构文档 §2.3.1 B04* 与 R4 限流预算）。
 * 契约事实校准（PipelineStepper 现状）：run 视图无 steps 明细，阶段行按 run 整体
 * 状态着色——「六步按序推进/步级失败」不可观察，AC-9 的 DOM 等价断言改为：
 * run 终态 succeeded + 编辑器 StatusStrip「图 0 张」（无图推进）。
 * 执行预算：单次管线实测 72s，轮询上限 240s（R6）；H05 取消即停（token 最小化）。
 */
import {
  assert,
  expectVisible,
  gotoWorkbench,
  LOC,
  pollUntil,
  setEditorView,
} from '../lib.mjs';

async function startRunFromRail(page, topic) {
  await gotoWorkbench(page);
  const newBtn = page.locator('.ww-rail__new').first();
  await newBtn.click();
  const form = page.locator(LOC.railNewForm).first();
  await form.waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-testid="ww-rail-new-input"]').first().fill(topic);
  await page.locator('[data-testid="ww-rail-new-submit"]').first().click();
  await expectVisible(page.getByText(`正在生成《${topic}》`).first(), {
    timeout: 15000,
    msg: `提交后应出现生成 overlay（${topic}）`,
  });
}

export default [
  {
    id: 'H01',
    group: 'H 管线真跑',
    phase: 'live',
    // 前置：live；G05 已配 glm-4.7-flash；demo 相位 storage（有文章）。
    // 步骤：rail 新文章表单提交「本地优先的 AI 工作流」→ 观察全链路。
    // 断言：AC-11 —— overlay 标题正确 + 六步 stepper 标签齐；
    //       B04/AC-6（并入执行体）：转后台后进度卡常驻右下、顶栏进度点可见可点、
    //       切 Tab 不遮挡内容；终态=成功（rail 新行出现 + 进度点消失）。
    // 注：成功 toast（生成完成/已生成）为瞬态，作为轮询旁路信号不作硬断言（时效性）。
    fn: async (page) => {
      const topic = '本地优先的 AI 工作流';
      await startRunFromRail(page, topic);

      await expectVisible(page.locator('.ww-stepper').first(), { msg: 'stepper 未渲染' });
      const stageLabels = ['选题分析', '研究与提纲', '初稿写作', '质量门禁', '排版转换', '配图生成'];
      for (const label of stageLabels) {
        await expectVisible(page.locator('.ww-stepper').getByText(label, { exact: true }).first(), {
          timeout: 4000,
          msg: `六步标签缺「${label}」`,
        });
      }

      // ---- B04/AC-6 并入执行体（蓝本 §2.3.1 B04*）----
      await page.getByRole('button', { name: /转入后台/ }).first().click();
      await pollUntil(
        async () => (await page.getByText(`正在生成《${topic}》`).count()) === 0,
        { timeout: 6000, msg: '转后台后 overlay 应收起' },
      );
      const card = page.locator(LOC.progressCard).first();
      await expectVisible(card, { timeout: 6000, msg: '转后台后右下进度卡（ww-progress-card）应常驻' });
      assert.equal(await card.getAttribute('role'), 'region', '进度卡应为 region（aria-label=生成进度）');
      const dot = page.locator(LOC.progressDot).first();
      await expectVisible(dot, { timeout: 4000, msg: '顶栏进度点（ww-progress-dot）应可见（AC-6）' });
      const dotLabel = await dot.getAttribute('aria-label');
      assert.ok(dotLabel?.includes('生成任务运行中'), `进度点 aria-label 语义（实际：${dotLabel}）`);

      // toggle 语义（三轮挂因）：progressCardOpen 提交后默认 true，dot 的
      // onToggleProgressCard = setProgressCardOpen(open => !open)——卡已展开时点 dot
      // 是「收卡」。先点卡的收起钮（ww-progress-card-collapse）收起，再点 dot 验证
      // toggle 的展开方向 + aria-expanded 跟随。
      await page.locator('[data-testid="ww-progress-card-collapse"]').first().click();
      await pollUntil(
        async () => (await page.locator(LOC.progressCard).count()) === 0,
        { timeout: 6000, msg: '点收起钮后进度卡应消失（收起=不渲染）' },
      );

      await page.locator('[data-testid="ww-topbar-tab-hotspots"]').first().click(); // 跨 Tab（收起态）
      await expectVisible(dot, { timeout: 4000, msg: '切 Tab 后进度点应常驻可见（AC-6）' });
      await expectVisible(page.locator('.ww-hotspots').first(), { timeout: 6000, msg: '选题页内容应正常渲染（进度不遮挡）' });
      await dot.click();
      await expectVisible(card, { timeout: 4000, msg: '收起态下点进度点应重新展开进度卡（toggle）' });
      assert.equal(await dot.getAttribute('aria-expanded'), 'true', '进度点应绑定卡开合（aria-expanded）');
      await gotoWorkbench(page);
      // ---- B04 块结束 ----

      // 完成信号锚「进度点消失」（run 终态——dot 仅 queued|running 渲染，契约 §1-5）。
      // 不可锚「rail 出现含主题行」：live 相位 storage 不重置，历史轮次跑出的同名
      // 文章行会提前满足（四轮实锤：旧行命中时本轮 run 仍在进行，dot 消失断言假挂）。
      await pollUntil(
        async () => (await page.locator(LOC.progressDot).count()) === 0,
        { timeout: 240000, interval: 3000, msg: '240s 内管线未完成（进度点未消失=run 仍运行）' },
      );
      await pollUntil(
        async () => (await page.locator(LOC.railList).getByText(topic, { exact: false }).count()) > 0,
        { timeout: 15000, msg: '终态后 rail 应有本主题文章行' },
      );
      assert.equal(await page.locator('.ww-toast--error').count(), 0, '全绿路径不应出现 error toast');
    },
  },
  {
    id: 'H02',
    group: 'H 管线真跑',
    phase: 'live',
    // 前置：H01（新文章已落库）。
    // 步骤：rail 找新行 → 点开。
    // 断言：新行存在且标题含主题关键词；编辑器页头载入；状态=已排版（rendered）。
    // 时序雪崩防御（三轮挂因）：H01 用例失败早退不影响宿主真跑仍在进行——行出现
    // 即可点（pollUntil 240s 对齐 H01 完成预算）；「已排版」放宽 60s（run 可能仍在
    // gates/images 步，行在 run 落库时即出现而状态未终）。
    fn: async (page) => {
      await gotoWorkbench(page);
      const row = await pollUntil(
        async () => {
          const li = page.locator(LOC.railList).locator('li', { hasText: '本地优先的 AI 工作流' }).first();
          return (await li.count()) > 0 ? li : null;
        },
        { timeout: 240000, interval: 3000, msg: '240s 内 rail 未出现 H01 真跑新文章行（管线可能仍在进行）' },
      );
      await row.locator('button').first().click();
      const head = page.locator('.ww-editor-head').first();
      await expectVisible(head, { timeout: 12000, msg: '新文章编辑器未打开' });
      await expectVisible(head.getByText('已排版').first(), {
        timeout: 60000,
        msg: '新文章状态应为「已排版」（rendered；run 可能仍在 gates/images 步，放宽 60s）',
      });
    },
  },
  {
    id: 'H03',
    group: 'H 管线真跑',
    phase: 'live',
    // 前置：H02（编辑器已开）。
    // 步骤：读 markdown 长度 → 切仅预览。
    // 断言：CodeMirror 正文 >200 字符（成稿非空）；预览为真实渲染产物（内联 style + 正文非空）。
    // 时序防御同 H02：行定位 pollUntil 240s；视图显式前置 split（cm 依赖编辑视图，自足）。
    fn: async (page) => {
      await gotoWorkbench(page);
      const row = await pollUntil(
        async () => {
          const li = page.locator(LOC.railList).locator('li', { hasText: '本地优先的 AI 工作流' }).first();
          return (await li.count()) > 0 ? li : null;
        },
        { timeout: 240000, interval: 3000, msg: '240s 内 rail 未出现 H01 真跑新文章行（H03）' },
      );
      await row.locator('button').first().click();
      await setEditorView(page, 'split');
      const cm = page.locator('.cm-content').first();
      await expectVisible(cm, { timeout: 12000, msg: '编辑器未载入' });
      const len = await cm.evaluate((el) => el.textContent?.length ?? 0);
      assert.ok(len > 200, `成稿 markdown 应 >200 字符（实际 ${len}）`);

      await page.locator('[data-testid="ww-view-tab-preview"]').first().click();
      await pollUntil(
        async () => (await page.locator('.ww-preview__rendering').count()) === 0,
        { timeout: 15000, msg: '预览未就绪' },
      );
      const html = await page.locator('.ww-preview__content').first().evaluate((el) => el.innerHTML);
      assert.ok(html.includes('style='), '预览应含内联 style（真实排版产物）');
      const text = await page.locator('.ww-preview__content').first().innerText();
      assert.ok(text.trim().length > 50, `预览正文应非空（实际 ${text.trim().length} 字）`);
    },
  },
  {
    id: 'H04',
    group: 'H 管线真跑',
    phase: 'live',
    // 前置：H01（gates 步 succeeded 的投影）。
    // 步骤：看 StatusStrip 门禁项 + rail 门禁标记 + 门禁面板头部。
    // 断言：门禁=已过（strip 文本）；通过行无红色门禁标记（负向）；门禁面板可开。
    fn: async (page) => {
      await gotoWorkbench(page);
      await page.locator(LOC.railList).locator('li', { hasText: '本地优先的 AI 工作流' }).first().locator('button').first().click();
      await expectVisible(page.locator('.ww-statusstrip').getByText('门禁 已过').first(), {
        timeout: 8000,
        msg: 'StatusStrip 门禁项应为「门禁 已过」（gates succeeded 投影）',
      });
      assert.equal(
        await page.locator(LOC.railList).locator('li', { hasText: '本地优先的 AI 工作流' }).locator('.ww-rail-btn__gate').count(),
        0,
        '门禁已过的新文行不应有红色门禁标记（负向）',
      );
      // AC-9 等价断言：图片步真实失败降级 → run 仍 succeeded、无图
      await expectVisible(page.locator('.ww-statusstrip').getByText(/图 0 张/).first(), {
        timeout: 6000,
        msg: '图片步失败降级后应为「图 0 张」（AC-9 无图推进）',
      });
      await page.locator(LOC.gateChip).first().click();
      await expectVisible(page.locator(LOC.gateOverlay).first(), { timeout: 6000, msg: '门禁面板应可打开' });
      await page.locator('[data-testid="ww-gate-overlay-close"]').first().click();
    },
  },
  {
    id: 'H05',
    group: 'H 管线真跑',
    phase: 'live',
    // 前置：H01 后（再起一次真跑，立即取消——token 最小化，R4）。
    // 步骤：清场残留 toast → rail 表单起跑「取消路径验证」→ overlay 出现 → 立即点取消。
    // 断言：终态=已取消（toast「已取消生成」）；overlay 关闭；进度点不出现/消失；
    //       无成功 toast（负向）。
    // 清场（三轮挂因）：成功 toast 会跨用例残留到本条（无主动 dismiss 时），先点掉
    // 所有可见 toast 再做负向断言（无 toast 则首轮即通过）。
    fn: async (page) => {
      await pollUntil(
        async () => {
          if ((await page.locator('.ww-toast').count()) === 0) return true;
          await page.locator('.ww-toast .ww-toast__close').first().click().catch(() => {});
          return false;
        },
        { timeout: 8000, interval: 300, msg: 'toast 清场失败（残留成功 toast 会污染负向断言）' },
      );
      await startRunFromRail(page, '取消路径验证');
      await page.getByRole('button', { name: '取消生成' }).first().click();
      await expectVisible(page.locator('.ww-toasts').getByText('已取消生成').first(), {
        timeout: 8000,
        msg: '取消后应出现「已取消生成」toast',
      });
      await pollUntil(
        async () => (await page.getByText('正在生成《取消路径验证》').count()) === 0,
        { timeout: 8000, msg: '取消后 overlay 应关闭' },
      );
      assert.equal(await page.locator(LOC.progressDot).count(), 0, '取消后进度点应消失（终态非运行中）');
      assert.equal(await page.locator('.ww-toast--success').count(), 0, '取消路径不应有成功 toast（负向）');
    },
  },

/**
 * H06（v0.5 启动 brief 全合同真跑，live）——docs/v0.5-launch-brief.md 验收锚。
 * 入口不走 UI（StartupCard 仅零文章时渲染，live 相位必有库存）——用页面内
 * loopback RPC 探测器直发 run/start（group-j chat-integration 同款信封），
 * 驱动真宿主：真 LLM（glm-4.7-flash）+ 真 gates + 真落库。
 * 断言四层合同：标题硬绑（article.title===给定）；大纲骨架保留（给定节名全在
 * markdown）；来源可见（URL 裸文本进正文）且无编造（正文 URL ⊆ 给定来源）；
 * gates 步 succeeded（来源门禁真跑通过）。
 */
  {
    id: 'H06',
    group: 'H 管线真跑',
    phase: 'live',
    fn: async (page) => {
      const TITLE = 'H06 定稿标题：插件意图前置';
      const APPROACH = '一句话主题出稿注定平庸，防御在两端不如把意图沉进启动输入';
      const OUTLINE = ['为什么一句话不够', 'brief 四件套怎么绑', '门禁替你守合同'];
      const SOURCE = 'https://jerryjiao.github.io/dsh-wewrite/';
      const callPluginRpc = (endpoint, payload) =>
        page.evaluate(
          async ({ endpoint, payload }) => {
            const res = await fetch(`/dsh-wewrite/${endpoint}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ type: 'client-request', rpcId: `e2e-h06-${endpoint}-${Date.now()}`, method: endpoint, payload }),
            });
            let body = null;
            try {
              body = await res.json();
            } catch {
              /* 非 JSON 保持 null */
            }
            return { status: res.status, body };
          },
          { endpoint, payload },
        );
      // 成功信封 {ok:true,value}、错误信封 {ok:false,error}（loopback server-response 的 result 面）。
      const unwrap = (res) => {
        if (res.status !== 200 || res.body?.type !== 'server-response') {
          throw new Error(`RPC ${res.status} 非受控信封：${JSON.stringify(res.body)?.slice(0, 200)}`);
        }
        const result = res.body.result ?? {};
        if (result.ok === false) throw new Error(JSON.stringify(result.error));
        return result.value ?? result;
      };

      const started = unwrap(
        await callPluginRpc('run/start', {
          params: {
            topicMode: 'fixed',
            topic: 'H06 启动 brief 合同真跑',
            brief: { title: TITLE, approach: APPROACH, outline: OUTLINE, sources: [SOURCE] },
            imageCount: 0,
            // 模型可被 E2E_LLM_MODEL 覆盖：免费 flash 轮流拥挤（1305），验证轮换用（默认同 G05）。
            llm: { provider: 'zhipu', model: process.env.E2E_LLM_MODEL ?? 'glm-4.7-flash' },
          },
        }),
      );
      assert.ok(started?.runId, `run/start 应返回 runId（实得：${JSON.stringify(started)?.slice(0, 200)}）`);

      let detail = null;
      await pollUntil(
        async () => {
          detail = unwrap(await callPluginRpc('run/detail', { runId: started.runId }));
          return ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(detail?.status) ? true : null;
        },
        { timeout: 240000, interval: 4000, msg: '240s 内 brief 真跑未到终态' },
      );
      assert.equal(detail.status, 'succeeded', `brief 真跑终态应为 succeeded（error=${JSON.stringify(detail.error)}）`);
      const gatesStep = (detail.steps ?? []).find((step) => step.name === 'gates');
      assert.equal(gatesStep?.status, 'succeeded', 'gates 步应 succeeded（来源门禁真跑通过）');
      const sourcesGate = gatesStep?.metrics?.report?.sources;
      assert.ok(sourcesGate?.passed, `来源门禁应通过（issues=${JSON.stringify(sourcesGate?.issues)}）`);
      // 全新 run 的 run/detail 不带 articleId（该字段是重跑绑定语义，存量行为）——
      // 按硬绑标题在文章库定位（标题合同使定位确定性成立），再取全文。
      const articles = unwrap(await callPluginRpc('article/list', {}));
      const hit = (articles ?? []).find((a) => a?.title === TITLE);
      assert.ok(hit, `文章库应出现硬绑标题《${TITLE}》的文章（实得前 5 标题：${JSON.stringify((articles ?? []).slice(0, 5).map((a) => a?.title))}）`);

      const article = unwrap(await callPluginRpc('article/get', { id: hit.id }));
      assert.equal(article.title, TITLE, `标题硬绑：article.title 应为给定标题（实得：${article.title}）`);
      for (const section of OUTLINE) {
        assert.ok((article.markdown ?? '').includes(section), `大纲骨架：给定节「${section}」应原样出现在成稿`);
      }
      assert.ok((article.markdown ?? '').includes(SOURCE), '来源可见：给定 URL 应以裸文本出现在成稿');
      const foundUrls = [...String(article.markdown ?? '').matchAll(/https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&+;,=%-]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''));
      const invented = [...new Set(foundUrls)].filter((url) => !url.startsWith(SOURCE));
      assert.deepEqual(invented, [], `编造拦截：正文不得出现未给定 URL（实得：${JSON.stringify(invented)}）`);
    },
  },
];