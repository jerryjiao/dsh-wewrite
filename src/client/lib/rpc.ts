import { RPC_CHANNEL } from '@/shared/contract';
import type { ClientContext } from './context';

/**
 * connection.rpc.call('dsh-wewrite', endpoint, payload) 封装。
 *
 * - 通道名取自共享契约（RPC_CHANNEL），endpoint 受 rpcContract 双端 zod 校验，
 *   前端不做二次校验（宿主侧已拒非法形状）。
 * - 错误统一归一为 WewriteRpcError，message 保留宿主原始信息；
 *   微信 errcode 分类（AC-1/AC-6）由 describeRpcError 解析展示层文案。
 */

export class WewriteRpcError extends Error {
  readonly endpoint: string;
  /** 微信侧 errcode（如 40164 IP 白名单），非微信错误为 undefined。 */
  readonly errcode?: number;
  readonly causeUnknown?: unknown;

  constructor(endpoint: string, message: string, options?: { errcode?: number; cause?: unknown }) {
    super(message);
    this.name = 'WewriteRpcError';
    this.endpoint = endpoint;
    this.errcode = options?.errcode;
    this.causeUnknown = options?.cause;
  }
}

/** 宿主错误对象里可能携带的结构化信息（尽力解析，解析不出则回退通用文案）。 */
interface StructuredRpcError {
  message?: string;
  errcode?: number;
  classification?: string;
  hint?: string;
  egressIp?: string;
}

function readErrcode(candidate: unknown): number | undefined {
  if (typeof candidate === 'number' && Number.isInteger(candidate)) return candidate;
  if (typeof candidate === 'string') {
    const parsed = Number.parseInt(candidate, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function extractStructured(raw: unknown): StructuredRpcError {
  if (raw instanceof Error) {
    const asRecord = raw as Error & Record<string, unknown>;
    return {
      message: raw.message,
      errcode: readErrcode(asRecord.errcode),
      classification: typeof asRecord.classification === 'string' ? asRecord.classification : undefined,
      hint: typeof asRecord.hint === 'string' ? asRecord.hint : undefined,
      egressIp: typeof asRecord.egressIp === 'string' ? asRecord.egressIp : undefined,
    };
  }
  if (typeof raw === 'string') return { message: raw };
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    return {
      message: typeof record.message === 'string' ? record.message : undefined,
      errcode: readErrcode(record.errcode),
      classification: typeof record.classification === 'string' ? record.classification : undefined,
      hint: typeof record.hint === 'string' ? record.hint : undefined,
      egressIp: typeof record.egressIp === 'string' ? record.egressIp : undefined,
    };
  }
  return {};
}

export interface WewriteRpc {
  call<T>(endpoint: string, payload?: unknown, signal?: AbortSignal): Promise<T>;
}

export function createRpc(ctx: ClientContext): WewriteRpc {
  return {
    async call<T>(endpoint: string, payload: unknown = {}, signal?: AbortSignal): Promise<T> {
      try {
        const raw = await ctx.connection.rpc.call(RPC_CHANNEL, endpoint, payload, signal);
        // 平台信封：{result:{ok:true,value}} / {ok:false,error}（host rpc.ts 对端同契约）
        const envelope = (raw as { result?: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } }).result ?? (raw as { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } });
        if (envelope && envelope.ok === true) return envelope.value as T;
        if (envelope && envelope.ok === false) {
          throw new WewriteRpcError(endpoint, `${envelope.error?.code ? `[${envelope.error.code}] ` : ''}${envelope.error?.message ?? `调用 ${endpoint} 失败`}`);
        }
        return raw as T;
      } catch (cause) {
        if (cause instanceof WewriteRpcError) throw cause;
        const structured = extractStructured(cause);
        throw new WewriteRpcError(endpoint, structured.message ?? `调用 ${endpoint} 失败`, {
          errcode: structured.errcode,
          cause,
        });
      }
    },
  };
}

export interface FailureNotice {
  /** 一句话失败标题（具体、可行动）。 */
  title: string;
  /** 出路/修复指引（可选）。 */
  hint?: string;
  /** errcode 40164 时为 true，UI 附带「去设置代理」直达动作。 */
  ipWhitelist: boolean;
}

/** message 形如序列化 JSON（以 [ 或 { 开头且很长）——信封校验失败的透传墙，不给人看。 */
function looksLikeSerializedJson(message: string): boolean {
  return (message.startsWith('[') || message.startsWith('{')) && message.length > 200;
}

/** 推送/诊断失败的分类展示文案（AC-1 / AC-6 口径，文案来自 DESIGN.md §9.6）。 */
export function describeRpcFailure(error: unknown): FailureNotice {
  const structured = extractStructured(error);
  if (structured.errcode === 40164) {
    const ip = structured.egressIp ?? '当前出口 IP';
    return {
      title: `出口 IP ${ip} 不在白名单。`,
      hint: '两条出路：① 设置里配置 API 代理地址；② 微信后台把该 IP 加入白名单。',
      ipWhitelist: true,
    };
  }
  switch (structured.classification) {
    case 'AUTH':
      return { title: '凭据校验失败（secret 无效或已过期）。', hint: '到设置页重填 AppSecret 并重试测试连接。', ipWhitelist: false };
    case 'TIMEOUT':
    case 'NETWORK':
      return { title: '无法访问微信接口（超时）。', hint: '检查代理地址是否可达。', ipWhitelist: false };
    case 'RATE_LIMIT':
      return { title: '触发微信接口限频，稍后自动恢复。', ipWhitelist: false };
    default: {
      // QA qa-digest 兜底（2026-08-20）：宿主信封校验失败时 message 可能是
      // ~1.7KB 的 zod JSON 墙——不透传给用户，回退通用标题。
      if (structured.message && looksLikeSerializedJson(structured.message)) {
        return { title: '请求失败。', hint: structured.hint, ipWhitelist: false };
      }
      return {
        title: structured.message ?? '请求失败。',
        hint: structured.hint,
        ipWhitelist: false,
      };
    }
  }
}
