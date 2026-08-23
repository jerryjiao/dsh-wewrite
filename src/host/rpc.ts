/**
 * RPC 适配层（架构 §3：薄，只做 payload 校验 + 转发 service + 响应形状复核）。
 * 通道 authority=loopback（F13：控制无人值守写面的通道仅本机回环）。
 */

import { RPC_AUTHORITY, RPC_CHANNEL, rpcContract, type RunParams, type RpcEndpoint } from '../shared/contract';
import type { ConnectionRpcService, HostLogger } from './platform';
import type { WeWriteService } from './service';

type ContractEntry = { readonly request: { safeParse(input: unknown): { success: boolean; data?: unknown; error?: { issues: { path: (string | number)[]; message: string }[] } } }; readonly response: { safeParse(input: unknown): { success: boolean; data?: unknown; error?: { issues: { path: (string | number)[]; message: string }[] } } } };

/** dispatch 的宽松 payload 面（request schema 已校验，这里只取字段）。 */
interface RpcPayload {
  readonly id?: string;
  readonly runId?: string;
  readonly callId?: string;
  readonly articleId?: string;
  readonly enabled?: boolean;
  readonly limit?: number;
  readonly rank?: number;
  readonly url?: string;
  readonly ref?: string;
  readonly value?: string;
  readonly params?: RunParams;
  readonly slug?: string;
  readonly title?: string;
  readonly digest?: string;
  readonly markdown?: string;
  readonly text?: string;
  readonly instruction?: string;
  readonly theme?: string;
  readonly name?: string;
  readonly rrule?: string;
  readonly timeZone?: string;
}

async function dispatch(service: WeWriteService, endpoint: RpcEndpoint, payload: RpcPayload): Promise<unknown> {
  switch (endpoint) {
    case 'snapshot':
      return service.snapshot();
    case 'hotspots/fetch':
      return service.fetchHotspots(payload.limit ?? 20);
    case 'hotspots/digestItem':
      return service.digestHotspotItem({
        rank: Number(payload.rank),
        title: String(payload.title),
        url: String(payload.url),
      });
    case 'article/list':
      return service.listArticles();
    case 'article/get':
      return service.getArticle(String(payload.id));
    case 'article/save':
      return service.saveArticle({
        ...(payload.id ? { id: payload.id } : {}),
        slug: String(payload.slug),
        title: String(payload.title),
        digest: String(payload.digest),
        markdown: String(payload.markdown),
        theme: String(payload.theme),
      });
    case 'article/delete':
      return service.deleteArticle(String(payload.id));
    case 'article/preview':
      return service.previewArticle(
        payload.id ? { id: payload.id } : { markdown: String(payload.markdown), theme: String(payload.theme) },
      );
    case 'article/rewrite':
      return service.rewriteText({
        text: String(payload.text),
        instruction: String(payload.instruction),
        ...(payload.title !== undefined ? { title: String(payload.title) } : {}),
      });
    case 'run/start':
      return service.startRun({
        trigger: 'manual',
        params: payload.params as RunParams,
        ...(payload.articleId ? { articleId: payload.articleId } : {}),
      });
    case 'run/cancel':
      return service.cancelRun(String(payload.runId));
    case 'run/detail':
      // runId/callId 二选一（M2 运行卡 callId 兜底链）；request schema 已保证其一非空
      return service.runDetail(payload.runId ? { runId: String(payload.runId) } : { callId: String(payload.callId) });
    case 'schedule/save':
      return service.saveSchedule({
        ...(payload.id ? { id: payload.id } : {}),
        name: String(payload.name),
        rrule: String(payload.rrule),
        timeZone: String(payload.timeZone),
        params: payload.params as RunParams,
        enabled: Boolean(payload.enabled),
      });
    case 'schedule/delete':
      return service.deleteSchedule(String(payload.id));
    case 'schedule/toggle':
      return service.toggleSchedule(String(payload.id), Boolean(payload.enabled));
    case 'schedule/runNow':
      return service.runScheduleNow(String(payload.id));
    case 'config/get':
      return service.getConfig();
    case 'config/set':
      return service.setConfig(payload as unknown as Record<string, unknown>);
    case 'credentials/set':
      return service.setCredential(String(payload.ref), String(payload.value));
    case 'credentials/describe':
      return service.describeCredentials();
    case 'llm/options':
      return service.listLlmOptions();
    case 'wechat/pushDraft':
      return service.pushArticleDraft(String(payload.articleId));
    case 'wechat/diagnose':
      return service.diagnoseWeChat();
    default:
      throw new Error(`未知端点：${endpoint satisfies never}`);
  }
}

/**
 * 平台契约（P0，2026-08-20 QA 实测确诊）：DSH 宿主 dsh-client-connection 的
 * rpcResultSchema 对 result 做联合校验，error.code 必须落在宿主 rpcErrorSchema 的
 * code 枚举内，且**每个分支都必填 details 字段**（枚举清单从宿主包实测核对：
 * ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js 的
 * rpcErrorSchema discriminatedUnion，共 39 个——bad-request / cancelled /
 * session-not-found / model-unavailable / session-conflict / invalid-time-zone /
 * workspace-attach-failed / workspace-not-found / workspace-invalid-path /
 * workspace-name-conflict / workspace-move-invalid / directory-unreadable /
 * directory-exists / directory-create-failed / directory-picker-unavailable /
 * agent-preset-read-only / agent-preset-locked / agent-preset-conflict /
 * agent-preset-not-found / agent-preset-invalid / agent-busy / attachment-error /
 * queue-item-not-found / steer-unavailable / command-error / unknown-command /
 * settings-rejected / settings-conflict / credential-rejected /
 * model-discovery-failed / title-invalid / fork-unavailable /
 * subagent-parent-unavailable / subagent-not-found / subagent-catalog-diagnostic /
 * subagent-not-resumable / subagent-unauthorized / subagent-delivery-unavailable /
 * internal）。
 * 除 internal / cancelled / command-error / unknown-command 四个 details:object({})
 * 分支外，其余分支的 details 都带必填结构化字段（如 bad-request 要 {issues:[]}、
 * session-not-found 要 {sessionId}），插件侧无法恒满足。插件自有码
 * （PI_AI_ERROR / digest-timeout / llm-not-configured / …）不在枚举内 → 宿主整包
 * 拒收，zod invalid_union 全文（~1.7KB）直接泄漏成用户看到的错误消息
 * （tests/e2e/artifacts/qa-digest/qa-digest-report.json item-01）。
 * 收敛策略：信封 code 统一 'internal' + details:{}（恒过校验），真实 code 以
 * '[code] ' 前缀保留进 message——客户端按 message 展示，前端按前缀映射错误文案。
 */
/** 宿主枚举内且 details 形状插件恒能满足的 code（details: object({}) 分支）。 */
const HOST_RPC_ERROR_CODE = 'internal';

/** 插件错误 → 宿主白名单错误信封：code 收敛 internal，真实 code 进 message 前缀。 */
function toHostRpcErrorEnvelope(
  error: unknown,
  truncate: (text: string) => string,
): { ok: false; error: { code: typeof HOST_RPC_ERROR_CODE; message: string; details: Record<string, never> } } {
  const rawCode = typeof (error as { code?: unknown })?.code === 'string' && (error as { code?: unknown }).code
    ? (error as { code: string }).code
    : 'rpc-failed';
  const message = truncate(error instanceof Error ? error.message : String(error));
  return {
    ok: false,
    error: {
      code: HOST_RPC_ERROR_CODE,
      message: rawCode === HOST_RPC_ERROR_CODE ? message : `[${rawCode}] ${message}`,
      details: {},
    },
  };
}

/** 注册 loopback 通道；rpc 服务缺失时降级为 no-op + 警告（架构 §9.1）。 */
export function registerWewriteRpc(
  rpc: ConnectionRpcService | undefined,
  service: WeWriteService,
  logger?: HostLogger,
): Promise<() => void> {
  if (!rpc) {
    logger?.warn('dsh-wewrite: connection.rpc 服务缺失，Web 面板不可用（Agent 工具仍可用）');
    return Promise.resolve(() => undefined);
  }
  const truncate = (text: string): string => (text.length > 500 ? `${text.slice(0, 500)}…` : text);

  const registered = rpc.handle(
    RPC_CHANNEL,
    async (endpoint: string, payload: unknown) => {
      const entry = (rpcContract as Record<string, ContractEntry | undefined>)[endpoint];
      if (!entry) throw new Error(`未知端点：${endpoint}`);
      const parsedRequest = entry.request.safeParse(payload ?? {});
      if (!parsedRequest.success || parsedRequest.data === undefined) {
        const issues = parsedRequest.error?.issues ?? [];
        throw new Error(`请求校验失败（${endpoint}）：${issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
      }
      // 平台 RPC 信封契约（dsh-automation 真身）：handler 返回 {ok:true,value} /
      // {ok:false,error:{code,message}}——裸值会在客户端 result 联合校验处炸（2026-08-19 实测）。
      try {
        const result = await dispatch(service, endpoint as RpcEndpoint, parsedRequest.data as RpcPayload);
        const checked = entry.response.safeParse(result);
        if (!checked.success || checked.data === undefined) {
          const issues = checked.error?.issues ?? [];
          throw new Error(`响应形状漂移（${endpoint}）：${issues[0] ? `${issues[0].path.join('.')}: ${issues[0].message}` : '未知问题'}`);
        }
        return { ok: true as const, value: checked.data };
      } catch (error) {
        return toHostRpcErrorEnvelope(error, truncate);
      }
    },
    { authority: RPC_AUTHORITY },
  );
  if (typeof registered === 'function') return Promise.resolve(registered);
  return registered.then((dispose) => dispose ?? (() => undefined));
}
