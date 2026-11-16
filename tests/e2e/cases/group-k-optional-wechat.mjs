/**
 * K 组「可选公众号」回归（1 条）——v0.5.5 主线：不连公众号也能出稿。
 * 相位：fresh。断言口径：设置页把公众号标成「（可选）」并写明不配也能出稿（不依赖凭据状态）。
 * 启动卡的同一句话（「不连公众号也能出稿，随时可配」）由单测
 * tests/client/wechat-optional.test.tsx 锁定（零凭据渲染）；e2e 不再复算，免得依赖相位顺序
 * （fresh 相位内 I01/I02 会重启宿主、改写设置与凭据，早先的冷启动断言因此不稳）。
 * 稳健性：I02 之后插件客户端可能刚重挂，齿轮点击偶尔被吞——故按 aria-current 确认进页，
 * 文本断言用轮询，失败再补点一次齿轮（齿轮是导航不是开关，重复点安全）。
 * 截图：仅当 E2E_SHOTS_DIR 存在时落盘。
 */
import { mkdirSync } from 'node:fs';
import { expectTextContains, gotoWorkbench, LOC, pollUntil } from '../lib.mjs';

export default {
  id: 'K01',
  group: 'K 可选公众号',
  phase: 'fresh',
  fn: async (page) => {
    const shotsDir = process.env.E2E_SHOTS_DIR;
    if (shotsDir) mkdirSync(shotsDir, { recursive: true });

    await gotoWorkbench(page);
    const gear = page.locator(LOC.settingsGear).first();
    const body = page.locator('body');
    const inSettings = async () => (await gear.getAttribute('aria-current')) === 'page';
    const hasOptionalCopy = async () => (await body.innerText()).includes('公众号接入（可选）');

    await gear.click();
    try {
      await pollUntil(inSettings, { timeout: 6000, msg: '齿轮点击后未进入设置页' });
    } catch {
      await gear.click();
      await pollUntil(inSettings, { timeout: 6000, msg: '齿轮点击后未进入设置页（重试后仍失败）' });
    }
    // 设置页默认分组就是「公众号」（settings-panel.tsx 的 useState<SettingsGroup>('wechat')），无需点 nav。
    try {
      await pollUntil(hasOptionalCopy, { timeout: 6000 });
    } catch {
      await gear.click();
      await pollUntil(hasOptionalCopy, { timeout: 6000, msg: '设置页未出现「公众号接入（可选）」' });
    }
    await expectTextContains(body, '不配不影响出稿', '设置页应说明「不配不影响出稿」');
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/02-settings-wechat-optional.png` });
  },
};
