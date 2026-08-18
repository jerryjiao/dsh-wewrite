/**
 * RPC 适配层（架构 §3：薄，只做 payload 校验 + 转发 service + 响应形状复核）。
 * 通道 authority=loopback（F13：控制无人值守写面的通道仅本机回环）。
 */
import type { ConnectionRpcService, HostLogger } from './platform';
import type { WeWriteService } from './service';
/** 注册 loopback 通道；rpc 服务缺失时降级为 no-op + 警告（架构 §9.1）。 */
export declare function registerWewriteRpc(rpc: ConnectionRpcService | undefined, service: WeWriteService, logger?: HostLogger): Promise<() => void>;
