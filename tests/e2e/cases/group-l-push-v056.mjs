/**
 * L 组 v0.5.6 推送链路可视化（3 条，demo）——封面控件 / 推送留痕 / 不撒话文案的真机锚定。
 *
 * 背景：v0.5.6 把「出稿成功 → 首次推草稿箱」链路上的三处断点补上：
 * ① 封面是推送硬门槛，编辑器必须有「看得到、能补上」的封面控件（ww-cover-control）；
 * ② 推送留痕落库后要在设置页回看（ww-push-history）；
 * ③ 菜单/定时文案必须与行为一致（定时只跑稿、不自动推送）。
 *
 * demo 相位断言 UI 存在性与文案口径，不触发真实微信调用（无凭据路径）。
 */
import { assert, expectVisible, gotoWorkbench, LOC, pollUntil } from '../lib.mjs';

const DEMO_ROW = '[data-testid="ww-rail-row-art_demo_20260819"]';

async function openDemoArticle(page) {
  await gotoWorkbench(page);
  await page.locator(DEMO_ROW).first().click();
  await expectVisible(page.locator('.ww-editor-head').first(), { timeout: 10000, msg: '编辑器未打开' });
}

export default [
  {
    id: 'L01',
    group: 'L v0.5.6 推送链路',
    phase: 'demo',
    // 前置：demo（自足打开种子文章）。
    // 步骤：进编辑器，看页头下方的封面控件。
    // 断言：ww-cover-control 存在；有封面出缩略图、无封面出「缺封面」横幅（二者必居其一，
    //       不允许控件整体缺席——那是「缺封面但界面装作没事」的旧病）。
    fn: async (page) => {
      await openDemoArticle(page);
      const control = page.locator('[data-testid="ww-cover-control"]').first();
      await expectVisible(control, { timeout: 8000, msg: '封面控件未出现在编辑器页头下方' });
      const hasThumb = await page.locator('[data-testid="ww-cover-thumb"]').count();
      const hasBanner = await page.locator('[data-testid="ww-cover-banner"]').count();
      assert.equal(hasThumb + hasBanner >= 1, true, '封面控件应至少呈现缩略图或缺封面横幅之一');
      if (hasBanner) {
        const text = (await page.locator('[data-testid="ww-cover-banner"]').first().textContent()) ?? '';
        assert.equal(text.includes('缺封面'), true, '横幅应明说「缺封面」，不说含糊的「图片缺失」');
      }
    },
  },
  {
    id: 'L02',
    group: 'L v0.5.6 推送链路',
    phase: 'demo',
    // 前置：demo。
    // 步骤：设置页 → 公众号接入分组，找「最近推送」小节。
    // 断言：ww-push-history 存在；加载终态必是「还没有推送记录」/留痕行/降级提示三者之一
    //      （不允许永远停在「读取中…」——无超时兜底的加载就是新的无限 spinner）。
    fn: async (page) => {
      await page.locator(LOC.settingsGear).first().click();
      await expectVisible(page.locator(LOC.settingsNav).first(), { timeout: 6000, msg: '设置分组导航未出现' });
      const history = page.locator('[data-testid="ww-push-history"]').first();
      await expectVisible(history, { timeout: 8000, msg: '「最近推送」小节未出现在公众号接入区块' });
      const heading = (await page.locator('[data-testid="ww-push-history"] h4').first().textContent()) ?? '';
      assert.equal(heading.includes('最近推送'), true, '小节标题应为「最近推送」');
      await pollUntil(
        async () => {
          const empty = await page.locator('[data-testid="ww-push-history-empty"]').count();
          const rows = await page.locator('[data-testid="ww-push-history-row"]').count();
          const error = await page.locator('[data-testid="ww-push-history-error"]').count();
          return empty + rows + error > 0;
        },
        { timeout: 6000, msg: '推送留痕小节 6 秒内未到加载终态（空/行/降级）' },
      );
    },
  },
  {
    id: 'L03',
    group: 'L v0.5.6 推送链路',
    phase: 'demo',
    // 前置：demo。demo 相位公众号未配置（group-k 同前提）。
    // 步骤：展开「推草稿箱 ▾」菜单，读两项文案。
    // 断言：定时项明说「定时跑稿（不自动推送）」（无凭据形态为「配好公众号后才能定时跑稿」）；
    //       不得再出现「定时发」「一键发」这类与行为不符的许诺。
    fn: async (page) => {
      await openDemoArticle(page);
      const trigger = page.locator('.ww-menu-trigger--accent').first();
      await expectVisible(trigger, { timeout: 8000, msg: '推草稿箱菜单触发钮未出现' });
      await trigger.click();
      const menu = page.locator('[role="menu"]').first();
      await expectVisible(menu, { timeout: 4000, msg: '推送菜单未展开' });
      const menuText = (await menu.textContent()) ?? '';
      assert.equal(
        /定时跑稿|才能定时跑稿/.test(menuText),
        true,
        '定时项应叫「定时跑稿（不自动推送）」或无凭据引导形态',
      );
      assert.equal(/一键发|定时发/.test(menuText), false, '菜单不得再许诺「定时发 / 一键发」');
      await trigger.click(); // 收起菜单，不留尾态
    },
  },
];
