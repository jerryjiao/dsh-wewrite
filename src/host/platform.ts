/**
 * DSH 宿主服务的最小接口声明（架构 §9 平台防御）。
 * 不 import dsh-automation 产物；cordis 类型走 @deepseek-ai/cordis devDep + 本文件本地形状。
 * 业务模块只依赖这些结构面——测试不打真 DSH 的前提（宿主类型与业务逻辑解耦）。
 * 全部服务在 apply 内做存在性探测，缺失时降级为 console 警告（§9.1）。
 */

import type { WewriteDomainSpec } from './domain';

export interface KvTable<V> {
  get(key: string): V | undefined;
  entries(): IterableIterator<[string, V]>;
  keys(): IterableIterator<string>;
  readonly size: number;
  put(key: string, value: V): Promise<void>;
  delete(key: string): Promise<boolean>;
  update(key: string, patch: (value: V) => V): Promise<void>;
}

export interface DomainGlobal {
  get(): unknown;
  set(value: unknown): Promise<void>;
}

export interface StorageDomainHandle {
  table(name: string): KvTable<unknown>;
  readonly global: DomainGlobal;
  close(): Promise<void>;
}

export interface StorageDomainService {
  open(spec: WewriteDomainSpec): Promise<StorageDomainHandle>;
}

export type RpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>;

export interface ConnectionRpcService {
  handle(
    channel: string,
    handler: RpcHandler,
    options: { readonly authority: 'loopback' | 'trusted-host' },
  ): Promise<void | (() => void)> | (() => void);
}

export interface CredentialDescriptor {
  readonly configured: boolean;
  readonly source?: string;
  readonly writable: boolean;
}

/**
 * 宿主 credentials.resolve 的实测返回（dsh-credentials 分层出口）是 {value, source}
 * 信封对象；本插件旧声明与测试桩用裸 string。两形状都要吃（2026-08-26 真宿主
 * 首跑实证：信封被当 secret 用 → 40125 invalid appsecret）。
 */
export type ResolvedCredential = string | { readonly value?: unknown; readonly [extra: string]: unknown } | null | undefined;

/** 空值归一为 undefined（宿主缝规则：空存值视同未配置，不冒充已配置凭据）。 */
export function unwrapCredential(resolved: ResolvedCredential): string | undefined {
  if (typeof resolved === 'string') return resolved.length > 0 ? resolved : undefined;
  if (resolved && typeof resolved === 'object' && typeof resolved.value === 'string' && resolved.value.length > 0) {
    return resolved.value;
  }
  return undefined;
}

export interface CredentialsService {
  resolve(ref: string): Promise<ResolvedCredential> | ResolvedCredential;
  describe(ref: string): Promise<CredentialDescriptor> | CredentialDescriptor;
  set(ref: string, value: string): Promise<void>;
  unset(ref: string): Promise<void>;
}

export interface LlmProviderListing {
  readonly id?: string;
  readonly name?: string;
  readonly models?: readonly unknown[];
}

export interface LlmService {
  /** 宿主 dsh-llm seam：listProviders 同步、listModels 异步（返回 Promise），两者都按可能异步防御。 */
  listProviders?(): readonly unknown[] | Promise<readonly unknown[]>;
  listModels?(provider: string): readonly unknown[] | Promise<readonly unknown[]>;
  stream(options: Record<string, unknown>): AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>;
}

export interface ToolsService {
  register(definition: unknown): unknown;
}

export interface AgentScope {
  readonly id: string | number;
  readonly ctx: { readonly tools: ToolsService };
  readonly session?: { readonly events?: readonly unknown[] };
}

// ── Agent 工具面结构体（ADR-011：手构 ToolDefinition，运行时不 import dsh-tools；
// 形状结构兼容 rc.7 dsh-tools lib/types/index.d.ts:106-172——execute 双参 + output 必填）──

/** S2 词汇表最小子集（ADR-012：只用 generic 卡 + text content，最稳定面）。 */
export interface ToolCallView {
  readonly card: 'generic';
  readonly kind: 'execute' | 'edit';
  readonly title: string;
  readonly rawInput?: Readonly<Record<string, unknown>>;
}

export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ToolResultView {
  readonly card: 'generic';
  readonly title: string;
  readonly content: readonly TextBlock[];
}

/**
 * rc.7 ToolRunContext 窄面：execute 依赖 signal（D11）+ callId（M2 运行卡 runId 断链修复：
 * ToolExecutionInput.callId 是宿主必填字段，前端运行卡 args.runId→rawInput.runId→callId 兜底链的终点）。
 * 字段按可选防御——测试假件与降级路径不保证携带。
 */
export interface ToolRunContext {
  readonly signal: AbortSignal;
  readonly callId?: string;
  readonly rootCallId?: string;
  readonly name?: string;
  readonly agent?: { readonly id?: unknown; readonly session?: unknown };
}

export interface WewriteToolOutputDefinition {
  /** object-root JsonSchemaNode（canonical value 的形状声明）。 */
  readonly schema: Record<string, unknown>;
  /** 模型面文本（纯函数，禁访问 service；流式与回放共用）。 */
  render(args: unknown, value: unknown): TextBlock[];
  /** E2 meta（纯函数；产物过 shared/agent-tool-contract 的 meta schema）。 */
  presentationMeta?(args: unknown, value: unknown): unknown;
}

export interface WewriteToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly output: WewriteToolOutputDefinition;
  readonly timeoutMs?: number;
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>;
  presentCall?(args: unknown): ToolCallView | undefined;
  presentResult?(
    args: unknown,
    result: { readonly content: readonly unknown[]; readonly isError: boolean; readonly meta?: unknown },
  ): ToolResultView | undefined;
}

/** M3 slash 命令 seam（S9：handler 不进模型，command/run 是 known 事件）。 */
export interface CommandsService {
  register(definition: unknown): unknown;
}

export interface AgentsService {
  roots?(): readonly AgentScope[];
  on?(event: 'agent/created', listener: (event: { agent: AgentScope }) => void): () => void;
  withoutInitiator?<T>(fn: () => Promise<T>): Promise<T>;
}

export interface HostLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export type HostEffectBody = () => Promise<(() => Promise<void> | void) | void> | (() => Promise<void> | void);

/** apply(ctx) 收到的宿主上下文：全部服务可选（feature detection）。 */
export interface HostContext {
  readonly storageDomain?: StorageDomainService;
  readonly connection?: { readonly rpc: ConnectionRpcService };
  readonly credentials?: CredentialsService;
  readonly llm?: LlmService;
  readonly tools?: ToolsService;
  readonly agents?: AgentsService;
  readonly commands?: CommandsService;
  readonly logger?: HostLogger | ((name: string) => HostLogger);
  readonly on?: (event: string, listener: (...args: unknown[]) => unknown) => (() => void) | undefined;
  readonly effect?: (body: HostEffectBody, label?: string) => unknown;
  readonly get?: (name: string) => unknown;
}

export function resolveLogger(ctx: HostContext, name: string): HostLogger {
  const candidate = typeof ctx.logger === 'function' ? ctx.logger(name) : ctx.logger;
  if (candidate) return candidate;
  const fallback: HostLogger = {
    info: (message) => console.log(`[${name}] ${message}`),
    warn: (message) => console.warn(`[${name}] ${message}`),
    error: (message) => console.error(`[${name}] ${message}`),
  };
  return fallback;
}

/** 域句柄按记录类型取出（storage 返回未知记录，schema 权威在本插件）。 */
export function typedTable<V>(domain: StorageDomainHandle, name: string): KvTable<V> {
  return domain.table(name) as KvTable<V>;
}
