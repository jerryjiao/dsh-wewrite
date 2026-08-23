/**
 * D 组 文章列表与编辑（9 条，demo）——蓝本 §2.4 D01-D07 重锚（表格→左栏 ArticleRail）。
 * 锚点：DOM 契约 §1-3（ww-rail* 全家）；种子文章 art_demo_20260819
 * （status=rendered，run succeeded——scripts/seed-demo-data.mjs）。
 * 蓝本 D06（空库表格空态）由 B01 吸收；本组 D06 重锚为窄态工作区（AC-3 有数据版）。
 * 新增 D08（折叠持久化）/D09（新文章表单，AC-5 双锚点 + 从热榜挑导航）。
 */
import {
  assert,
  expectNotVisible,
  expectTextContains,
  expectVisible,
  gotoWorkbench,
  LOC,
  pollUntil,
} from '../lib.mjs';

const DEMO_ROW = '[data-testid="ww-rail-row-art_demo_20260819"]';

export default [
  {
    id: 'D01',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：demo（种子文章在库）。
    // 步骤：读左栏结构。
    // 断言：rail 挂载（aria-label=我的文章）；种子行渲染且含标题；搜索框占位语义。
    fn: async (page) => {
      await gotoWorkbench(page);
      const rail = page.locator(LOC.rail).first();
      await expectVisible(rail, { msg: '.ww-rail 未出现' });
      assert.equal(await rail.getAttribute('aria-label'), '我的文章', 'rail aria-label 应为「我的文章」');
      const row = page.locator(DEMO_ROW).first();
      await expectVisible(row, { msg: '种子文章行 ww-rail-row-art_demo_20260819 未渲染' });
      await expectTextContains(row, '把公众号写作管线装进 DeepSeek Harness', '种子行应含文章标题');
      const search = page.locator('[data-testid="ww-rail-search"]').first();
      await expectVisible(search, { msg: 'rail 搜索框未出现' });
      const ph = await search.getAttribute('placeholder');
      assert.ok(ph?.includes('搜索'), `搜索框 placeholder 应含「搜索」（实际：${ph}）`);
    },
  },
  {
    id: 'D02',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：D01。种子文章 status=rendered（≠pushed）。
    // 步骤：切状态筛选 chip。
    // 断言：4 chip 齐（全部/草稿/门禁未过/已进草稿箱）；aria-pressed 跟随；
    //       「已进草稿箱」下 rendered 行不可见（负向——筛选语义正确）；「全部」下回归。
    fn: async (page) => {
      await gotoWorkbench(page);
      const chips = ['all', 'draft', 'gate-failed', 'pushed'];
      for (const c of chips) {
        await expectVisible(page.locator(`[data-testid="ww-rail-filter-${c}"]`).first(), {
          timeout: 4000,
          msg: `筛选 chip ww-rail-filter-${c} 未出现`,
        });
      }
      const row = page.locator(DEMO_ROW).first();
      await expectVisible(row, { msg: '默认（全部）下种子行应可见' });

      const pushed = page.locator('[data-testid="ww-rail-filter-pushed"]').first();
      await pushed.click();
      assert.equal(await pushed.getAttribute('aria-pressed'), 'true', 'pushed chip 激活态应 aria-pressed=true');
      await expectNotVisible(row, { msg: 'rendered 文章不应出现在「已进草稿箱」筛选下（负向）' });

      const all = page.locator('[data-testid="ww-rail-filter-all"]').first();
      await all.click();
      await expectVisible(row, { timeout: 4000, msg: '切回「全部」后种子行应回归' });
    },
  },
  {
    id: 'D03',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：D01。
    // 步骤：搜索标题片段 → 搜索 slug → 清空。
    // 断言：标题/slug 双口径命中（占位语义「搜索标题 / slug」）；清空后回归。
    fn: async (page) => {
      await gotoWorkbench(page);
      const search = page.locator('[data-testid="ww-rail-search"]').first();
      const row = page.locator(DEMO_ROW).first();
      await search.fill('DeepSeek');
      await expectVisible(row, { timeout: 4000, msg: '标题片段「DeepSeek」应命中种子行' });
      await search.fill('dsh-wewrite-pipeline');
      await expectVisible(row, { timeout: 4000, msg: 'slug「dsh-wewrite-pipeline」应命中种子行' });
      await search.fill('');
      await expectVisible(row, { timeout: 4000, msg: '清空搜索后种子行应回归' });
    },
  },
  {
    id: 'D04',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：D01。负向/边界。
    // 步骤：搜索不相关词 zzz。
    // 断言：列表 0 行（无白屏无报错，rail 结构保留）。
    // 空态文案说明：契约 §1-3 的 mini EmptyState「还没有文章」仅绑定零文章库
    // （实现 empty=articles.length===0）——搜索/筛选无结果只清空列表行，不渲染空态
    // 文案；负向断言锚列表行数与结构，不锚「还没有文章」（demo 相位有种子，永不出现）。
    // 用例自足（二轮教训）：搜索词是持久 UI 状态，断言完必须清空并等列表恢复，
    // finally 兜底失败路径也清——否则 D05 点不到行（首轮二轮 D05 挂因）。
    fn: async (page) => {
      const search = page.locator('[data-testid="ww-rail-search"]').first();
      try {
        await gotoWorkbench(page);
        await search.fill('zzz');
        await pollUntil(
          async () => (await page.locator(DEMO_ROW).count()) === 0 || !(await page.locator(DEMO_ROW).first().isVisible().catch(() => false)),
          { timeout: 4000, msg: '不相关词下种子行应被滤除' },
        );
        const visibleRows = await page.locator('.ww-rail__list .ww-rail__row').count();
        assert.equal(visibleRows, 0, `搜索无结果时列表应为 0 行（实际 ${visibleRows}）`);
        await expectVisible(page.locator(LOC.rail).first(), { msg: '空结果下 rail 结构不应消失' });
      } finally {
        await search.fill('').catch(() => {}); // 失败路径也清残留，不掩盖原错误
      }
      await expectVisible(page.locator(DEMO_ROW).first(), {
        timeout: 4000,
        msg: '清空搜索后种子行应回归（用例收尾自足，D05 前置）',
      });
    },
  },
  {
    id: 'D05',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：D01。AC-2 核心：切换文章 ≤1 次点击、无整页跳转。
    // 步骤：点 rail 行。
    // 断言：编辑器页头载入该文（标题）；行高亮跟随（aria-current + active 类）；
    //       面板内容区未整页跳转（#wewrite-panel-content 持续存在）。
    fn: async (page) => {
      await gotoWorkbench(page);
      const contentCount = await page.locator(LOC.content).count();
      await page.locator(DEMO_ROW).first().click();
      const head = page.locator('.ww-editor-head').first();
      await expectVisible(head, { timeout: 10000, msg: '点行后编辑器页头应出现（≤1 次点击切换，AC-2）' });
      await expectTextContains(head, '把公众号写作管线装进 DeepSeek Harness', '编辑器应载入所点文章');
      const row = page.locator(DEMO_ROW).first();
      assert.equal(await row.getAttribute('aria-current'), 'page', '所点行应 aria-current=page');
      assert.equal(await page.locator(LOC.content).count(), contentCount, '切换不应整页跳转（内容区原地）');
    },
  },
  {
    id: 'D06',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：demo（有文章）。窄态有数据版（蓝本 A04 窄态设置已移 G09，本条为 AC-3 主战场）。
    // 步骤：viewport 860 → 观察下拉 → 点开 → 恢复 1440。
    // 断言：窄态 rail 退化为 ww-rail-select 且显示当前文章标题；下拉可展开出文章项；
    //       恢复宽态 rail 回归。
    fn: async (page) => {
      await gotoWorkbench(page);
      await page.setViewportSize({ width: 860, height: 900 });
      await expectNotVisible(page.locator(LOC.rail), { msg: '窄态下 .ww-rail 应退化为下拉' });
      const select = page.locator('[data-testid="ww-rail-select"]').first();
      await expectVisible(select, { timeout: 6000, msg: '窄态下拉 ww-rail-select 未出现（AC-3）' });
      await expectTextContains(select, '把公众号写作管线装进 DeepSeek Harness', '下拉应显示当前文章标题');
      await select.click();
      // 官方 Menu 实现的弹出项：菜单容器内出现文章项（标题至少在选择器+菜单两处）
      const menuHost = page.locator('[role="menu"], [role="listbox"]').first();
      const menuVisible = await menuHost.isVisible().catch(() => false);
      if (menuVisible) {
        await expectTextContains(menuHost, '把公众号写作管线装进 DeepSeek Harness', '下拉菜单应含文章项');
      } else {
        const occurrences = await page.getByText('把公众号写作管线装进 DeepSeek Harness').count();
        assert.ok(occurrences >= 2, `下拉展开后文章标题应出现于菜单（实际出现 ${occurrences} 处）`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await expectVisible(page.locator(LOC.rail).first(), { timeout: 6000, msg: '恢复宽态后 rail 应回归' });
    },
  },
  {
    id: 'D07',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：demo。种子 run succeeded → 门禁推导=已过（src/client/lib/gate.ts）。
    // 步骤：开编辑器看门禁投影。
    // 断言：通过文章行无门禁标记（负向——ww-rail-btn__gate 仅未过行渲染）；
    //       StatusStrip 门禁项=已过。
    fn: async (page) => {
      await gotoWorkbench(page);
      await page.locator(DEMO_ROW).first().click();
      await expectVisible(page.locator('.ww-editor-head').first(), { timeout: 10000, msg: '编辑器未打开' });
      assert.equal(
        await page.locator(`${DEMO_ROW} .ww-rail-btn__gate`).count(),
        0,
        '门禁已过（run succeeded）的行不应渲染红色门禁标记（负向，AC-4 边界）',
      );
      await expectVisible(page.locator('.ww-statusstrip').getByText('门禁 已过').first(), {
        timeout: 6000,
        msg: 'StatusStrip 门禁项应为「门禁 已过」',
      });
    },
  },
  {
    id: 'D08',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：demo（编辑器页头最左的 ww-rail__toggle 常驻）。
    // 步骤：折叠 → 校验持久化 → 重新穿越 → 仍折叠 → 展开。
    // 断言：折叠态类 + aria-expanded=false；localStorage['ww.rail.collapsed'] 写入；
    //       重进面板后折叠保持（持久化语义）；可再展开。
    fn: async (page, ctx) => {
      await gotoWorkbench(page);
      const toggle = page.locator('[data-testid="ww-rail-toggle"]').first();
      await expectVisible(toggle, { timeout: 6000, msg: 'rail 折叠钮 ww-rail-toggle（编辑器页头最左）未出现' });
      await toggle.click();
      await pollUntil(
        async () => (await page.locator('.ww-rail--collapsed').count()) > 0,
        { timeout: 4000, msg: '折叠后应出现 ww-rail--collapsed 态' },
      );
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', '折叠后 aria-expanded=false');
      const saved = await page.evaluate(() => window.localStorage.getItem('ww.rail.collapsed'));
      assert.ok(saved !== null, '折叠状态应写入 localStorage[ww.rail.collapsed]');

      await ctx.openPanel(page); // 重新穿越验证持久化（route 重置回 home）
      await pollUntil(
        async () => (await page.locator('.ww-rail--collapsed').count()) > 0,
        { timeout: 8000, msg: '重进面板后折叠态应保持（localStorage 持久化）',
        },
      );
      const toggle2 = page.locator('[data-testid="ww-rail-toggle"]').first();
      await toggle2.click();
      await pollUntil(
        async () => (await page.locator('.ww-rail--collapsed').count()) === 0,
        { timeout: 4000, msg: '再点折叠钮应展开' },
      );
      assert.equal(await toggle2.getAttribute('aria-expanded'), 'true', '展开后 aria-expanded=true');
    },
  },
  {
    id: 'D09',
    group: 'D 文章列表',
    phase: 'demo',
    // 前置：demo。RailNewButton（蓝本外新增，AC-5 第二锚点 + L1 新文章入口）。
    // 步骤：点「新文章」→ 展开表单 → 空输入点 CTA → 点「从热榜挑」。
    // 断言：表单展开 + aria-expanded=true；空输入 CTA 不 disabled 且点击聚焦输入框；
    //       「从热榜挑」navigate 到选题（顶栏选题 aria-current=page）。
    fn: async (page) => {
      await gotoWorkbench(page);
      const newBtn = page.locator('.ww-rail__new').first();
      await expectVisible(newBtn, { msg: 'rail 底部「新文章」按钮未出现' });
      await newBtn.click();
      const form = page.locator(LOC.railNewForm).first();
      await expectVisible(form, { timeout: 4000, msg: '新文章表单 .ww-rail-new 未展开' });
      assert.equal(await newBtn.getAttribute('aria-expanded'), 'true', '展开后按钮 aria-expanded=true');

      const submit = page.locator('[data-testid="ww-rail-new-submit"]').first();
      await expectVisible(submit, { msg: '表单「开始写作」CTA 未出现' });
      assert.equal(await submit.isDisabled(), false, 'rail 表单空输入 CTA 同守 AC-5（不 disabled）');
      await submit.click();
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      assert.equal(focused, 'ww-rail-new-input', '空输入点 CTA 应聚焦输入框（AC-5 双锚点）');

      const hotspots = page.locator('[data-testid="ww-rail-new-hotspots"]').first();
      await expectVisible(hotspots, { msg: '「从热榜挑」入口未出现' });
      await hotspots.click();
      assert.equal(
        await page.locator('[data-testid="ww-topbar-tab-hotspots"]').first().getAttribute('aria-current'),
        'page',
        '「从热榜挑」应 navigate 到选题页',
      );
      await expectVisible(page.locator('.ww-hotspots').first(), { timeout: 6000, msg: '选题页应渲染' });
      await gotoWorkbench(page);
    },
  },
];
