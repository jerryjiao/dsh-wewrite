import type { ComponentType } from 'react';

/**
 * ClientContext 本地最小 interface。
 *
 * 形状提炼自 dsh-automation（本机 ~/.dsh/profiles/web 实装）的
 * lib/types/client/contracts.d.ts，剥去 automation 专有运行时字段，
 * 保留插件 client 需要的最小消费面：
 *   - ctx.effect        插件级副作用生命周期（返回清理函数）
 *   - ctx.connection.rpc  loopback RPC 通道
 *   - ctx.locale        zh/en 词典注册与绑定
 *   - ctx.slots.register conversation.view tab 注册（WeWrite 工作台挂载点）
 *
 * 不 import @dsh-external/* 产物：宿主侧由 src/host/ 在联调时提供真实 ctx，
 * 此处只钉定前端编译期形状。字段比宿主真实面窄是刻意的（结构化子集），
 * 联调时真实 ctx 可直接传入。
 */

export type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface ClientRpc {
  call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>;
}

/** WeWrite 视图组件 props（slots.register 注入面）。 */
export interface WewriteViewProps {
  readonly sessionId: string;
  readonly t: Translate;
}

/** slots.register 的注入运行时：宿主按 sessionId 提供上下文，前端按需消费。 */
export interface WewriteSlotRuntime {
  readonly sessionId: string;
}

/** sidebar.footer.action owner props（宿主 ui-sidebar slots 契约）：wide=false 为 56px rail。 */
export interface SidebarFooterActionProps {
  readonly wide: boolean;
}

export interface ClientContext {
  /** 副作用生命周期：factory 返回清理函数时，宿主在插件停用时调用。 */
  effect(factory: () => void | (() => void), label?: string): void;
  connection: {
    readonly rpc: ClientRpc;
  };
  locale: {
    register(
      namespace: string,
      dictionaries: { readonly zh: Record<string, string>; readonly en: Record<string, string> },
    ): () => void;
    bind(namespace: string): Translate;
  };
  slots: {
    /** conversation.view：会话内工作台 tab（主入口）。 */
    register(
      options: {
        readonly name: 'conversation.view';
        readonly id: string;
        readonly order: number;
        readonly locale: string;
        readonly label: () => string;
        readonly inject: (sessionId: string) => WewriteSlotRuntime;
      },
      component: ComponentType<WewriteViewProps>,
    ): () => void;
    /** sidebar.footer.action：宿主侧栏 footer「写作台」入口（v0.3 R2）。 */
    register(
      options: {
        readonly name: 'sidebar.footer.action';
        readonly id: string;
        readonly order?: number;
        readonly label?: string | (() => string);
      },
      component: ComponentType<SidebarFooterActionProps>,
    ): () => void;
    /** shell.overlay：写作台全屏浮层挂载层（v0.3 R2）。 */
    register(
      options: {
        readonly name: 'shell.overlay';
        readonly id: string;
        readonly order?: number;
        readonly label?: string | (() => string);
      },
      component: ComponentType<Record<string, never>>,
    ): () => void;
  };
}
