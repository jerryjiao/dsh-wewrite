/**
 * B 组 工作区（3 条）——蓝本 §2.4 B01-B04 按 v0.2 新 IA 重锚。
 * B01/B03 → fresh（零文章启动卡空态）；B02 → demo（有种子里程碑文章）。
 * B04（生成中进度卡/进度点跨 Tab，AC-6）按蓝本原文并入 H01 执行体
 * （避免多付一次 LLM 真跑），见 group-h-pipeline-live.mjs 注释——不独立注册。
 * 蓝本 D06（空库表格空态）在新 IA 由 B01 的 rail 空态断言吸收。
 */
import {
  assert,
  expectAbsent,
  expectTextContains,
  expectVisible,
  gotoWorkbench,
  LOC,
} from '../lib.mjs';

export default [
  {
    id: 'B01',
    group: 'B 工作区',
    phase: 'fresh',
    // 前置：fresh（零文章）。
    // 步骤：进写作工作区，读主区与左栏空态。
    // 断言：主区=启动卡（L4）；「开始写作」CTA 空输入不 disabled（AC-5）；
    //       rail 空态保留（搜索/筛选置灰 + mini 空态文案）；次级入口两路可见（未配置态）。
    fn: async (page) => {
      await gotoWorkbench(page);
      await expectVisible(page.locator(LOC.workbench).first(), { msg: '.ww-workbench 未出现' });
      const startup = page.locator(LOC.startup).first();
      await expectVisible(startup, { msg: '零文章时主区应为启动卡 .ww-startup（L4）' });
      assert.equal(await startup.getAttribute('aria-label'), '开始写作', '启动卡 aria-label 应为「开始写作」');

      const input = page.locator(LOC.startupInput).first();
      await expectVisible(input, { msg: '启动卡主题输入框未出现' });
      const submit = page.locator(LOC.startupSubmit).first();
      await expectVisible(submit, { msg: '启动卡「开始写作」CTA 未出现' });
      assert.equal(await submit.isDisabled(), false, '空输入时 CTA 不应 disabled（AC-5）');

      const rail = page.locator(LOC.rail).first();
      await expectVisible(rail, { msg: '零文章时左栏 .ww-rail 应保留（空态不撤栏）' });
      await expectVisible(page.getByText('还没有文章').first(), { timeout: 4000, msg: 'rail 空态文案「还没有文章」未出现' });
      assert.equal(await page.locator('[data-testid="ww-rail-search"]').first().isDisabled(), true, '空库时搜索框应置灰');

      await expectVisible(page.locator('[data-testid="ww-startup-alt-hotspots"]').first(), {
        msg: '次级入口「去选题中心挑热榜」未出现',
      });
      await expectVisible(page.locator('[data-testid="ww-startup-alt-settings"]').first(), {
        msg: '未配置凭据时卡底 helper「先配置公众号凭据」未出现（fresh appId 空）',
      });
    },
  },
  {
    id: 'B02',
    group: 'B 工作区',
    phase: 'demo',
    // 前置：demo（种子文章 art_demo_20260819 存在）。
    // 步骤：进写作工作区。
    // 断言：AC-2 —— 有文章时启动卡退位；默认视图=工作区+编辑器载入最近编辑一篇；
    //       rail 当前文章行高亮（ww-rail-btn--active + aria-current）。
    fn: async (page) => {
      await gotoWorkbench(page);
      await expectAbsent(page.locator(LOC.startup), 'articles ≥1 后启动卡不应再默认渲染（退位条件）');
      await expectVisible(page.locator(LOC.workbench).first(), { msg: '.ww-workbench 未出现' });
      const head = page.locator('.ww-editor-head').first();
      await expectVisible(head, { timeout: 10000, msg: '有文章时主区应载入编辑器（.ww-editor-head）' });
      await expectTextContains(head, '把公众号写作管线装进 DeepSeek Harness', '编辑器应默认载入最近编辑一篇（种子文章）');
      const row = page.locator('[data-testid="ww-rail-row-art_demo_20260819"]').first();
      await expectVisible(row, { msg: 'rail 当前文章行未出现' });
      assert.equal(await row.getAttribute('aria-current'), 'page', '当前文章行应 aria-current=page');
      assert.ok((await row.getAttribute('class'))?.includes('ww-rail-btn--active'), '当前文章行应有 ww-rail-btn--active');
    },
  },
  {
    id: 'B03',
    group: 'B 工作区',
    phase: 'fresh',
    // 前置：fresh（B01 后）。v0.2 AC-5 语义翻转：CTA 永不因空输入 disabled，点击聚焦输入框。
    // 步骤：空输入点 CTA → 填纯空格 → 填有效主题。
    // 断言：空/纯空格输入时 CTA enabled 且点击聚焦输入框（不发起生成不跳转）；有效主题 enabled。
    fn: async (page) => {
      await gotoWorkbench(page);
      const input = page.locator(LOC.startupInput).first();
      const submit = page.locator(LOC.startupSubmit).first();

      await submit.click();
      const focusedEmpty = await page.evaluate(
        () => document.activeElement?.getAttribute('data-testid'),
      );
      assert.equal(focusedEmpty, 'ww-startup-input', '空输入点 CTA 应聚焦输入框（AC-5）');
      assert.equal(await submit.isDisabled(), false, '空输入 CTA 不应 disabled');

      await input.fill('   ');
      assert.equal(await submit.isDisabled(), false, '纯空格输入 CTA 仍不应 disabled（trim 语义不降级按钮）');
      await submit.click();
      const focusedBlank = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      assert.equal(focusedBlank, 'ww-startup-input', '纯空格提交应被拦下并聚焦输入框');
      await expectVisible(page.locator(LOC.startup).first(), { timeout: 2000, msg: '空/空格提交不应离开启动卡（不起 run）' });

      await input.fill('有效主题校验');
      assert.equal(await submit.isDisabled(), false, '有效主题时 CTA 应 enabled');
      await input.fill(''); // 收尾清空，不留脏输入
    },
  },
];
