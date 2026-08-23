/**
 * G 组 设置（9 条）——蓝本 §2.4 G01-G09 校对重锚。
 * 相位：G01-G05 → fresh（配置流：storage 重置保证未配置态与 llmDefault 空，
 * G05 配好 glm-4.7-flash 后贯穿 demo/live）；G06-G09 → demo。
 * 沿用锚点（骨架不动）：nav[aria-label="设置分组"] 5 项 / .ww-menu-trigger /
 * .ww-settings__save / .ww-provider-chain / .ww-callout--{ok,fail}。
 * 注意（两态风险声明，蓝本 G02 徽标翻转断言的降级）：凭据 secret 是宿主全局态
 * （~/.dsh/.credentials.yaml），fresh 重置只清插件 unit——G02 不断言顶栏徽标翻转，
 * 改锚表单层（保存反馈 + 回显），徽标「未配置」态由 A05 在保存前锁定。
 */
import {
  assert,
  expectTextContains,
  expectVisible,
  LOC,
  pollUntil,
  TAB,
} from '../lib.mjs';

async function gotoSettings(page) {
  await page.locator(LOC.settingsGear).first().click();
  await expectVisible(page.locator(LOC.settingsNav).first(), { timeout: 6000, msg: '设置分组导航未出现' });
}

async function clickGroup(page, label) {
  const item = page.locator(LOC.settingsNav).getByRole('button', { name: new RegExp(label) }).first();
  await item.click();
  await pollUntil(
    async () => (await item.getAttribute('aria-current')) === 'true',
    { timeout: 4000, msg: `分组「${label}」aria-current 未跟随` },
  );
  return item;
}

export default [
  {
    id: 'G01',
    group: 'G 设置',
    phase: 'fresh',
    // 前置：fresh。
    // 步骤：齿轮进设置 → 逐个点 5 组。
    // 断言：nav[aria-label=设置分组] 恰 5 项；点击切换内容区变化 + aria-current 跟随。
    fn: async (page) => {
      await gotoSettings(page);
      const nav = page.locator(LOC.settingsNav).first();
      assert.equal(await nav.getByRole('button').count(), 5, '设置分组应为 5 项');
      const groups = [
        ['公众号', '公众号接入'],
        ['模型服务', '模型服务'],
        ['图片供应商', 'fallback 链'],
        ['API 代理', 'API 代理'],
        ['发布纪律', '发布纪律'],
      ];
      for (const [label, sectionMark] of groups) {
        await clickGroup(page, label);
        await expectVisible(page.getByText(new RegExp(sectionMark)).first(), {
          timeout: 5000,
          msg: `切到「${label}」后内容区未出现对应组（${sectionMark}）`,
        });
      }
    },
  },
  {
    id: 'G02',
    group: 'G 设置',
    phase: 'fresh',
    // 前置：G01（A05 已锁定未配置态）。
    // 步骤：公众号组填 AppID wx-test-e2e + 作者名 → 保存 → 离开再进。
    // 断言：SaveState「已保存」出现；重进后 AppID 回显（config/set 落库）；
    //       secret 输入不回显明文（password 型 + 占位语义）。
    fn: async (page) => {
      await gotoSettings(page);
      await clickGroup(page, '公众号');
      const appid = page.getByLabel('公众号 AppID').first();
      await appid.fill('wx-test-e2e');
      await page.getByLabel('作者名').first().fill('e2e-author');
      await page.locator('.ww-settings__section').getByRole('button', { name: '保存' }).first().click();
      await expectVisible(page.locator('.ww-settings__save').getByText('已保存').first(), {
        timeout: 8000,
        msg: '保存后应出现「已保存」反馈',
      });

      await page.locator(TAB.home).first().click(); // 离开
      await gotoSettings(page);
      await clickGroup(page, '公众号');
      assert.equal(await page.getByLabel('公众号 AppID').first().inputValue(), 'wx-test-e2e', '重进后 AppID 应回显（落库）');
      const secret = page.getByLabel('公众号 AppSecret').first();
      assert.equal(await secret.getAttribute('type'), 'password', 'secret 输入应为 password 型（不回显明文）');
    },
  },
  {
    id: 'G03',
    group: 'G 设置',
    phase: 'fresh',
    // 前置：G01。
    // 步骤：模型服务组打开供应商菜单。
    // 断言：菜单含 zhipu（llm/options 真宿主透传，settings.yaml 已配）。
    fn: async (page) => {
      await gotoSettings(page);
      await clickGroup(page, '模型服务');
      const trigger = page.locator('.ww-settings__section .ww-menu-trigger').first();
      await expectVisible(trigger, { timeout: 6000, msg: '供应商菜单触发器未出现' });
      await trigger.click();
      await expectVisible(page.locator('[role="menuitem"], [role="menu"] *, [role="option"]').filter({ hasText: 'zhipu' }).first(), {
        timeout: 6000,
        msg: '供应商菜单应含 zhipu（宿主 settings.yaml 已配）',
      });
    },
  },
  {
    id: 'G04',
    group: 'G 设置',
    phase: 'fresh',
    // 前置：G03（菜单已开）。
    // 步骤：选 zhipu → 打开模型菜单。
    // 断言：AC-10 —— 菜单含三免费模型 glm-4.7-flash / glm-4.5-flash / glm-4-flash-250414。
    fn: async (page) => {
      await page.locator('[role="menuitem"], [role="option"]').filter({ hasText: 'zhipu' }).first().click();
      const modelTrigger = page.locator('.ww-settings__section .ww-menu-trigger').nth(1);
      await expectVisible(modelTrigger, { timeout: 5000, msg: '模型菜单触发器未出现' });
      await modelTrigger.click();
      for (const model of ['glm-4.7-flash', 'glm-4.5-flash', 'glm-4-flash-250414']) {
        await expectVisible(
          page.locator('[role="menuitem"], [role="menu"] *, [role="option"]').filter({ hasText: model }).first(),
          { timeout: 5000, msg: `模型菜单应含 ${model}（AC-10）` },
        );
      }
    },
  },
  {
    id: 'G05',
    group: 'G 设置',
    phase: 'fresh',
    // 前置：G04（模型菜单已开）。
    // 步骤：选 glm-4.7-flash → 保存 → 离开再进设置。
    // 断言：保存成功；重进后模型回显 glm-4.7-flash（llmDefault 落库——demo/live 相位贯穿依赖）。
    fn: async (page) => {
      await page.locator('[role="menuitem"], [role="option"]').filter({ hasText: 'glm-4.7-flash' }).first().click();
      await page.locator('.ww-settings__section').getByRole('button', { name: '保存' }).first().click();
      await expectVisible(page.locator('.ww-settings__save').getByText('已保存').first(), {
        timeout: 8000,
        msg: 'llmDefault 保存应成功',
      });
      await page.locator(TAB.home).first().click();
      await gotoSettings(page);
      await clickGroup(page, '模型服务');
      const modelTrigger = page.locator('.ww-settings__section .ww-menu-trigger').nth(1);
      await expectTextContains(modelTrigger, 'glm-4.7-flash', '重进设置后模型应回显 glm-4.7-flash（默认模型，ADR-010 附带）');
      const providerTrigger = page.locator('.ww-settings__section .ww-menu-trigger').first();
      await expectTextContains(providerTrigger, 'zhipu', '重进设置后供应商应回显 zhipu');
    },
  },
  {
    id: 'G06',
    group: 'G 设置',
    phase: 'demo',
    // 前置：demo。链来自 config.imageProviders——种子未设时为宿主默认 9 家链，
    // 若 session.mjs seedDemo 按架构 §1.3-3 裁单家 openai 则为 1 家（两种形态首项都是 openai）。
    // 步骤：图片供应商组。
    // 断言：fallback 链渲染（≥1 项）；首项 openai（默认链首位/裁单家均成立）。
    fn: async (page) => {
      await gotoSettings(page);
      await clickGroup(page, '图片供应商');
      const chain = page.locator('.ww-provider-chain').first();
      await expectVisible(chain, { timeout: 6000, msg: 'fallback 链容器未渲染' });
      const items = await chain.locator('.ww-provider').count();
      assert.ok(items >= 1, `fallback 链应至少 1 家（实际 ${items}）`);
      await expectTextContains(chain.locator('.ww-provider').first(), 'openai', '链首应为 openai');
    },
  },
  {
    id: 'G07',
    group: 'G 设置',
    phase: 'demo',
    // 前置：demo（无有效微信凭据——fresh 重置贯穿）。
    // 步骤：API 代理组点「测试连接」。
    // 断言：测试后出现分类结果提示（ww-callout ok/fail 两态其一——蓝本原文：不锚具体 errcode）；
    //       按钮从 testing 态恢复可用。
    fn: async (page) => {
      await gotoSettings(page);
      await clickGroup(page, 'API 代理');
      const test = page.getByRole('button', { name: /测试连接/ }).first();
      await expectVisible(test, { timeout: 6000, msg: '「测试连接」按钮未出现' });
      await test.click();
      const callout = await pollUntil(
        async () => (await page.locator('.ww-callout--ok, .ww-callout--fail').count()) > 0,
        { timeout: 20000, msg: '连接测试 20s 内应出分类结果提示（ww-callout）' },
      );
      assert.ok(callout === true);
      assert.equal(await test.isDisabled(), false, '测试完成后按钮应恢复可用');
    },
  },
  {
    id: 'G08',
    group: 'G 设置',
    phase: 'demo',
    // 前置：demo。
    // 步骤：发布纪律组 + 内容区扫描。
    // 断言：草稿箱锁定说明两段文案可见；设置内容区（.ww-settings__content，不含
    // 左栏 nav）无任何触发 freepublish/群发 动作的控件（button/switch，负向，安全默认）。
    // 假阳性教训：左栏「发布纪律」分组按钮的可访问名含 hint「草稿箱锁定，无自动群发」，
    // 旧写法 panelRoot 全域 getByRole('button',{name:/群发/}) 会命中该导航项——导航描述
    // 文案不是入口控件；作用域必须限定内容区。
    fn: async (page) => {
      await gotoSettings(page);
      await clickGroup(page, '发布纪律');
      await expectVisible(page.getByText('发布目标：草稿箱（锁定）').first(), { timeout: 5000, msg: '草稿箱锁定文案未出现' });
      await expectVisible(page.getByText(/群发不可撤回/).first(), { msg: '「群发不可撤回」纪律文案未出现' });
      const content = page.locator('.ww-settings__content');
      const publishControls =
        (await content.getByRole('button', { name: /群发|freepublish/i }).count()) +
        (await content.getByRole('switch', { name: /群发|freepublish/i }).count());
      assert.equal(
        publishControls,
        0,
        '设置内容区不应存在触发群发/freepublish 的控件（role=button/switch；左栏导航描述文案不算）（负向）',
      );
    },
  },
  {
    id: 'G09',
    group: 'G 设置',
    phase: 'demo',
    // 前置：demo。窄屏（蓝本 A04 的设置窄态部分，随设置组归位）。
    // 步骤：viewport 860 进设置 → 逐组切换 → 恢复。
    // 断言：窄态分组导航呈 chip 行（ww-settings__nav--row / ww-settings__chip）；
    //       5 组全部可达可切换（aria-current 跟随）。
    fn: async (page) => {
      await page.setViewportSize({ width: 860, height: 900 });
      await gotoSettings(page);
      const nav = page.locator(LOC.settingsNav).first();
      assert.ok(
        (await page.locator('.ww-settings--narrow').count()) > 0 || (await page.locator('.ww-settings__nav--row').count()) > 0,
        '窄态设置应有窄态容器/横排导航形态',
      );
      assert.equal(await nav.getByRole('button').count(), 5, '窄态 chip 行应含全部 5 组');
      for (const label of ['公众号', '模型服务', '图片供应商', 'API 代理', '发布纪律']) {
        const item = nav.getByRole('button', { name: new RegExp(label) }).first();
        await item.click();
        assert.equal(await item.getAttribute('aria-current'), 'true', `窄态下「${label}」应可切换且 aria-current 跟随`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await expectVisible(page.locator('.ww-settings__nav-item').first(), {
        timeout: 6000,
        msg: '恢复宽态后竖导航应回归',
      });
    },
  },
];
