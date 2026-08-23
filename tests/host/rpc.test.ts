import { describe, expect, it } from 'vitest';
import { registerWewriteRpc } from '@/host/rpc';
import type { ConnectionRpcService, RpcHandler } from '@/host/platform';
import { WewriteServiceError } from '@/host/service-errors';
import type { WeWriteService } from '@/host/service';

/**
 * RPC 错误信封映射测试（P0，2026-08-20 QA 确诊）。
 *
 * DSH 宿主 rpcResultSchema 对 result 联合校验：error.code 必须在宿主 rpcErrorSchema
 * 枚举内且分支必填 details。插件自有码（PI_AI_ERROR/digest-timeout/…）会被整包拒收，
 * zod invalid_union 全文（~1.7KB）泄漏成用户错误消息。
 * 本文件钉定 src/host/rpc.ts toHostRpcErrorEnvelope 消费面：
 * 信封 code 收敛 internal + details:{}（恒过校验），真实 code 以 '[code] ' 前缀进 message。
 */

/** 宿主 rpcErrorSchema 的 code 枚举实测快照（39 个，2026-08-20 从宿主包 client.js 核对）。 */
const HOST_RPC_ERROR_CODES = [
  'bad-request', 'cancelled', 'session-not-found', 'model-unavailable', 'session-conflict',
  'invalid-time-zone', 'workspace-attach-failed', 'workspace-not-found', 'workspace-invalid-path',
  'workspace-name-conflict', 'workspace-move-invalid', 'directory-unreadable', 'directory-exists',
  'directory-create-failed', 'directory-picker-unavailable', 'agent-preset-read-only',
  'agent-preset-locked', 'agent-preset-conflict', 'agent-preset-not-found', 'agent-preset-invalid',
  'agent-busy', 'attachment-error', 'queue-item-not-found', 'steer-unavailable', 'command-error',
  'unknown-command', 'settings-rejected', 'settings-conflict', 'credential-rejected',
  'model-discovery-failed', 'title-invalid', 'fork-unavailable', 'subagent-parent-unavailable',
  'subagent-not-found', 'subagent-catalog-diagnostic', 'subagent-not-resumable',
  'subagent-unauthorized', 'subagent-delivery-unavailable', 'internal',
] as const;

const DIGEST_ITEM = { rank: 1, title: '某热榜条目', url: 'https://a.test/1' };

/** 注册一个只关心的 digestHotspotItem 的 stub service，捕获注册进宿主 rpc 的 handler。 */
async function captureHandler(digestHotspotItem: () => Promise<never>): Promise<RpcHandler> {
  let captured: RpcHandler | undefined;
  const rpc: ConnectionRpcService = {
    handle(_channel, handler) {
      captured = handler as RpcHandler;
      return () => undefined;
    },
  };
  await registerWewriteRpc(rpc, { digestHotspotItem } as unknown as WeWriteService);
  if (!captured) throw new Error('rpc handler 未注册');
  return captured;
}

function callWith(handler: RpcHandler): Promise<unknown> {
  return handler('hotspots/digestItem', DIGEST_ITEM, new AbortController().signal);
}

describe('RPC 错误信封映射（宿主 code 白名单收敛）', () => {
  it.each([
    ['PI_AI_ERROR', 'Provider finish_reason: sensitive'],
    ['digest-timeout', 'AI 速览生成超时（45 秒），已取消，请重试'],
    ['llm-not-configured', '尚未配置默认模型'],
  ])('插件自有码 %s → 信封 internal + [code] 前缀进 message + details:{}', async (code, message) => {
    const handler = await captureHandler(() => Promise.reject(new WewriteServiceError(code, message)));
    const envelope = (await callWith(handler)) as { ok: boolean; error: { code: string; message: string; details: unknown } };

    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('internal');
    expect(HOST_RPC_ERROR_CODES).toContain(envelope.error.code);
    expect(envelope.error.message).toBe(`[${code}] ${message}`);
    expect(envelope.error.details).toEqual({});
  });

  it('code 已是宿主枚举 internal：原样保留不加前缀', async () => {
    const handler = await captureHandler(() => Promise.reject(new WewriteServiceError('internal', '内部错误')));
    const envelope = (await callWith(handler)) as { error: { code: string; message: string } };

    expect(envelope.error.code).toBe('internal');
    expect(envelope.error.message).toBe('内部错误');
  });

  it('无 code 的 Error 与裸抛值：归一 rpc-failed 前缀', async () => {
    const plain = await captureHandler(() => Promise.reject(new Error('响应形状漂移')));
    const plainEnvelope = (await callWith(plain)) as { error: { code: string; message: string } };
    expect(plainEnvelope.error.message).toBe('[rpc-failed] 响应形状漂移');

    const bare = await captureHandler(() => Promise.reject('boom' as never));
    const bareEnvelope = (await callWith(bare)) as { error: { code: string; message: string } };
    expect(bareEnvelope.error.message).toBe('[rpc-failed] boom');
  });

  it('超长 message：截断到 500 字符（宿主既有截断逻辑保持）', async () => {
    const long = '错'.repeat(600);
    const handler = await captureHandler(() => Promise.reject(new WewriteServiceError('PI_AI_ERROR', long)));
    const envelope = (await callWith(handler)) as { error: { message: string } };

    expect(envelope.error.message.endsWith('…')).toBe(true);
    expect(envelope.error.message.length).toBeLessThanOrEqual(600);
    expect(envelope.error.message.startsWith('[PI_AI_ERROR] ')).toBe(true);
  });
});
