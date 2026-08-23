/**
 * I 组 异常态（3 条）——蓝本 §2.4 I01-I03 校对重锚。
 * 相位分配：I01 fresh（storage 本就是重置态，杀宿主无数据风险）；I02 fresh；
 * I03 live 末尾（蓝本原位——打断恢复需要真跑 + 宿主生命周期）。
 *
 * I02 自包含 mini 相位说明：runner 相位内按文件序执行，group-i 排在 group-g 之后——
 * fresh 相位跑 I02 时 G05 已把 llmDefault 配成 glm-4.7-flash，「未配模型」路径不可达。
 * 故 I02 在 fn 内自带：停宿主 → 清 llmDefault → 起宿主 → 测 → 停宿主 → 原样还原 → 起宿主
 * （还原 G05 的配置，保住 demo/live 相位贯穿；读写形状对齐 session.mjs 的 unit 校验）。
 *
 * I03 的「已中断」断言：前端无通用 run 历史视图（定时历史只收 trigger=schedule），
 * 蓝本 UI 投影降级为 storage 断言（宿主启动 resumeInterrupted 扫描落盘后读文件=真相）。
 */
import {
  assert,
  expectVisible,
  gotoWorkbench,
  hostctl,
  LOC,
  readStorageRaw,
  STORAGE_PATH,
} from '../lib.mjs';
import { writeFileSync } from 'node:fs';

async function startRunFromRail(page, topic) {
  await gotoWorkbench(page);
  await page.locator('.ww-rail__new').first().click();
  await page.locator(LOC.railNewForm).first().waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('[data-testid="ww-rail-new-input"]').first().fill(topic);
  await page.locator('[data-testid="ww-rail-new-submit"]').first().click();
  await expectVisible(page.getByText(`正在生成《${topic}》`).first(), {
    timeout: 15000,
    msg: `提交后应出现生成 overlay（${topic}）`,
  });
}

export default [
  {
    id: 'I01',
    group: 'I 异常态',
    phase: 'fresh',
    // 前置：fresh（重置态，杀宿主无真实数据风险）。
    // 步骤：hostctl stop 杀宿主 → 观察页面 → hostctl start → 重新穿越。
    // 断言：断连后面板不白屏（面板根仍在 DOM、无未捕获导航崩溃）；
    //       重启 + 重进后 openPanel 重新可用（工作区恢复）。
    fn: async (page, ctx) => {
      hostctl('stop');
      await page.waitForTimeout(1500); // 等 RPC 轮询撞上断连（一次性等待，非断言轮询）
      const panelCount = await page.locator(LOC.panelRoot).count();
      assert.ok(panelCount > 0, '断连后面板根 .dsh-wewrite-panel 不应从 DOM 消失（不白屏）');
      const bodyText = await page.evaluate(() => document.body.innerText.length);
      assert.ok(bodyText > 0, '断连后页面不应变成空白文档');

      hostctl('start');
      await ctx.openPanel(page); // 重启后重新穿越
      await expectVisible(page.locator(LOC.workbench).first(), {
        timeout: 10000,
        msg: '重启+重进后工作区应恢复可用（I01 断连恢复，蓝本 restore 相位语义）',
      });
    },
  },
  {
    id: 'I02',
    group: 'I 异常态',
    phase: 'fresh',
    // 前置：fresh 末尾（G05 已配模型 → 本条自备清空/还原，见文件头说明；S12 文案锚点）。
    // 步骤：清 llmDefault → 起跑「未配模型失败路径」→ 观察 → 点重试 → 还原配置。
    // 断言：run 快速失败且失败信息含「模型服务未配置」；重试按钮可见可点且点击后再现失败
    //       （retryGeneration 路径）；无成功 toast（负向）。
    fn: async (page, ctx) => {
      hostctl('stop');
      const original = readStorageRaw();
      const unit = JSON.parse(original);
      unit.global.settings.llmDefault = {};
      writeFileSync(STORAGE_PATH, JSON.stringify(unit, null, 2), 'utf8');
      hostctl('start');
      await ctx.openPanel(page);

      await startRunFromRail(page, '未配模型失败路径');
      await expectVisible(page.locator('.ww-stage__error').first(), {
        timeout: 30000,
        msg: '未配模型时 run 应快速失败（错误区块出现）',
      });
      const errText = await page.locator('.ww-stage__error').first().innerText();
      assert.ok(
        errText.includes('模型服务未配置'),
        `失败信息应含「模型服务未配置」（S12 文案锚点，实际：「${errText.slice(0, 120)}」）`,
      );
      const retry = page.getByRole('button', { name: /重试本阶段/ }).first();
      await expectVisible(retry, { msg: '失败态应出现「重试本阶段」按钮' });
      assert.equal(await retry.isDisabled(), false, '重试按钮应可点');
      await retry.click();
      await expectVisible(page.locator('.ww-stage__error').first(), {
        timeout: 30000,
        msg: '重试后应再次失败（llmDefault 仍空——retryGeneration 路径闭环）',
      });
      assert.equal(await page.locator('.ww-toast--success').count(), 0, '失败路径不应有成功 toast（负向）');

      // 还原 G05 配置（保住 demo/live 相位贯穿），宿主恢复运行
      hostctl('stop');
      writeFileSync(STORAGE_PATH, original, 'utf8');
      hostctl('start');
    },
  },
  {
    id: 'I03',
    group: 'I 异常态',
    phase: 'live',
    // 前置：live 末尾（H05 后）。第三次真跑，outline 进行中杀宿主（AC-11 打断语义）。
    // 步骤：起跑「打断路径验证」→ 数秒后 stop → start → 读 storage → 重进面板。
    // 断言：该 run 状态=interrupted（宿主 resumeInterrupted 扫描）；
    //       无自动重派发（无新的 queued/running run）；
    //       重进面板可用（工作区渲染）。
    fn: async (page, ctx) => {
      const topic = '打断路径验证';
      await startRunFromRail(page, topic);
      await page.waitForTimeout(2500); // 让 run 进入 running（outline LLM 调用进行中）
      hostctl('stop');
      hostctl('start');
      await page.waitForTimeout(3000); // 等宿主启动扫描落盘（一次性等待）

      const unit = JSON.parse(readStorageRaw());
      const runs = Object.values(unit.tables.runs ?? {});
      // live 相位 storage 不重置——历史轮次的同 topic run 会残留（四轮实锤：
      // find 命中旧 run，把本轮 run 误判为重派发）。target 取 startedAt 最新的
      // 一条（=本轮打断的 run）；「无重派发」收敛为「不存在比 target 更新的
      // 同 topic run」（重启后新派发语义），历史旧 run 不算。
      const mine = runs
        .filter((r) => r?.paramsSnapshot?.topic === topic)
        .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
      const target = mine[0];
      assert.ok(target, '打断的 run 应已落库（paramsSnapshot.topic 定位）');
      assert.equal(target.status, 'interrupted', `run 状态应为 interrupted（实际 ${target.status}，AC-11 打断语义）`);
      const redispatched = mine.filter(
        (r) => r.id !== target.id && (r.startedAt ?? '') > (target.startedAt ?? ''),
      );
      assert.equal(redispatched.length, 0, '宿主重启后不应自动重派发（无比起打断 run 更新的新 run）');

      await ctx.openPanel(page);
      await expectVisible(page.locator(LOC.workbench).first(), {
        timeout: 10000,
        msg: '重启后重进面板应可用（打断不破坏面板）',
      });
    },
  },
];
