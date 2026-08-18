/**
 * dsh-wewrite 宿主插件入口（架构 §3）：只装配，零业务（<100 行纪律）。
 * inject 声明缺失时 Cordis 拒载（loud failure）；服务面在 apply 内再做 feature detection
 * 降级（§9.1）。凭据只经 ctx.credentials，storage 只走 domain（ADR-005/006）。
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
