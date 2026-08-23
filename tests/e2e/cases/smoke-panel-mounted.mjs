/**
 * 冒烟用例样板：WeWrite 面板挂载。
 * 锚点为 v0.1 旧 DOM（.dsh-wewrite-panel / #wewrite-panel-content），v0.2 UI 重构
 * 后由 QA 按新 IA 重锚全量用例——新用例请照本文件格式写：
 *   export default { id, group, phase: 'fresh' | 'demo' | 'live', fn: async (page, ctx) => {} }
 * ctx = { BASE, sleep, domIs, openPanel }（tests/e2e/session.mjs）。
 */
export default {
  id: 'smoke-panel-mounted',
  group: 'smoke',
  phase: 'fresh',
  fn: async (page, ctx) => {
    // 相位开始时 runner 已调用 openPanel 完成穿越，这里直接断言终点锚点
    const panel = page.locator('.dsh-wewrite-panel').first();
    if (!(await ctx.domIs(panel, { timeout: 5000 }))) {
      throw new Error('.dsh-wewrite-panel 未挂载');
    }
    const content = page.locator('#wewrite-panel-content').first();
    if (!(await ctx.domIs(content, { timeout: 5000 }))) {
      throw new Error('#wewrite-panel-content 未出现');
    }
  },
};
