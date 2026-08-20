/**
 * C 组 选题中心（7 条，demo）——蓝本 §2.4 C01-C05 重锚 + C06 新增（AC-8 负向）
 * + C07 重写（v0.3 R1 逐条 AI 速览：行展开区缓存渲染 + loading 态路径）。
 * 相位：demo（协调人分配；热榜数据来自真 HN API，不依赖——demo 相位宿主
 * 已带 ZHIPU_API_KEY 且 llmDefault 已由 fresh 相位 G05 配好；C07 第一次展开
 * 会真触发一次 hotspots/digestItem（不 mock RPC：connection.rpc 是进程内 loopback
 * 通道，page.route 拦不到；断言只锚 loading 态，随后收起不等待其完成）。
 * 沿用锚点（骨架不动）：.ww-hotspots / .ww-hotspot-list / .ww-hotspot--hit /
 * input[aria-label="添加选题关键词"] / .ww-filter-toggle / localStorage 键
 * dsh-wewrite.hotspot-keywords。
 * v0.3 新锚点：ww-hotspot-digest 族（ww-hotspot-digest / -source / -body / -retry）。
 */
import {
  assert,
  clickTab,
  expectAbsent,
  expectVisible,
  pollUntil,
} from '../lib.mjs';

const KEYWORDS_LS = 'dsh-wewrite.hotspot-keywords';

/**
 * 热榜快照：rows=条目数；error=失败隔离态计数。
 * 失败锚点用结构而非文案：ErrorNote 渲染 div.ww-error[role=alert]（bits.tsx），
 * 其 title 会被 describeRpcFailure 按错误分类替换（如 10s AbortSignal 超时透传
 * message），锚「热榜拉取失败」文案在外网超时路径下不成立。
 */
async function hotspotState(page) {
  const rows = await page.locator('.ww-hotspot-list .ww-hotspot').count();
  const error = await page.locator('.ww-hotspots .ww-error').count();
  return { rows, error };
}

/**
 * 轮询热榜直到终态（条目 ≥1 或失败隔离态），骨架期返回 null 继续。
 * 终态预算 15s：热榜 fetch 带 10s AbortSignal（src/host/pipeline/steps/topic.ts），
 * 骨架期最长 ~10s 后必然转 ready/error（宿主 fetchHotspots 两态其一），留 50% 余量。
 * 教训：pollUntil 回调不可恒返回真值对象（首轮 C01/C02 即时返回 {rows:0,error:0}
 * 假终态，assert 立即失败）——终态判定必须进回调。
 */
async function hotspotSettled(page, { timeout = 15000, msg } = {}) {
  return pollUntil(async () => {
    const s = await hotspotState(page);
    return s.rows > 0 || s.error > 0 ? s : null;
  }, { timeout, interval: 500, msg });
}

export default [
  {
    id: 'C01',
    group: 'C 选题',
    phase: 'demo',
    // 前置：demo。真 HN API（AC-3 失败隔离两态其一）。
    // 步骤：进选题中心等终态（骨架期最长 ~10s AbortSignal）。
    // 断言：容器结构在；列表条目出现，或外网不可达时失败隔离态出现且不白屏。
    fn: async (page) => {
      await clickTab(page, 'hotspots');
      await expectVisible(page.locator('.ww-hotspots').first(), { msg: '.ww-hotspots 容器未出现' });
      const st = await hotspotSettled(page, { msg: '热榜 15s 内既无条目也无失败态（fetch 10s AbortSignal + 余量）' });
      assert.ok(st.rows > 0 || st.error > 0, '热榜应渲染条目或失败隔离态（两态其一）');
      if (st.rows === 0) {
        await expectVisible(page.locator('.ww-hotspots .ww-error').first(), { msg: '失败隔离态（.ww-error role=alert）未出现' });
      } else {
        await expectVisible(page.locator('.ww-hotspot .ww-hotspot__title').first(), { msg: '条目标题列未渲染' });
      }
    },
  },
  {
    id: 'C02',
    group: 'C 选题',
    phase: 'demo',
    // 前置：C01（已加载）。
    // 步骤：点刷新。
    // 断言：刷新后回到确定态（fetchHotspots 先转 loading 清列表，终态=列表重渲染或
    //       失败隔离态，同样按 15s 终态预算等待）；刷新按钮恢复可用；页面结构不破。
    fn: async (page) => {
      const refresh = page.getByRole('button', { name: /刷新/ }).first();
      await expectVisible(refresh, { msg: '刷新按钮未出现' });
      await refresh.click();
      await expectVisible(page.locator('.ww-hotspots').first(), { msg: '刷新期间容器不应消失' });
      const st = await hotspotSettled(page, { msg: '刷新后 15s 未回到确定态（列表或失败隔离）' });
      assert.ok(st.rows > 0 || st.error > 0, '刷新后应有终态（列表或失败隔离）');
      assert.equal(await refresh.isDisabled(), false, '刷新完成后按钮应恢复可用');
    },
  },
  {
    id: 'C03',
    group: 'C 选题',
    phase: 'demo',
    // 前置：C01。关键词持久化键 dsh-wewrite.hotspot-keywords（localStorage，沿用）。
    // 步骤：输入 AI → 提交 → Pill 出现 → localStorage 校验 → 点 Pill 本体（负向）→
    //       点 Pill 内 × 按钮（aria-label=移除关键词「AI」，v0.2.1 P5 新结构）删除。
    // 断言：Pill 文本出现；持久化键包含 AI；点 Pill 本体不删除（P5 误触收敛）；
    //       点 × 后消失且键同步。
    fn: async (page) => {
      const input = page.getByLabel('添加选题关键词').first();
      await expectVisible(input, { msg: '关键词输入框未出现' });
      await input.fill('AI');
      await page.keyboard.press('Enter');
      await expectVisible(page.locator('.ww-keywords').getByText('AI', { exact: true }).first(), {
        timeout: 4000,
        msg: '关键词 Pill「AI」未出现',
      });
      const persisted = await page.evaluate((k) => window.localStorage.getItem(k), KEYWORDS_LS);
      assert.ok(persisted?.includes('AI'), `关键词应写入 localStorage（实际：${persisted}）`);

      // P5 负向：Pill 本体已是静态 chip，点击左缘（避开右侧 ×）不再触发删除
      await page.locator('.ww-keyword', { hasText: 'AI' }).first().click({ position: { x: 4, y: 4 } }).catch(() => {});
      await page.waitForTimeout(300);
      const still = await page.locator('.ww-keywords').getByText('AI', { exact: true }).count();
      assert.ok(still > 0, 'P5：点 Pill 本体不应删除关键词');

      // P5 正向：点 × 独立删除按钮（aria-label 提供可访问名）
      const remove = page.getByRole('button', { name: '移除关键词「AI」' }).first();
      await expectVisible(remove, { msg: 'P5 × 删除按钮（aria-label=移除关键词「AI」）未出现' });
      await remove.click();
      const gone = await pollUntil(
        async () => (await page.locator('.ww-keywords').getByText('AI', { exact: true }).count()) === 0,
        { timeout: 4000, msg: '点击 × 后关键词未删除' },
      );
      assert.ok(gone === true);
      const after = await page.evaluate((k) => window.localStorage.getItem(k), KEYWORDS_LS);
      assert.ok(!after?.includes('"AI"'), `删除后 localStorage 应同步移除（实际：${after}）`);
    },
  },
  {
    id: 'C04',
    group: 'C 选题',
    phase: 'demo',
    // 前置：C03（关键词机制可用）。
    // 步骤：添加必不命中词 → 开「只看命中」→ 断言空态 → 关筛选。
    // 断言：aria-pressed 跟随；无命中空态文案出现（负向/边界）；关掉后列表回归或失败态保持。
    fn: async (page) => {
      const input = page.getByLabel('添加选题关键词').first();
      await input.fill('zzz-e2e-nohit');
      await page.keyboard.press('Enter');
      const toggle = page.locator('.ww-filter-toggle').first();
      await expectVisible(toggle, { msg: '命中筛选开关未出现' });
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-pressed'), 'true', '开筛选后 aria-pressed=true');
      await expectVisible(page.getByText('没有命中').first(), {
        timeout: 4000,
        msg: '必不命中词 + 只看命中应显示空态文案',
      });
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false', '关筛选后 aria-pressed=false');
      const st = await hotspotSettled(page, { timeout: 10000, msg: '关筛选后未回到确定态' });
      assert.ok(st.rows > 0 || st.error > 0, '关筛选后应恢复全部行或失败态');
      // 收尾：删掉测试关键词（P5：点该 Pill 内的 × 按钮）
      const removeNoHit = page.locator('.ww-keyword', { hasText: 'zzz-e2e-nohit' })
        .getByRole('button', { name: '移除关键词「zzz-e2e-nohit」' }).first();
      if (await removeNoHit.count()) await removeNoHit.click().catch(() => {});
    },
  },
  {
    id: 'C05',
    group: 'C 选题',
    phase: 'demo',
    // 前置：demo（llmDefault 已配——G05 fresh 贯穿）。
    // 步骤：展开首条 → 点「写这个」→ overlay 出现 → 立即取消。
    // 断言：AC-8 —— 单击即启动管线（正在生成《…》overlay + stepper 渲染）；
    //       取消后 toast 已取消生成、overlay 消失（不起完整 LLM 真跑，R4 预算控制）。
    fn: async (page) => {
      await clickTab(page, 'hotspots');
      const st = await hotspotSettled(page, { msg: '热榜未就绪' });
      if (st.rows === 0) {
        assert.ok(st.error > 0, 'C05 需要可用的热榜数据（当前为失败态，外网不可达）');
      }
      const row = page.locator('.ww-hotspot .ww-hotspot__row').first();
      await row.click();
      let write = page.getByRole('button', { name: '写这个' }).first();
      if (!(await write.count())) {
        await row.hover(); // 新 IA「写这个」hover 显隐（AC-8），展开失败时退回 hover 探测
        await page.waitForTimeout(300);
      }
      await expectVisible(write, { timeout: 4000, msg: '「写这个」按钮未出现（AC-8）' });
      await write.click();
      await expectVisible(page.getByText(/正在生成《.+》/).first(), {
        timeout: 10000,
        msg: '点「写这个」应进入生成流（overlay 标题）',
      });
      await expectVisible(page.locator('.ww-stepper').first(), { msg: 'stepper 未渲染' });
      await page.getByRole('button', { name: '取消生成' }).first().click();
      await expectVisible(page.locator('.ww-toasts').getByText('已取消生成').first(), {
        timeout: 6000,
        msg: '取消后应出现「已取消生成」toast',
      });
      await pollUntil(
        async () => (await page.getByText(/正在生成《.+》/).count()) === 0,
        { timeout: 6000, msg: '取消后 overlay 应关闭' },
      );
    },
  },
  {
    id: 'C06',
    group: 'C 选题',
    phase: 'demo',
    // 前置：C05（列表可用）。新增用例（蓝本外，AC-8/L5 负向）。
    // 步骤：展开首条，看操作区。
    // 断言：「写这个」存在；无行为按钮「收藏」不出现（P0 纪律：无行为即无控件）。
    fn: async (page) => {
      await clickTab(page, 'hotspots');
      const st = await hotspotSettled(page, { msg: '热榜未就绪' });
      if (st.rows === 0) assert.ok(st.error > 0, 'C06 需要可用的热榜数据');
      const row = page.locator('.ww-hotspot .ww-hotspot__row').first();
      await row.click();
      await expectVisible(page.getByRole('button', { name: '写这个' }).first(), {
        timeout: 4000,
        msg: '展开条目应有「写这个」动作',
      });
      const bookmark = await page.getByRole('button', { name: /收藏/ }).count();
      assert.equal(bookmark, 0, '无行为按钮「收藏」不应出现（L5 隐藏纪律）');
    },
  },
  {
    id: 'C07',
    group: 'C 选题',
    phase: 'demo',
    // 前置：C01。重写用例（v0.3 R1 逐条 AI 速览，替代 v0.2.1 整卡版）。
    // mock 说明（沿旧理由）：宿主 connection.rpc 是进程内 loopback 通道（非 HTTP 请求），
    // page.route 无法拦截；且 E2E 纪律不跑真 LLM。ready 态走缓存渲染路径：
    // 第一次展开仅断言 loading 骨架即收起（RPC 已发出，不等完成）；从展开区读出
    // 真实 URL 后预置 localStorage 缓存条目，再展开断言 ready 全量渲染（不触 RPC）。
    fn: async (page) => {
      await clickTab(page, 'hotspots');
      // 撤销项负向：v0.2.1 整卡速览入口不应再出现
      await expectAbsent(page.locator('[data-testid="ww-digest-generate"]'), 'v0.2.1 整卡「AI 速览」按钮应已撤销');
      const st = await hotspotSettled(page, { msg: '热榜未就绪' });
      assert.ok(st.rows > 0, 'C07 需要可用的热榜数据（当前为失败态）');
      await page.evaluate(() => window.localStorage.removeItem('dsh-wewrite.hotspot-item-digests'));

      // 第一次展开（无缓存）：自动触发生成 → loading 骨架 + 原文链接行仍在
      const row = page.locator('.ww-hotspot .ww-hotspot__row').first();
      await row.click();
      const digest = page.locator('[data-testid="ww-hotspot-digest"]').first();
      await expectVisible(digest, { timeout: 4000, msg: '展开条目应渲染逐条 AI 速览块' });
      await expectVisible(page.locator('[data-testid="ww-hotspot-digest-body"] .ww-skeleton-block').first(), {
        timeout: 4000,
        msg: '无缓存首次展开应进 loading 态（骨架行）',
      });
      const link = page.locator('.ww-hotspot__expand a.ww-link').first();
      await expectVisible(link, { msg: '展开区原文链接行应在（速览块不替代它）' });
      const url = await link.getAttribute('href');
      assert.ok(url && /^https?:/.test(url), `应能从展开区读到原文 URL（实际：${url}）`);
      await row.click(); // 收起（RPC 已发出，不等完成——结果由缓存路径覆盖验证）

      // 预置缓存（键 = URL；当日有效）后重展开：ready 全量渲染，全程不再触 RPC
      await page.evaluate(
        ({ url: u, entry }) =>
          window.localStorage.setItem('dsh-wewrite.hotspot-item-digests', JSON.stringify({ [u]: entry })),
        {
          url,
          entry: {
            digest: [
              '这条在讲什么：某开源框架发布 v2，重写运行时并砍掉 X 依赖。',
              '· 要点一：性能实测提升 40%，但破坏全部 v1 插件 API。',
              '· 要点二：作者给出迁移指南，社区分叉已在路上。',
            ].join('\n'),
            source: 'article',
            model: 'glm-4.7-flash',
            generatedAtIso: new Date().toISOString(),
          },
        },
      );
      await row.click();
      const body = page.locator('[data-testid="ww-hotspot-digest-body"]').first();
      await expectVisible(body, { timeout: 4000, msg: '缓存命中后速览正文应渲染' });
      await expectVisible(page.locator('.ww-hotspot__digest-lead .ww-hotspot__digest-prefix').first(), {
        timeout: 4000,
        msg: '「这条在讲什么：」lead 前缀应 700 加粗渲染',
      });
      await expectVisible(page.locator('.ww-hotspot__digest-point').first(), {
        timeout: 4000,
        msg: '「·」行应按缩进列表化渲染',
      });
      const source = page.locator('[data-testid="ww-hotspot-digest-source"]').first();
      await expectVisible(source, { timeout: 4000, msg: 'source 徽记未渲染' });
      assert.ok((await source.innerText()).includes('读了原文'), 'source=article 徽记应为「读了原文」');
      assert.equal(
        await page.locator('[data-testid="ww-hotspot-digest-body"] .ww-skeleton-block').count(),
        0,
        '缓存命中不应再出现骨架（缓存命中不调 RPC）',
      );
      await expectVisible(page.locator('.ww-hotspot__expand a.ww-link').first(), {
        msg: 'ready 态原文链接行应仍在',
      });

      // 收尾：清预置缓存并收起，不串扰后续用例
      await page.evaluate(() => window.localStorage.removeItem('dsh-wewrite.hotspot-item-digests'));
      await row.click().catch(() => {});
    },
  },
];
