import { describe, expect, it, vi } from 'vitest';
import type { PushDraftResult } from '@/shared/contract';
import { pushOutcomeToToast, WECHAT_MP_HOME } from '@/client/lib/push-outcome';

/**
 * pushOutcomeToToast 分支覆盖（文案契约测试，断言写死中文，防止再漂回不实承诺）：
 * - 成功 = 进草稿箱：必须带「去公众号后台」外链，不得宣告发布完成；
 * - 失败：settingsTarget 决定给不给出口，proxy 单独叫「去设置代理」；跳转由调用方注入。
 */

const SUCCESS: PushDraftResult = { ok: true, mediaId: 'media-1', thumbMediaId: 'thumb-1' };

function failure(partial: Partial<Extract<PushDraftResult, { ok: false }>['failure']>): PushDraftResult {
  return {
    ok: false,
    failure: { reason: 'wechat-api', message: '出口 IP 不在白名单', ...partial },
  };
}

describe('pushOutcomeToToast：成功分支', () => {
  it('成功给外链与「去公众号后台」，动作留给 Toast 的 openUrl 处理', () => {
    const outcome = pushOutcomeToToast(SUCCESS);
    expect(outcome.kind).toBe('success');
    expect(outcome.title).toBe('已进草稿箱');
    expect(outcome.detail).toBe('到公众号后台检查排版与封面，群发在后台手动执行');
    expect(outcome.openUrl).toBe(WECHAT_MP_HOME);
    expect(WECHAT_MP_HOME).toBe('https://mp.weixin.qq.com/');
    expect(outcome.actionLabel).toBe('去公众号后台');
    expect(outcome.onAction).toBeUndefined();
  });

  it('即使调用方传了 navigate，成功也不给设置跳转', () => {
    const outcome = pushOutcomeToToast(SUCCESS, { navigate: vi.fn() });
    expect(outcome.onAction).toBeUndefined();
    expect(outcome.actionLabel).toBe('去公众号后台');
  });
});

describe('pushOutcomeToToast：失败分支', () => {
  it('proxy → 「去设置代理」，onAction 即注入的 navigate', () => {
    const navigate = vi.fn();
    const outcome = pushOutcomeToToast(failure({ settingsTarget: 'proxy' }), { navigate });
    expect(outcome.kind).toBe('error');
    expect(outcome.title).toBe('出口 IP 不在白名单');
    expect(outcome.actionLabel).toBe('去设置代理');
    outcome.onAction?.();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(outcome.openUrl).toBeUndefined();
  });

  it('wechat / image → 「去设置」', () => {
    const navigate = vi.fn();
    for (const settingsTarget of ['wechat', 'image'] as const) {
      const outcome = pushOutcomeToToast(failure({ settingsTarget }), { navigate });
      expect(outcome.actionLabel).toBe('去设置');
      expect(outcome.onAction).toBe(navigate);
    }
  });

  it('title/detail 取 failure.message/hint，无 settingsTarget 时不给动作', () => {
    const outcome = pushOutcomeToToast(failure({ message: '门禁未通过', hint: '先在质量门禁里处理问题' }));
    expect(outcome.title).toBe('门禁未通过');
    expect(outcome.detail).toBe('先在质量门禁里处理问题');
    expect(outcome.actionLabel).toBeUndefined();
    expect(outcome.onAction).toBeUndefined();
  });

  it('failure 无 hint 时 detail 缺省', () => {
    const outcome = pushOutcomeToToast(failure({ hint: undefined }));
    expect(outcome.detail).toBeUndefined();
  });

  it('有 settingsTarget 但调用方没传 navigate：不给按钮（Toast 无 onAction 不渲染）', () => {
    const outcome = pushOutcomeToToast(failure({ settingsTarget: 'wechat' }));
    expect(outcome.actionLabel).toBeUndefined();
    expect(outcome.onAction).toBeUndefined();
  });
});

describe('pushOutcomeToToast：分类级出口（经 describePushFailure 收敛）', () => {
  it('48001/PERMISSION：出路在后台认证 → 给「去公众号后台」外链，不给设置按钮', () => {
    const outcome = pushOutcomeToToast(
      failure({
        message: '微信 API 错误 48001：api unauthorized',
        errcode: 48001,
        classification: 'PERMISSION',
        hint: '你的公众号类型没有草稿箱权限',
      }),
      { navigate: vi.fn() },
    );
    expect(outcome.title).toBe('公众号没有草稿箱权限。');
    expect(outcome.detail).toBe('你的公众号类型没有草稿箱权限');
    expect(outcome.actionLabel).toBe('去公众号后台');
    expect(outcome.openUrl).toBe(WECHAT_MP_HOME);
    expect(outcome.onAction).toBeUndefined();
  });

  it('IP_WHITELIST + settingsTarget=proxy：应用内自救优先（设置按钮），不给外链', () => {
    const navigate = vi.fn();
    const outcome = pushOutcomeToToast(
      failure({
        message: '微信 API 错误 40164：invalid ip 1.2.3.4',
        errcode: 40164,
        classification: 'IP_WHITELIST',
        hint: '把出口 IP 加入白名单，或配置代理',
        egressIp: '1.2.3.4',
        settingsTarget: 'proxy',
      }),
      { navigate },
    );
    expect(outcome.title).toBe('出口 IP 1.2.3.4 不在白名单。');
    expect(outcome.actionLabel).toBe('去设置代理');
    expect(outcome.onAction).toBe(navigate);
    expect(outcome.openUrl).toBeUndefined();
  });

  it('分类级 reason（cover-missing）不再透传宿主原话，统一走收敛文案', () => {
    const outcome = pushOutcomeToToast(
      { ok: false, failure: { reason: 'cover-missing', message: '缺少封面图：微信草稿必须带封面。', hint: '在编辑器补封面' } },
      { navigate: vi.fn() },
    );
    expect(outcome.title).toBe('缺封面：微信草稿必须带封面。');
    expect(outcome.detail).toBe('在编辑器补封面');
  });
});
