import type { ComponentType } from 'react';
import type { ClientContext, ToolviewOwnerPropsLike, TurnTailComponentPropsLike } from '../lib/context';
import type { WewriteRpc } from '../lib/rpc';
import { LOCALE_NAMESPACE } from '../lib/i18n';
import { setCardTranslator } from './card-text';
import { DeliverablesRow } from './deliverables-row';
import { selectWewriteArticles, wewriteDeliverablesDefinition } from './deliverables';
import { PushToolCard, RewriteToolCard } from './edit-tool-cards';
import { RunToolCard } from './run-tool-card';
import '../styles/chatcard.css';

/**
 * M2 聊天装配（architecture §3 M2 / §6 降级矩阵）：
 * - 3× toolview（keyed wewrite_run / wewrite_rewrite / wewrite_push_draft）——
 *   各自独立 try/catch：任一失败 → 官方通用工具行 + 声明式卡兜底（D3）。
 * - conversationEvents.register（deliverables Definition）——宿主缺服务时降级（D4）。
 * - turnTail chain（select=selectWewriteArticles 挂载前裁决）——槽缺失降级（D5）。
 * - 卡片文案统一本插件 ns 的 bind（坑#dsh-slot-props-t），bind 失败回退 zh 词典。
 * 卡片样式 chatcard.css 随本模块 import 注入（宿主无插件 css 通道，build.mjs 同款）。
 */

function warnDegraded(action: string, error: unknown): void {
  console.warn(`[dsh-wewrite] ${action} 失败，已降级跳过`, error);
}

/** toolview 适配器工厂：owner props → 卡片 props（rpc 经闭包注入）。 */
function runCardAdapter(rpc: WewriteRpc): ComponentType<ToolviewOwnerPropsLike> {
  return function WewriteRunToolview(props: ToolviewOwnerPropsLike) {
    return <RunToolCard block={props.block} rpc={rpc} t={props.t} />;
  };
}

function rewriteCardAdapter(): ComponentType<ToolviewOwnerPropsLike> {
  return function WewriteRewriteToolview(props: ToolviewOwnerPropsLike) {
    return <RewriteToolCard block={props.block} t={props.t} />;
  };
}

function pushCardAdapter(): ComponentType<ToolviewOwnerPropsLike> {
  return function WewritePushToolview(props: ToolviewOwnerPropsLike) {
    return <PushToolCard block={props.block} t={props.t} />;
  };
}

export function registerChat(ctx: ClientContext, rpc: WewriteRpc): void {
  try {
    setCardTranslator(ctx.locale.bind(LOCALE_NAMESPACE));
  } catch {
    /* bind 失败 → cardT 回退 zh 词典原文（坑#dsh-slot-props-t） */
  }

  const disposers: Array<() => void> = [];
  const safeRegister = (label: string, register: () => () => void): void => {
    try {
      const dispose = register();
      if (typeof dispose === 'function') disposers.push(dispose);
    } catch (error) {
      warnDegraded(label, error);
    }
  };

  safeRegister('slots.register（tool.call.toolview wewrite_run）', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'wewrite_run' }, runCardAdapter(rpc)),
  );
  safeRegister('slots.register（tool.call.toolview wewrite_rewrite）', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'wewrite_rewrite' }, rewriteCardAdapter()),
  );
  safeRegister('slots.register（tool.call.toolview wewrite_push_draft）', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'wewrite_push_draft' }, pushCardAdapter()),
  );

  // conversationEvents（D4）：经 ctx.inject 动态子 fiber 探测，不进模块级 inject 数组。
  // P0-1 教训（2026-08-20 QA 打回）：rc.7 的 cordis（@deepseek-ai/cordis 4.0.1）
  // Inject.resolve 对数组项原样入表、不解析 `?` 可选后缀——静态声明 conversationEvents?
  // 会被当真服务名永久等待（fiber PENDING，boot sweep fail-loud → 整个 client 不激活，
  // 写作台陪葬，违反 spec §10 降级底线）。改必选名（方案 a）在缺该服务的 bundle 会
  // 重演同类死亡。方案 b（选定）：动态子 fiber 等服务到位再注册；服务永不到位时子
  // fiber 休眠（非 loader entry，不进 assertEntriesActive 扫描），主插件与写作台零影响。
  try {
    ctx.inject?.(['conversationEvents'], function wewriteDeliverablesRegister(subCtx: ClientContext) {
      const registry = subCtx.conversationEvents;
      if (!registry) return; // 防御：动态注入到位即应有值
      const dispose = registry.register(wewriteDeliverablesDefinition);
      subCtx.effect(() => dispose, 'wewrite-deliverables');
    });
  } catch (error) {
    warnDegraded('ctx.inject（conversationEvents）', error);
  }

  safeRegister('slots.register（conversation.chat.turnTail）', () =>
    ctx.slots.register(
      { name: 'conversation.chat.turnTail', select: selectWewriteArticles as (owner: unknown) => unknown, priority: 100 },
      DeliverablesRow as ComponentType<TurnTailComponentPropsLike>,
    ),
  );

  if (disposers.length > 0) {
    ctx.effect(
      () => () => {
        disposers.forEach((dispose) => dispose());
      },
      'wewrite-chat',
    );
  }
}
