/**
 * A 组 导航（5 条，fresh）——蓝本 §2.4 A01-A05 按 v0.2 新 IA 重锚。
 * 锚点：TopBar 4 导航对象（ww-topbar / 3 tab / 设置齿轮），DOM 契约 §1-1。
 * 相位：fresh（storage 重置为空 unit——空态断言与「未配置」徽标态的确定性保证）。
 */
import {
  assert,
  clickTab,
  expectAbsent,
  expectNotVisible,
  expectPresent,
  expectVisible,
  LOC,
  TAB,
} from '../lib.mjs';

export default [
  {
    id: 'A01',
    group: 'A 导航',
    phase: 'fresh',
    // 前置：fresh 相位（空 unit）；runner 已 openPanel 穿越到面板。
    // 步骤：读顶栏结构。
    // 断言：AC-1 —— 顶栏有且仅有 4 个导航对象（3 tab + 设置齿轮），高 ≤40px，
    //       写作 tab 激活（aria-current=page）；旧 5 Tab 的「文章库」不存在（负向）。
    fn: async (page) => {
      const topbar = page.locator(LOC.topbar).first();
      await expectVisible(topbar, { msg: '顶栏 [data-testid=ww-topbar] 未挂载（AC-1）' });

      const nav = page.locator(LOC.topbarNav).first();
      await expectVisible(nav, { msg: 'nav[aria-label="WeWrite 导航"] 未出现' });
      const navButtons = nav.locator('button');
      assert.equal(await navButtons.count(), 3, '导航 tab 数应为 3（写作/选题/定时），AC-1');
      for (const word of ['写作', '选题', '定时']) {
        assert.ok(
          (await nav.getByText(word, { exact: false }).count()) > 0,
          `导航内未找到「${word}」文本`,
        );
      }

      const gear = page.locator(LOC.settingsGear).first();
      await expectVisible(gear, { msg: '设置齿轮 [data-testid=ww-topbar-settings] 未出现' });
      assert.equal(
        await gear.getAttribute('aria-label'),
        '设置',
        '设置齿轮 aria-label 应为「设置」（icon-only 语义）',
      );

      assert.equal(
        await page.locator(TAB.home).first().getAttribute('aria-current'),
        'page',
        '默认视图写作 tab 应 aria-current=page',
      );

      // 高度 ≤40px（AC-1；--ww-toolrow-h）
      const box = await topbar.boundingBox();
      assert.ok(box && box.height <= 40.5, `顶栏高 ${box?.height}px，应 ≤40px（AC-1）`);

      // 负向：旧 5 Tab 的文章库入口不存在（导航对象恰 4 个）
      await expectAbsent(nav.getByText('文章库'), '导航内不应再出现「文章库」（5 Tab 已退役）');
      await expectAbsent(page.locator('.ww-topic'), 'TopicPanel（.ww-topic）已退役不应渲染');
    },
  },
  {
    id: 'A02',
    group: 'A 导航',
    phase: 'fresh',
    // 前置：A01。
    // 步骤：逐个点 4 个导航对象（写作→选题→定时→设置→回写作）。
    // 断言：每次点击 aria-current=page 跟随；对应面板容器出现；内容区常在不白屏。
    fn: async (page) => {
      const cases = [
        ['home', LOC.workbench, '写作工作区'],
        ['hotspots', '.ww-hotspots', '选题中心'],
        ['schedule', '.ww-schedule', '定时任务'],
      ];
      for (const [key, sel, name] of cases) {
        const btn = await clickTab(page, key);
        assert.equal(await btn.getAttribute('aria-current'), 'page', `${name} aria-current 应跟随`);
        await expectVisible(page.locator(sel).first(), { msg: `切到${name}后容器 ${sel} 未出现` });
        await expectVisible(page.locator(LOC.content).first(), { msg: `${name} 下 #wewrite-panel-content 消失` });
      }
      // 设置齿轮（第 4 个导航对象，aria-current 同语义）
      const gear = page.locator(LOC.settingsGear).first();
      await gear.click();
      await expectVisible(page.locator(LOC.settingsNav).first(), { msg: '齿轮进设置后 nav[aria-label=设置分组] 未出现' });
      assert.equal(await gear.getAttribute('aria-current'), 'page', '设置齿轮激活态应 aria-current=page');
      // 回写作（收尾自足）
      await clickTab(page, 'home');
      await expectVisible(page.locator(LOC.workbench).first(), { msg: '回写作后工作区未出现' });
    },
  },
  {
    id: 'A03',
    group: 'A 导航',
    phase: 'fresh',
    // 前置：fresh。蓝本 A03（文章库下钻/返回）在新 IA 退役——本条重锚为
    // 「旧 /articles 路由语义已被 home 工作区吸收」的可观察等价断言。
    // 限制说明：面板路由是 React state（无 URL、不落 localStorage），navigate('articles')
    // 一律重写为 home 属纯函数逻辑（vitest 边界）；E2E 断言其 UI 投影面。
    // 步骤：检查 home 视图结构。
    // 断言：home 即「列表+主区」工作区（rail 即文章列表）；旧文章库表格/返回按钮不渲染。
    fn: async (page) => {
      await clickTab(page, 'home');
      await expectVisible(page.locator(LOC.workbench).first(), { msg: 'home 应渲染 .ww-workbench' });
      await expectVisible(page.locator(LOC.rail).first(), { msg: 'home 应渲染左栏 .ww-rail（文章列表并入工作区）' });
      // 负向：旧文章库表格与编辑器「返回文章库」箭头均退役
      await expectAbsent(page.locator('.ww-articles'), '旧文章库面板容器不应渲染（/articles 重定向 home）');
      await expectAbsent(page.getByRole('button', { name: /返回文章库/ }), '「返回文章库」按钮应退役（列表常驻左栏）');
      await expectPresent(page.locator(LOC.railList), '.ww-rail__list 应存在（列表语义落地）');
    },
  },
  {
    id: 'A04',
    group: 'A 导航',
    phase: 'fresh',
    // 前置：fresh（空库）。窄态断点 <900（App NARROW_BREAKPOINT）。
    // 步骤：viewport 860 → 观察 → 恢复 1440。
    // 断言：AC-3 —— 窄态左栏退化为顶部下拉（ww-rail-select），空态主区启动卡不消失；
    //       恢复宽态后 rail 回归。
    // 视口卫生：压窄操作包 try/finally，finally 无条件恢复 1440x900——E2E 首轮教训：
    // 断言失败时 viewport 停在 860，同一 page 贯穿后续相位，窄态级联毒死 10+ 用例。
    fn: async (page) => {
      await clickTab(page, 'home');
      await expectVisible(page.locator(LOC.rail).first(), { msg: '宽态下 .ww-rail 应可见' });
      try {
        await page.setViewportSize({ width: 860, height: 900 });
        await expectNotVisible(page.locator(LOC.rail), { msg: '窄态下 .ww-rail 应整体退化为下拉' });
        await expectVisible(page.locator('[data-testid="ww-rail-select"]').first(), {
          timeout: 6000,
          msg: '窄态下 button.ww-rail-select（顶部下拉）未出现（AC-3）',
        });
        await expectVisible(page.locator(LOC.startup).first(), { msg: '窄态空库主区启动卡不应消失' });
      } finally {
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      await expectVisible(page.locator(LOC.rail).first(), { timeout: 6000, msg: '恢复宽态后 .ww-rail 应回归' });
    },
  },
  {
    id: 'A05',
    group: 'A 导航',
    phase: 'fresh',
    // 前置：fresh（storage 重置保证 wechatAppId 空 → 连接徽标=未配置态，确定性）。
    // 注意：凭据 secret 是宿主全局态，本条只依赖 appId 空（两态皆成立）。
    // 步骤：读顶栏连接徽标 → 点击。
    // 断言：aria-label 含「公众号未配置」；点击进设置页。
    fn: async (page) => {
      const conn = page.locator(LOC.conn).first();
      await expectVisible(conn, { msg: '顶栏连接徽标 [data-testid=ww-topbar-conn] 未出现' });
      const label = await conn.getAttribute('aria-label');
      assert.ok(label?.includes('公众号未配置'), `连接徽标 aria-label 应含「公众号未配置」，实际：${label}`);
      await conn.click();
      await expectVisible(page.locator(LOC.settingsNav).first(), { msg: '点徽标应进设置（nav[aria-label=设置分组]）' });
      await clickTab(page, 'home');
    },
  },
];
