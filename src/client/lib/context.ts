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
    /**
     * ── chat-integration（M2/M3 增量，窄面纪律：只 append，不改上方既有声明）──
     * 宿主真源：dsh-client-ui-tool contract/slots.d.ts（toolview keyed）、
     * dsh-client-ui-conversation contract/slots.d.ts（turnTail chain / commandview
     * keyed / input.right list）。字段比宿主真实面窄是刻意的（generic 卡子集）。
     */
    /** tool.call.toolview：keyed 按 wire 工具名（对自己的工具纯增量）。 */
    register(
      options: {
        readonly name: 'tool.call.toolview';
        readonly key: string;
        readonly priority?: number;
      },
      component: ComponentType<ToolviewOwnerPropsLike>,
    ): () => void;
    /** conversation.chat.turnTail：chain（select 挂载前裁决，decline-before-mount）。 */
    register(
      options: {
        readonly name: 'conversation.chat.turnTail';
        readonly select: (owner: unknown) => unknown;
        readonly priority?: number;
      },
      component: ComponentType<TurnTailComponentPropsLike>,
    ): () => void;
    /** conversation.chat.commandview：keyed 按命令名。 */
    register(
      options: {
        readonly name: 'conversation.chat.commandview';
        readonly key: string;
      },
      component: ComponentType<CommandRowOwnerPropsLike>,
    ): () => void;
    /** conversation.input.right：composer 工具行右端小控件席位（S8：快照只读）。 */
    register(
      options: {
        readonly name: 'conversation.input.right';
        readonly id: string;
        readonly order?: number;
        readonly label?: string | (() => string);
      },
      component: ComponentType<InputZonePropsLike>,
    ): () => void;
  };
  /**
   * conversationEvents：ConversationNodeDefinition 注册面（S5，M2）。
   * 可选——宿主缺该服务（D4）时 registerChat 走 try/catch 降级（无产物行）。
   */
  conversationEvents?: {
    register(definition: {
      readonly kind: string;
      readonly target?: string;
      match(event: unknown): { readonly id: string; readonly role: 'start' | 'update' } | null;
      start(context: unknown, match: unknown, reader: unknown): unknown;
      update(context: unknown, match: unknown): unknown;
      buildLocationData?(context: unknown, scope: 'step' | 'turn'): unknown;
    }): () => void;
  };
  /**
   * 运行时动态注入（cordis ctx.inject(deps, callback)，P0-1 修复方案 b）：
   * 起一个带依赖的子 fiber，服务到位（或已到位）即回调；服务永不到位则子 fiber
   * 休眠——它不是 loader entry，不进 web boot 的 assertEntriesActive 扫描，
   * 主插件照常激活。可选面：宿主无此 API 时调用方 try/catch 降级。
   */
  inject?(deps: readonly string[], callback: (ctx: ClientContext) => void): unknown;
}

// ── chat-integration 结构类型（M2/M3；对齐宿主 rc.7 实面的最小子集） ───────────

/** harness ContentBlock 的 text 面（卡片只消费文本块）。 */
export interface ContentBlockLike {
  readonly type: string;
  readonly text?: string;
}

/** ToolCallView 的 generic 面（S2 词汇表最稳子集；本插件工具只用 generic 卡）。 */
export interface GenericCallViewLike {
  readonly card: 'generic';
  readonly title?: string;
  readonly kind?: string;
  readonly rawInput?: unknown;
  readonly content?: readonly ContentBlockLike[];
}

/** ToolResultView 的 generic 面（title/content 可选省略）。 */
export interface GenericResultViewLike {
  readonly card: 'generic';
  readonly title?: string;
  readonly content?: readonly ContentBlockLike[];
}

/** 运行中的工具调用（dsh-client-runtime RunningToolCall 的消费面）。 */
export interface RunningToolCallLike {
  readonly callId: string;
  readonly name: string;
  readonly argsRaw: string;
  readonly turn: number;
  readonly step: number;
  readonly time: number;
  readonly callView: GenericCallViewLike | null;
  readonly subCalls: readonly ToolCallBlockLike[];
}

/** 已结算的工具结果（ToolResultNode 的消费面；meta 持久化、回放同卡）。 */
export interface ToolResultNodeLike {
  readonly kind: 'tool-result';
  readonly seq: number;
  readonly time: number;
  readonly callId: string;
  readonly call: { readonly name: string; readonly argsRaw: string } | null;
  readonly callTime: number | null;
  readonly content: readonly ContentBlockLike[];
  readonly isError: boolean;
  readonly error?: { readonly name: string; readonly code: string };
  readonly meta?: unknown;
  readonly callView: GenericCallViewLike | null;
  readonly resultView: GenericResultViewLike | null;
  readonly subCalls: readonly ToolCallBlockLike[];
}

/** 一个运行中或已结算的调用（branch on 'kind' in block，S4）。 */
export type ToolCallBlockLike = RunningToolCallLike | ToolResultNodeLike;

/** toolview owner props（S4：宿主传调用身份 + 冻结的运行/终态 block）。 */
export interface ToolviewOwnerPropsLike {
  readonly callId: string;
  readonly toolName: string;
  readonly block: ToolCallBlockLike;
  readonly cwd?: string | undefined;
  readonly openFile: (path: string) => void;
  readonly inspect?: (() => void) | undefined;
  readonly t?: Translate;
}

/** turnTail 组件 props：owner 面 + chain 注入的 matched。 */
export interface TurnTailComponentPropsLike {
  readonly turn?: unknown;
  readonly seq?: number;
  readonly openFile?: (path: string) => void;
  readonly matched?: unknown;
  readonly t?: Translate;
}

/** /wewrite 命令行节点（CommandNode 的消费面）。 */
export interface CommandRowOwnerPropsLike {
  readonly node: {
    readonly kind: 'command';
    readonly seq: number;
    readonly time: number;
    readonly commandId?: string;
    readonly name: string | null;
    readonly args: string | null;
    readonly outcome: { readonly kind: 'success' | 'error'; readonly text?: string } | null;
  } | null;
  readonly compaction?: unknown;
  readonly t?: Translate;
}

/** conversation.input.* owner（S8 InputZone：point-in-time 快照，禁止自订阅）。 */
export interface InputZonePropsLike {
  readonly session?: unknown;
  readonly input?: unknown;
  readonly t?: Translate;
}

// ── inputTriggers（S11，M3；dsh-client-ui-input-trigger 未入 devDeps，最小面） ──

/** @ 引用候选（纯展示数据）。 */
export interface InputTriggerCandidateLike {
  readonly name: string;
  readonly description?: string;
  readonly icon?: string;
  readonly hint?: string;
}

/** ReferenceCodec：clipboard 投影 + 模型序列化（失败抛错=阻塞发送，S11）。 */
export interface ReferenceCodecLike {
  clipboardText(ref: string): string;
  serialize(ref: string, signal: AbortSignal): Promise<string>;
}

/** @ 触发源（InputTriggerSource 的注册面子集）。 */
export interface InputTriggerSourceLike {
  readonly trigger: '@' | '/';
  readonly name: string;
  readonly order?: number;
  warm?(session: unknown): void;
  candidates(session: unknown, request: { readonly query: string; readonly signal: AbortSignal }): Promise<readonly InputTriggerCandidateLike[]>;
  onPick(pick: {
    readonly candidate: InputTriggerCandidateLike;
    readonly session: unknown;
    readonly span: { readonly start: number; readonly end: number };
  }):
    | { readonly insert: { readonly source: string; readonly ref: string; readonly label: string; readonly clipboardText: string } }
    | undefined;
  readonly codec?: ReferenceCodecLike;
}

/** ctx.inputTriggers 服务面（D10：缺失时 try/catch 降级，无 @ 源）。 */
export interface InputTriggersServiceLike {
  registerSource(source: InputTriggerSourceLike): () => void;
}
