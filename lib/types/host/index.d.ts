/**
 * dsh-wewrite 宿主插件入口（架构 §3）：只装配，零业务（<100 行纪律）。
 * inject 声明缺失时 Cordis 拒载（loud failure）；服务面在 apply 内再做 feature detection
 * 降级（§9.1）。凭据只经 ctx.credentials，storage 只走 domain（ADR-005/006）。
 *
 * inject 含 'commands'（M3 /wewrite）：cordis getter 对未声明服务直接抛
 * "cannot get property ... without inject"，ctx.commands?. 可选链防不住——必须静态声明。
 * pending 风险评估（conversationEvents 教训）：dsh-base 是「every dsh profile 的 shared
 * core」（宿主 dsh-base/cordis.patch.yml 头注释），commands 行在其 bundle 内恒在，
 * 静态声明不会永久 pending——与 client 侧动态子 fiber 模式的取舍依据即此。
 */
import { z } from 'zod';
import { type HostContext } from './platform';
export declare const name = "dsh-wewrite";
export declare const inject: string[];
export declare const Config: z.ZodObject<{
    agentToolsEnabled: z.ZodDefault<z.ZodBoolean>;
    schedulerTickSeconds: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare function apply(ctx: HostContext, rawConfig: unknown): Promise<void>;
