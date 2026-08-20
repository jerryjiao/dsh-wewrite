/**
 * E 组 编辑器三视图 + 门禁面板（9 条，demo）——蓝本 §2.4 E01-E07 重锚 + E08/E09 新增。
 * 重锚要点：三视图 = 仅编辑/双栏/仅预览（ww-view-tab-{edit|split|preview}，宽态默认 split）；
 * 门禁 = 右侧滑出 GateOverlayPanel（ww-gate-overlay，role=dialog aria-modal=false），
 * 入口 = StatusStrip 门禁 chip（ww-gate-chip）+ rail 门禁标记（AC-4）；
 * 原「门禁报告」视图 Tab 退役。
 * E02 会向种子文章追加一行文本（demo storage 内，相位结束恢复，无泄漏）。
 */
import {
  assert,
  expectAbsent,
  expectTextContains,
  expectVisible,
  gotoWorkbench,
  LOC,
  pollUntil,
  setEditorView,
} from '../lib.mjs';

const DEMO_ROW = '[data-testid="ww-rail-row-art_demo_20260819"]';

/**
 * 打开种子文章进编辑器。{view} 可选前置三视图（用例自足：视图持久化
 * localStorage['ww.editor.view']，不依赖上一用例尾态——依赖 cm 的用例传
 * 'split'，依赖预览的传 'preview'，不传保持当前视图）。
 */
async function openDemoArticle(page, { view } = {}) {
  await gotoWorkbench(page);
  await page.locator(DEMO_ROW).first().click();
  await expectVisible(page.locator('.ww-editor-head').first(), { timeout: 10000, msg: '编辑器未打开' });
  if (view) await setEditorView(page, view);
}

export default [
  {
    id: 'E01',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：demo（D05 打开编辑器；本条自足重开）。
    // 步骤：读三视图分段并逐个切换。
    // 断言：3 个 role=tab（仅编辑/双栏/仅预览）；宽态默认 split（aria-selected）；
    //       切换跟随；无第 4 个（门禁）tab（负向——视图模型重定义）。
    fn: async (page) => {
      await openDemoArticle(page);
      const tabs = page.locator(LOC.viewTabs).first();
      await expectVisible(tabs, { msg: '.ww-view-tabs[aria-label=编辑器视图] 未出现' });
      assert.equal(await tabs.getByRole('tab').count(), 3, '三视图应恰 3 个 tab（AC-7）');

      const split = page.locator('[data-testid="ww-view-tab-split"]').first();
      const edit = page.locator('[data-testid="ww-view-tab-edit"]').first();
      const preview = page.locator('[data-testid="ww-view-tab-preview"]').first();
      assert.equal(await split.getAttribute('aria-selected'), 'true', '宽态默认应为双栏 split');
      await edit.click();
      assert.equal(await edit.getAttribute('aria-selected'), 'true', '切「仅编辑」后 aria-selected=true');
      assert.equal(await split.getAttribute('aria-selected'), 'false', 'split 应让位');
      await preview.click();
      assert.equal(await preview.getAttribute('aria-selected'), 'true', '切「仅预览」后 aria-selected=true');
      assert.equal(
        await tabs.getByRole('tab', { name: /门禁/ }).count(),
        0,
        '「门禁报告」视图 tab 应退役（负向——门禁去独立面板）',
      );
      // 收尾复位 split（用例自足：视图持久化 localStorage，尾停在 preview 会串扰
      // 后续依赖编辑器的用例——二轮 E02/E07 挂因），split=宽态默认不留痕
      await setEditorView(page, 'split');
    },
  },
  {
    id: 'E02',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：demo。自动保存（AUTOSAVE_DEBOUNCE 1200ms + article/save 落库）。
    // 步骤：追加一行 → 等 StatusStrip 已自动保存 → 重新穿越 → 校验文本仍在。
    // 断言：保存态反馈出现；重进后追加文本仍在（真落库回读）。
    // 视图自足：显式前置 split（cm 需编辑视图；重进后持久化仍 split，cm 常在）。
    fn: async (page, ctx) => {
      await openDemoArticle(page, { view: 'split' });
      const marker = 'E2E 自动保存校验行';
      const cm = page.locator('.cm-content').first();
      await expectVisible(cm, { timeout: 8000, msg: 'CodeMirror 内容区 .cm-content 未出现' });
      await cm.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.insertText(`\n${marker}\n`);
      await expectVisible(page.locator('.ww-statusstrip').getByText('已自动保存').first(), {
        timeout: 10000,
        msg: '追加文本后 StatusStrip 应出现「已自动保存」',
      });
      await ctx.openPanel(page); // 重进（route 回 home → 最近编辑一篇=种子文章）
      await expectVisible(page.locator('.cm-content').first(), { timeout: 10000, msg: '重进后编辑器未载入' });
      const text = await page.locator('.cm-content').first().innerText();
      assert.ok(text.includes(marker), `重进后追加文本应仍在（article/save 落库，实际尾部：「${text.slice(-60)}」）`);
    },
  },
  {
    id: 'E03',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：E01/E02 后。视图自足：显式前置 preview（不依赖上一用例尾态——
    // 二轮「序列内状态串扰」挂因；独立探针渲染正常，属用例侧状态依赖缺陷）。
    // 步骤：切「仅预览」。
    // 断言：预览画布出现且内含渲染 HTML（内联 style + 正文非空——article/preview 真产物）。
    fn: async (page) => {
      await openDemoArticle(page, { view: 'preview' });
      const preview = page.locator('.ww-preview').first();
      await expectVisible(preview, { timeout: 8000, msg: '「微信预览画布」容器未出现' });
      assert.equal(await preview.getAttribute('aria-label'), '微信预览画布', '预览画布 aria-label 语义');
      await pollUntil(
        async () => {
          const rendering = await page.locator('.ww-preview__rendering').count();
          return rendering === 0;
        },
        { timeout: 10000, msg: '预览渲染未完成（渲染中…未消失）' },
      );
      const html = await page.locator('.ww-preview__content').first().evaluate((el) => el.innerHTML);
      assert.ok(html.includes('style='), '预览产物应含内联 style（真实排版 HTML）');
      const text = await page.locator('.ww-preview__content').first().innerText();
      // 诊断增强：失败消息带实际正文前 60 字，再挂时可直接定位内容是什么
      assert.ok(
        text.trim().length > 50,
        `预览正文应非空（实际 ${text.trim().length} 字，前 60 字：「${text.trim().slice(0, 60)}」）`,
      );
    },
  },
  {
    id: 'E04',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：demo（种子 run succeeded → 门禁=已过）。
    // 步骤：点 StatusStrip 门禁 chip → 观察 → 关闭。
    // 断言：GateOverlayPanel 滑出（role=dialog aria-label=门禁报告）+ 头部文案 + 关闭钮可用。
    fn: async (page) => {
      await openDemoArticle(page);
      const chip = page.locator(LOC.gateChip).first();
      await expectVisible(chip, { timeout: 6000, msg: 'StatusStrip 门禁 chip（ww-gate-chip）未出现——门禁面板唯一常驻入口' });
      await chip.click();
      const overlay = page.locator(LOC.gateOverlay).first();
      await expectVisible(overlay, { timeout: 6000, msg: '点 chip 后 GateOverlayPanel 未滑出' });
      assert.equal(await overlay.getAttribute('role'), 'dialog', '门禁面板应为 dialog（右侧覆盖层）');
      await expectTextContains(overlay, '门禁报告', '面板头部应含「门禁报告」');
      const close = page.locator('[data-testid="ww-gate-overlay-close"]').first();
      await expectVisible(close, { msg: '门禁面板关闭钮未出现' });
      await close.click();
      await pollUntil(
        async () => (await page.locator(LOC.gateOverlay).count()) === 0,
        { timeout: 4000, msg: '点关闭后门禁面板应滑出消失' },
      );
    },
  },
  {
    id: 'E05',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：demo。appid 为空（fresh 重置）或 G02 写入的假 AppID wx-test-e2e——
    // 两态下 pushDraft 均在凭据/token 处确定性失败（假 appid 必然 40013 类错误，
    // 不可能推入真实草稿箱；不写 secret、不假设宿主全局凭据，蓝本 E05 说明延续）。
    // 步骤：推草稿箱菜单 → 推草稿箱。
    // 断言：error toast 出现；无 success toast（负向）；无 mediaId 回填语义。
    fn: async (page) => {
      await openDemoArticle(page);
      const trigger = page.locator('.ww-editor-head .ww-menu-trigger, .ww-editor-head button').filter({
        hasText: '推草稿箱',
      }).first();
      await expectVisible(trigger, { timeout: 6000, msg: '编辑器页头「推草稿箱」CTA 未出现' });
      await trigger.click();
      const item = page.getByRole('menuitem').filter({ hasText: '推草稿箱' }).first();
      if (await item.count()) {
        await item.click();
      } else {
        await trigger.click(); // 主 CTA 直推形态（无下拉）时二次点击即触发
      }
      await expectVisible(page.locator('.ww-toast--error').first(), {
        timeout: 12000,
        msg: 'appid 空时推草稿箱应失败（error toast）',
      });
      assert.equal(await page.locator('.ww-toast--success').count(), 0, '失败路径不应出现 success toast（负向）');
      await expectAbsent(page.getByText(/mediaId/i), '不应出现 mediaId 回填语义');
    },
  },
  {
    id: 'E06',
    group: 'E 编辑器',
    phase: 'demo',
    // 【依赖种子缺失，需补种】蓝本 E06 需要一篇 gates-failed 文章：
    //   补种 art_demo_gatefail_20260819（status 随意，lastRunId 指向
    //   run_demo_gatefail_20260819：status=failed，error={code:'gate-failed',...}）——
    //   seed-demo-data.mjs / session.mjs seedDemo() 均未包含，见回传缺口清单。
    // 前置：补种后。AC-4：门禁未过行点击直达门禁面板 + 推送被阻断。
    // 步骤：点 gate-fail 行（应自动展开门禁面板）→ 关闭 → 推草稿箱。
    // 断言：点击行直达并自动展开 GateOverlayPanel；推送时出现「门禁未过」阻断 Modal
    //       （继续修改/仍然推送）；无 success toast。
    fn: async (page) => {
      await gotoWorkbench(page);
      const row = page.locator('[data-testid="ww-rail-row-art_demo_gatefail_20260819"]').first();
      await expectVisible(row, { timeout: 8000, msg: '【依赖补种】gate-failed 种子行未出现' });
      const gateBadge = row.locator('.ww-rail-btn__gate').first();
      await expectVisible(gateBadge, { msg: '门禁未过行应渲染红色门禁标记（AC-4）' });
      await gateBadge.click();
      await expectVisible(page.locator(LOC.gateOverlay).first(), {
        timeout: 6000,
        msg: '点门禁标记应直达并自动展开门禁面板（AC-4）',
      });
      await expectTextContains(page.locator(LOC.gateOverlay).first(), '门禁报告', '门禁面板头部文案');
      await page.locator('[data-testid="ww-gate-overlay-close"]').first().click();
      await pollUntil(
        async () => (await page.locator(LOC.gateOverlay).count()) === 0,
        { timeout: 4000, msg: '门禁面板应可关闭' },
      );
      const push = page.locator('.ww-editor-head .ww-menu-trigger, .ww-editor-head button').filter({
        hasText: '推草稿箱',
      }).first();
      await push.click();
      const item = page.getByRole('menuitem').filter({ hasText: '推草稿箱' }).first();
      if (await item.count()) await item.click();
      await expectVisible(page.getByText('门禁未过').first(), {
        timeout: 8000,
        msg: '门禁未过文章推草稿箱应弹阻断 Modal',
      });
      await expectVisible(page.getByRole('button', { name: '继续修改' }).first(), { msg: '阻断 Modal 应提供「继续修改」' });
      await expectVisible(page.getByRole('button', { name: '仍然推送' }).first(), { msg: '阻断 Modal 应提供显式「仍然推送」' });
      assert.equal(await page.locator('.ww-toast--success').count(), 0, '阻断路径不应有 success toast（负向）');
      await page.getByRole('button', { name: '继续修改' }).first().click();
    },
  },
  {
    id: 'E07',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：E04（门禁面板可开）。视图自足：显式前置 split（断言依赖 cm-content
    // 在 DOM 且 contenteditable——上一用例尾停 preview 时编辑器不渲染，二轮挂因）。
    // 步骤：开门禁面板 → 验证非模态 → Esc 关闭。
    // 断言：aria-modal=false（非模态契约）；面板开着时编辑器仍可输入（contenteditable 语义在）；
    //       Esc 后面板消失。
    fn: async (page) => {
      await openDemoArticle(page, { view: 'split' });
      await page.locator(LOC.gateChip).first().click();
      const overlay = page.locator(LOC.gateOverlay).first();
      await expectVisible(overlay, { timeout: 6000, msg: '门禁面板未打开' });
      assert.equal(await overlay.getAttribute('aria-modal'), 'false', '门禁面板应非模态（aria-modal=false，总监裁决）');
      const cm = page.locator('.cm-content').first();
      assert.equal(await cm.count() > 0, true, '面板打开时编辑器 DOM 应仍在（非覆盖模态）');
      assert.equal(await cm.getAttribute('contenteditable'), 'true', '面板打开时编辑器应仍可输入（检查报告非编辑视图）');
      await page.keyboard.press('Escape');
      await pollUntil(
        async () => (await page.locator(LOC.gateOverlay).count()) === 0,
        { timeout: 4000, msg: 'Esc 应关闭门禁面板' },
      );
    },
  },
  {
    id: 'E08',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：E01。新增（AC-7：预览缩放=视觉变换，载荷字节不变 + 视图选择持久化）。
    // 步骤：切仅编辑（持久化校验）→ 切仅预览 → 缩放 75% → 对比画布正文。
    // 断言：localStorage['ww.editor.view'] 写入；缩放后画布为 transform 缩放（视觉变换）
    //       且 .ww-preview__content innerText 长度不变（载荷等价断言）。
    fn: async (page) => {
      await openDemoArticle(page);
      await page.locator('[data-testid="ww-view-tab-edit"]').first().click();
      const savedView = await page.evaluate(() => window.localStorage.getItem('ww.editor.view'));
      assert.equal(savedView, 'edit', '手选视图应持久化到 localStorage[ww.editor.view]');

      await page.locator('[data-testid="ww-view-tab-preview"]').first().click();
      await pollUntil(
        async () => (await page.locator('.ww-preview__rendering').count()) === 0,
        { timeout: 10000, msg: '预览未就绪' },
      );
      const content = page.locator('.ww-preview__content').first();
      const before = (await content.innerText()).length;

      // 缩放控件 = 预览栏右端 Menu 触发器（button.ww-preview__zoom，aria-label「预览缩放」，
      // 显示当前档）——档位 100/90/75% 是 menuitem，非 bar 内直按钮（旧锚
      // filter hasText '75' 在默认档 100% 下匹配不到任何按钮）；transform 应用在
      // .ww-preview__canvas（非 frame，frame 恒无 transform）
      const zoomTrigger = page.locator('.ww-preview__zoom').first();
      await expectVisible(zoomTrigger, { timeout: 4000, msg: '预览栏缩放控件（.ww-preview__zoom）未出现' });
      await zoomTrigger.click();
      await page.getByRole('menuitem', { name: '75%', exact: true }).first().click();
      await pollUntil(
        async () => (await page.locator('.ww-preview__zoom-value').first().innerText()) === '75%',
        { timeout: 4000, msg: '选 75% 档后缩放触发器应显示 75%' },
      );
      const transform = await page.locator('.ww-preview__canvas').first().evaluate(
        (el) => getComputedStyle(el).transform,
      );
      assert.ok(transform !== 'none', '缩放应为视觉 transform 变换（.ww-preview__canvas scale，非重新渲染）');
      const after = (await content.innerText()).length;
      assert.equal(after, before, `缩放后正文载荷应不变（前 ${before} / 后 ${after}，AC-7）`);
    },
  },
  {
    id: 'E09',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：E01。新增（AC-7：分栏可拖拽 + 双击复位）。
    // 步骤：回双栏 → 拖分栏线 → 双击复位。
    // 断言：splitter 存在；拖拽后编辑栏宽度变化；双击后回到初始宽度（容差 30px）。
    // 拖拽点选择（三轮探针实锤）：splitter 会被长文撑高（实测 1392px > 视口 900），
    // 几何中心 y 落在宿主底部 composer 遮挡带（视口底部 ~96px，契约 §1-2 兜底带）——
    // pointer 事件被宿主层截获（target=React root），拖拽完全无效。取 splitter 顶部
    // 下方 40px 作拖拽/双击点位，避开顶栏与底部遮挡带。
    fn: async (page) => {
      await openDemoArticle(page);
      await page.locator('[data-testid="ww-view-tab-split"]').first().click();
      const splitter = page.locator('.ww-splitter').first();
      await expectVisible(splitter, { timeout: 6000, msg: 'split 态分栏线 ww-splitter 未出现（AC-7）' });
      const editorPane = page.locator('.ww-editor').first();
      const w0 = (await editorPane.boundingBox())?.width ?? 0;

      const sb = await splitter.boundingBox();
      assert.ok(sb, '分栏线应有几何位置');
      const safeY = sb.y + 40; // 遮开底部 composer 遮挡带的确定性安全点位
      await page.mouse.move(sb.x + sb.width / 2, safeY);
      await page.mouse.down();
      await page.mouse.move(sb.x + 220, safeY, { steps: 8 });
      await page.mouse.up();
      const w1 = (await editorPane.boundingBox())?.width ?? 0;
      assert.ok(Math.abs(w1 - w0) > 30, `拖拽后编辑栏宽度应明显变化（${w0} → ${w1}）`);

      await splitter.dblclick({ position: { x: sb.width / 2, y: 40 } });
      await page.waitForTimeout(300);
      const w2 = (await editorPane.boundingBox())?.width ?? 0;
      assert.ok(Math.abs(w2 - w0) <= 30, `双击应复位分栏比例（复位后 ${w2}，初始 ${w0}）`);
    },
  },
  {
    id: 'E10',
    group: 'E 编辑器',
    phase: 'demo',
    // 前置：E01。新增（v0.3 R3：AI 改写选中即改入口）。
    // 步骤：split 视图 → 点进 cm → ControlOrMeta+Home 到文首 → Shift+End 选中首行 →
    //       「AI 改写」chip 浮现（--shown）→ 点开 popover → 4 快捷 chip 可见 → 取消。
    // 断言：chip 挂载并浮现；popover role=dialog；快捷 chip 4 枚在位；取消后 popover 关闭。
    // 不跑真 LLM（取消路径不触 article/rewrite；真生成由总监浏览器人工验）。
    // 注：chip 显隐走 opacity 过渡（Playwright visible 不看 opacity），断言锚 --shown class。
    fn: async (page) => {
      await openDemoArticle(page, { view: 'split' });
      const cm = page.locator('.cm-content').first();
      await expectVisible(cm, { timeout: 8000, msg: 'CodeMirror 内容区 .cm-content 未出现' });
      await cm.click();
      await page.keyboard.press('ControlOrMeta+ArrowUp'); // CM standardKeymap Mod-ArrowUp → cursorDocStart
      await page.keyboard.press('Shift+End');
      const chip = page.locator('[data-testid="ww-rewrite-chip"]').first();
      await expectVisible(chip, { timeout: 4000, msg: '非空选区后「AI 改写」chip 未挂载' });
      await pollUntil(
        async () => ((await chip.getAttribute('class')) ?? '').includes('ww-rewrite-chip--shown'),
        { timeout: 4000, msg: 'chip 未浮现（--shown class 未挂）' },
      );
      await chip.click();
      const popover = page.locator('[data-testid="ww-rewrite-popover"]').first();
      await expectVisible(popover, { timeout: 4000, msg: '点 chip 后改写 popover 未打开' });
      assert.equal(await popover.getAttribute('role'), 'dialog', '改写 popover 应为 dialog');
      assert.equal(await popover.getAttribute('aria-label'), 'AI 改写', 'popover aria-label 语义');
      for (const quickId of ['colloquial', 'condense', 'expand', 'data']) {
        await expectVisible(page.locator(`[data-testid="ww-rewrite-quick-${quickId}"]`).first(), {
          timeout: 3000,
          msg: `快捷 chip（ww-rewrite-quick-${quickId}）未出现`,
        });
      }
      await expectVisible(page.locator('[data-testid="ww-rewrite-input"]').first(), {
        msg: '指令输入框未出现',
      });
      await page.locator('[data-testid="ww-rewrite-cancel"]').first().click();
      await pollUntil(
        async () => (await page.locator('[data-testid="ww-rewrite-popover"]').count()) === 0,
        { timeout: 4000, msg: '取消后改写 popover 应关闭' },
      );
      // 取消后选区保留（只关面板不动文本）：chip 可再浮现
      await pollUntil(
        async () => ((await chip.getAttribute('class')) ?? '').includes('ww-rewrite-chip--shown'),
        { timeout: 4000, msg: '取消后选区仍在，chip 应回归浮现' },
      );
    },
  },
];
