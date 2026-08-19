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
    handle(channel: string, handler: RpcHandler, options: {
        readonly authority: 'loopback' | 'trusted-host';
    }): Promise<void | (() => void)> | (() => void);
}
export interface CredentialDescriptor {
    readonly configured: boolean;
    readonly source?: string;
    readonly writable: boolean;
}
export interface CredentialsService {
    resolve(ref: string): Promise<string | undefined> | string | undefined;
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
    readonly ctx: {
        readonly tools: ToolsService;
    };
    readonly session?: {
        readonly events?: readonly unknown[];
    };
}
export interface AgentsService {
    roots?(): readonly AgentScope[];
    on?(event: 'agent/created', listener: (event: {
        agent: AgentScope;
    }) => void): () => void;
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
    readonly connection?: {
        readonly rpc: ConnectionRpcService;
    };
    readonly credentials?: CredentialsService;
    readonly llm?: LlmService;
    readonly tools?: ToolsService;
    readonly agents?: AgentsService;
    readonly logger?: HostLogger | ((name: string) => HostLogger);
    readonly on?: (event: string, listener: (...args: unknown[]) => unknown) => (() => void) | undefined;
    readonly effect?: (body: HostEffectBody, label?: string) => unknown;
    readonly get?: (name: string) => unknown;
}
export declare function resolveLogger(ctx: HostContext, name: string): HostLogger;
/** 域句柄按记录类型取出（storage 返回未知记录，schema 权威在本插件）。 */
export declare function typedTable<V>(domain: StorageDomainHandle, name: string): KvTable<V>;
