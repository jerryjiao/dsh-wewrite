/**
 * dsh-wewrite 宿主插件入口（架构 §3）：只装配，零业务（<100 行纪律）。
 * inject 声明缺失时 Cordis 拒载（loud failure）；服务面在 apply 内再做 feature detection
 * 降级（§9.1）。凭据只经 ctx.credentials，storage 只走 domain（ADR-005/006）。
 */

import { z } from 'zod';
import { domainSpec } from './domain';
import { resolveLogger, type CredentialsService, type HostContext, type LlmService } from './platform';
import { registerWewriteRpc } from './rpc';
import { WeWriteService } from './service';
import { registerWewriteTools } from './tools';

export const name = 'dsh-wewrite';

export const inject = ['storageDomain', 'agents', 'sessions', 'connection', 'llm', 'credentials', 'tools'];

export const Config = z.object({
  agentToolsEnabled: z.boolean().default(false),
  schedulerTickSeconds: z.number().int().min(5).default(30),
});

/** credentials 服务缺失时的内存兜底（§9.1：降级可用，警告提示）。 */
function fallbackCredentials(logger: { warn(message: string): void }): CredentialsService {
  const values = new Map<string, string>();
  logger.warn('dsh-wewrite: 宿主 credentials 服务缺失，凭据退化为进程内存（重启即失，请升级 DSH）');
  return {
    resolve: async (ref) => values.get(ref),
    describe: (ref) => ({ configured: values.has(ref), writable: true }),
    set: async (ref, value) => {
      values.set(ref, value);
    },
    unset: async (ref) => {
      values.delete(ref);
    },
  };
}

/** llm 服务缺失时的终结流兜底：文本步收到明确错误而非悬空。 */
function fallbackLlm(logger: { warn(message: string): void }): LlmService {
  logger.warn('dsh-wewrite: 宿主 llm 服务缺失，管线文本步将立即失败（请在 DSH 设置页配置模型）');
  return {
    async *stream() {
      yield { type: 'finish', error: { code: 'llm-unavailable', message: '宿主 llm 服务不可用：无法执行写作管线文本步' } };
    },
  };
}

export async function apply(ctx: HostContext, rawConfig: unknown): Promise<void> {
  const config = Config.parse(rawConfig ?? {});
  const logger = resolveLogger(ctx, 'dsh-wewrite');
  const storageDomain = ctx.storageDomain;
  if (!storageDomain) {
    logger.warn('dsh-wewrite: storageDomain 服务缺失，宿主侧不激活（安装面检查 DSH 版本）');
    return;
  }
  if (!ctx.effect) {
    logger.warn('dsh-wewrite: ctx.effect 缺失，宿主生命周期无法挂载（检查 DSH 版本兼容性）');
    return;
  }
  await ctx.effect(async () => {
    const domain = await storageDomain.open(domainSpec);
    const service = await WeWriteService.open({
      domain,
      credentials: ctx.credentials ?? fallbackCredentials(logger),
      llm: ctx.llm ?? fallbackLlm(logger),
      logger,
    });
    const disposers: Array<() => void | Promise<void>> = [];
    try {
      const stopRpc = registerWewriteRpc(ctx.connection?.rpc, service, logger);
      disposers.push(() => {
        void Promise.resolve(stopRpc).then((dispose) => dispose?.());
      });
      for (const stop of registerWewriteTools(ctx, service, { enabled: config.agentToolsEnabled })) {
        disposers.push(stop);
      }
      service.startScheduler();
    } catch (error) {
      logger.warn(`dsh-wewrite: 贡献装配部分降级：${error instanceof Error ? error.message : String(error)}`);
    }
    return async () => {
      for (const dispose of [...disposers].reverse()) {
        await Promise.resolve(dispose()).catch(() => undefined);
      }
      await service.dispose();
    };
  }, 'dsh-wewrite: host service');
}
