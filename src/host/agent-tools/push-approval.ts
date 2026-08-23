/**
 * 推送审批闸（OD-1 / ADR-014，architecture §4.4）：tools/pre-execute waterfall 监听器，
 * 对 wewrite_push_draft 的调用返回 {kind:'ask'} 触发宿主审批面板；他人调用必须 next() 透传。
 * fail-closed 双层：武装失败（ctx.on 抛错/返回非函数）→ 调用方不注册 push 工具（D14①）；
 * 句柄被回收后 execute 体内 isArmed() 复查拒绝（D14②）——未确认的微信 API 调用构造上不可达。
 */

import type { HostContext } from '../platform';
import type { WeWriteService } from '../service';

export const PUSH_TOOL_NAME = 'wewrite_push_draft';

/** 审批句柄：stop 交入口统一回收；isArmed 供 push 工具 execute 兜底复查。 */
export interface PushApprovalHandle {
  readonly stop: () => void;
  isArmed(): boolean;
}

/** 从工具 call 的 arguments 里提取 article_id（兼容 {article_id} 与裸 string）。 */
function extractArticleId(args: unknown): string {
  if (typeof args === 'string') return args;
  const value = (args as { article_id?: unknown } | null | undefined)?.article_id;
  return typeof value === 'string' ? value : '';
}

function safeLookupTitle(service: WeWriteService, articleId: string): string {
  try {
    const title = articleId ? service.lookupArticleTitle(articleId) : '';
    if (typeof title === 'string' && title) return title;
  } catch {
    // 内存查失败：兜底占位，审批面板仍要弹出（fail-closed 方向是拒，不是崩）
  }
  return articleId || '该文章';
}

/** 门禁结论（AC-M1-05：确认提示须含文章标题与门禁结论）：从文章状态同步推断。 */
function describeGateVerdict(service: WeWriteService, articleId: string): string {
  try {
    const hit = service.listArticles().find((item) => item.id === articleId);
    if (!hit) return '门禁结论请以写作台报告为准';
    if (hit.status === 'rendered' || hit.status === 'pushed') return '该文已通过质量门禁';
    if (hit.status === 'failed') return '该文未通过质量门禁（推送前请在写作台确认是否覆盖）';
    return '该文尚未走完管线门禁（推送前请在写作台确认门禁结论）';
  } catch {
    return '门禁结论请以写作台报告为准';
  }
}

export function composePushAskReason(service: WeWriteService, args: unknown): string {
  const articleId = extractArticleId(args);
  const title = safeLookupTitle(service, articleId);
  return `即将把《${title}》推送到微信公众号草稿箱（仅保存草稿，不群发）。${describeGateVerdict(service, articleId)}`;
}

/**
 * 武装审批监听器；未武装返回 undefined（由 registerAgentTools 捕获后不注册 push 工具）。
 * 注意：armed 状态是每个句柄独立的——实例回收即失效，不受其他实例遗留影响。
 */
export function createPushApproval(ctx: HostContext, service: WeWriteService): PushApprovalHandle | undefined {
  let stop: (() => void) | undefined;
  try {
    stop = ctx.on?.('tools/pre-execute', ((exec: unknown, next: unknown) => {
      const call = exec as { name?: unknown; arguments?: unknown } | undefined;
      if (call?.name !== PUSH_TOOL_NAME) {
        return typeof next === 'function' ? (next as () => unknown)() : undefined;
      }
      return { kind: 'ask', reason: composePushAskReason(service, call.arguments) };
    }) as (...args: unknown[]) => unknown);
  } catch (error) {
    console.warn(`dsh-wewrite: 推送审批监听器注册失败（push 工具不注册，fail-closed）：${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
  if (typeof stop !== 'function') {
    console.warn('dsh-wewrite: tools/pre-execute 订阅未返回回收函数（push 工具不注册，fail-closed）');
    return undefined;
  }
  let armed = true;
  return {
    stop: () => {
      if (!armed) return;
      armed = false;
      try {
        stop?.();
      } catch {
        // 宿主回收抛错不放大（armed 已复位，fail-closed 生效）
      }
    },
    isArmed: () => armed,
  };
}

/** 公开契约（测试钉死）：返回 disposer；未武装返回 undefined。 */
export function armPushApproval(ctx: HostContext, service: WeWriteService): (() => void) | undefined {
  const handle = createPushApproval(ctx, service);
  return handle ? handle.stop : undefined;
}
