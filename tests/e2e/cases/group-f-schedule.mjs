/**
 * F 组 定时任务（6 条，demo）——蓝本 §2.4 F01-F06 校对重锚。
 * 沿用锚点（骨架不动）：.ww-schedule / .ww-view-tabs[aria-label="定时任务视图"] /
 * .ww-schedule-card（--paused）/ 表单 RRULE 预览 CodeChip / aria-label="删除定时 {name}"。
 * v0.2.1 P4：卡内可见 RRULE code 段已删（原文移入人话行 title attr），
 * F01/F04 的 RRULE 断言由 innerText 改读 title。
 * 蓝本 F03 原文「RRULE 填 NOTARRULE 被拒」不可行——现行 ScheduleForm 是结构化表单
 * （任务名 + 小时/分钟 + 重复/星期 pills，RRULE 由 buildRrule 生成，无法输入自由文本；
 * normalizeRrule 校验属 vitest 边界）。重锚为「任务名留空 → 创建 disabled」负向 +
 * RRULE 预览可见；F04 对应改为默认 9:30 daily 的产物断言。
 */
import {
  assert,
  clickTab,
  expectTextContains,
  expectVisible,
  pollUntil,
} from '../lib.mjs';

async function gotoSchedule(page) {
  await clickTab(page, 'schedule');
  await expectVisible(page.locator('.ww-schedule').first(), { timeout: 6000, msg: '.ww-schedule 未出现' });
}

export default [
  {
    id: 'F01',
    group: 'F 定时',
    phase: 'demo',
    // 前置：demo（种子排期 sched_demo_weekly，enabled=false）。
    // 步骤：进定时任务（默认「排队中」tab）。
    // 断言：种子卡渲染（名称/人话行 + RRULE 原文移入 title attr，v0.2.1 P4）；
    //       disabled 态（已暂停徽标+paused 类）；发布目标锁定文案。
    fn: async (page) => {
      await gotoSchedule(page);
      const card = page.locator('.ww-schedule-card').filter({ hasText: '每周三早七点选题快评' }).first();
      await expectVisible(card, { timeout: 8000, msg: '种子排期卡未渲染' });
      // P4：可见 RRULE code 段已删，原文改挂人话行 title（innerText 断言改读 attr）
      const human = card.locator('.ww-schedule-card__human').first();
      const humanTitle = await human.getAttribute('title');
      assert.ok(
        humanTitle?.includes('FREQ=WEEKLY;BYDAY=WE;BYHOUR=7;BYMINUTE=0'),
        `卡内人话行 title 应携带 RRULE 原文（实际：${humanTitle}）`,
      );
      await expectVisible(card.getByText(/每/).first(), { msg: '人类可读翻译行未出现' });
      await expectVisible(card.getByText('已暂停').first(), { msg: 'seed enabled=false 应显示已暂停徽标' });
      assert.ok(
        (await card.getAttribute('class'))?.includes('ww-schedule-card--paused'),
        'disabled 排期卡应有 --paused 类',
      );
      await expectTextContains(card, '发布目标：草稿箱（锁定）', '卡内应有发布目标锁定文案');
    },
  },
  {
    id: 'F02',
    group: 'F 定时',
    phase: 'demo',
    // 前置：F01。种子 run trigger=manual → 定时历史为空（边界态）。
    // 步骤：切「全部历史」tab。
    // 断言：tab 切换 aria-selected 跟随 + 内容区切换（历史空态文案出现）；切回排队中。
    fn: async (page) => {
      const history = page.locator('.ww-view-tabs[aria-label="定时任务视图"]').getByRole('tab', { name: /全部历史/ }).first();
      await expectVisible(history, { msg: '「全部历史」tab 未出现' });
      await history.click();
      assert.equal(await history.getAttribute('aria-selected'), 'true', '全部历史 tab 应激活');
      await expectVisible(page.getByText('还没有定时执行记录').first(), {
        timeout: 6000,
        msg: '无 schedule 触发 run 时应显示历史空态（边界）',
      });
      const queue = page.locator('.ww-view-tabs[aria-label="定时任务视图"]').getByRole('tab', { name: /排队中/ }).first();
      await queue.click();
      await expectVisible(page.locator('.ww-schedule-card').first(), { timeout: 6000, msg: '切回排队中队列卡应在' });
    },
  },
  {
    id: 'F03',
    group: 'F 定时',
    phase: 'demo',
    // 前置：F01。负向/边界（重锚说明见文件头）。
    // 步骤：「新建定时」→ 任务名留空 → 观察。
    // 断言：表单 Modal 打开；名称空时「创建定时」disabled；RRULE 预览（CodeChip）可见；取消关闭。
    fn: async (page) => {
      await page.getByRole('button', { name: /新建定时/ }).first().click();
      const form = page.getByText('定时到草稿箱').first();
      await expectVisible(form, { timeout: 6000, msg: '新建定时表单未打开' });
      const submit = page.getByRole('button', { name: /创建定时/ }).first();
      await expectVisible(submit, { msg: '创建按钮未出现' });
      assert.equal(await submit.isDisabled(), true, '任务名留空时创建应 disabled（负向）');
      await expectVisible(page.locator('.ww-rrule-preview code, .ww-rrule-preview .ww-chip, .ww-rrule-preview').first(), {
        timeout: 4000,
        msg: 'RRULE 预览应可见',
      });
      await page.getByRole('button', { name: /取消/ }).first().click();
      await pollUntil(
        async () => (await page.getByText('定时到草稿箱').count()) === 0,
        { timeout: 4000, msg: '取消后表单应关闭' },
      );
    },
  },
  {
    id: 'F04',
    group: 'F 定时',
    phase: 'demo',
    // 前置：F03。
    // 步骤：重新打开表单 → 填名 e2e-每日任务 → 创建。
    // 断言：表单关闭；新卡出现且 enabled（已排期徽标）；RRULE 原文（title attr）=默认 9:30 daily。
    fn: async (page) => {
      await page.getByRole('button', { name: /新建定时/ }).first().click();
      await page.getByLabel('任务名').first().fill('e2e-每日任务');
      await page.getByRole('button', { name: /创建定时/ }).first().click();
      await pollUntil(
        async () => (await page.getByText('定时到草稿箱').count()) === 0,
        { timeout: 6000, msg: '创建后表单应关闭' },
      );
      const card = page.locator('.ww-schedule-card').filter({ hasText: 'e2e-每日任务' }).first();
      await expectVisible(card, { timeout: 8000, msg: '新排期卡未出现在队列' });
      await expectVisible(card.getByText('已排期').first(), { msg: '新卡应 enabled（已排期徽标）' });
      // P4：RRULE 原文移入人话行 title attr
      const humanTitle = await card.locator('.ww-schedule-card__human').first().getAttribute('title');
      assert.ok(
        humanTitle?.includes('FREQ=DAILY;BYHOUR=9;BYMINUTE=30'),
        `新卡 RRULE 应为表单默认 9:30 daily 产物（title 实际：${humanTitle}）`,
      );
    },
  },
  {
    id: 'F05',
    group: 'F 定时',
    phase: 'demo',
    // 前置：F04（新卡 enabled）。
    // 步骤：点新卡「暂停」。
    // 断言：卡状态切换（--paused 类 + 已暂停徽标替换已排期）。
    fn: async (page) => {
      const card = page.locator('.ww-schedule-card').filter({ hasText: 'e2e-每日任务' }).first();
      await card.getByRole('button', { name: /暂停/ }).first().click();
      await pollUntil(
        async () => (await card.getByText('已暂停').count()) > 0,
        { timeout: 8000, msg: '暂停后应显示已暂停徽标' },
      );
      assert.ok(
        (await card.getAttribute('class'))?.includes('ww-schedule-card--paused'),
        '暂停后卡应有 --paused 类',
      );
      assert.equal(await card.getByText('已排期').count(), 0, '暂停后不应再显示已排期徽标');
    },
  },
  {
    id: 'F06',
    group: 'F 定时',
    phase: 'demo',
    // 前置：F05。
    // 步骤：删除新卡。
    // 断言：卡从队列消失；队列计数回到 1（仅剩种子卡）。
    // 锚点重锚：删除动作收在卡操作区「更多操作」菜单（schedule-panel.tsx：
    // button.ww-schedule-card__more aria-label「更多操作：{name}」→ Menu menuitem「删除」，
    // danger 态）——旧蓝本直按钮 aria-label「删除定时 {name}」已不存在；delta §1-8
    // 声明 schedule 页骨架不动（无独立 DOM 契约），按 src/client 现状锚定。
    fn: async (page) => {
      await page.getByRole('button', { name: '更多操作：e2e-每日任务' }).first().click();
      await page.getByRole('menuitem', { name: '删除', exact: true }).first().click();
      await pollUntil(
        async () => (await page.locator('.ww-schedule-card').filter({ hasText: 'e2e-每日任务' }).count()) === 0,
        { timeout: 8000, msg: '删除后卡应从队列消失' },
      );
      await expectVisible(
        page.locator('.ww-view-tabs[aria-label="定时任务视图"]').getByText(/排队中（1）/).first(),
        { timeout: 6000, msg: '删除后队列计数应为 1（仅剩种子卡）' },
      );
    },
  },
];
