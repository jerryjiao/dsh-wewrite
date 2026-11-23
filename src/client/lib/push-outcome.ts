import type { PushDraftResult } from '@/shared/contract';
import { zh } from './i18n';
import { describePushFailure } from './rpc';

/**
 * 推送结果 → Toast 文案映射（纯函数）：不持有 toast 实例、不做跳转，
 * 只把 PushDraftResult 翻译成「说什么 + 给什么出口」，调用点一行接入。
 *
 * 为什么单独一层：pushDraft 的失败以前靠 RPC 异常信封传，errcode/hint 中途全丢，
 * 各调用点文案各写各的；现在结果落在数据面（schema-base 的 discriminated union），
 * 文案与出口收敛在这里，避免再出现「推送成功=发布完成」这类与事实不符的话。
 *
 * 事实口径（本文件的硬约束）：
 * - 「推送成功」= 文章进了公众号草稿箱。群发不在插件里，要用户去 mp.weixin.qq.com
 *   手动执行，所以成功文案必须给出「去公众号后台」外链，而不是宣告发布完成。
 * - 失败文案直接用 failure.message/hint（host 已是人话）；settingsTarget 指明
 *   该去哪个设置分组时给「去设置」，proxy 单独说「去设置代理」。跳转动作由
 *   调用方注入（panel 里是 () => navigate({ kind: 'settings' })），本层不依赖路由。
 */

/** 公众号后台首页：推送成功后的下一步落点（检查排版/封面 + 手动群发）。 */
export const WECHAT_MP_HOME = 'https://mp.weixin.qq.com/';

export interface PushOutcomeToast {
  kind: 'success' | 'error';
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  openUrl?: string;
}

export interface PushOutcomeOptions {
  /** 失败可自救时「去设置」的动作，由调用方注入；不传则不给动作按钮。 */
  navigate?: () => void;
}

export function pushOutcomeToToast(result: PushDraftResult, options: PushOutcomeOptions = {}): PushOutcomeToast {
  if (result.ok) {
    return {
      kind: 'success',
      title: zh['toast.pushed'],
      detail: zh['toast.pushedDetail'],
      openUrl: WECHAT_MP_HOME,
      actionLabel: zh['action.goWechatBackend'],
    };
  }
  const failure = result.failure;
  // 分类级文案/出口标记收敛在 describePushFailure（rpc.ts）——本层只决定「给哪个动作、怎么给」，
  // 不再复述一遍分类文案（两处各写各的必然漂移）。
  const notice = describePushFailure(failure);
  const toast: PushOutcomeToast = {
    kind: 'error',
    title: notice.title,
    detail: notice.hint,
  };
  // 出口二选一（Toast 单动作槽）：能进设置自救的优先（应用内闭环），
  // 只能去后台办的（48001 认证 / 后台加白名单，无 settingsTarget）给外链。
  if (notice.settingsNavigate && options.navigate) {
    toast.actionLabel = failure.settingsTarget === 'proxy' ? zh['action.goSettingsProxy'] : zh['action.goSettings'];
    toast.onAction = options.navigate;
  } else if (notice.openBackend) {
    toast.openUrl = WECHAT_MP_HOME;
    toast.actionLabel = zh['action.goWechatBackend'];
  }
  return toast;
}
