/**
 * wewrite_rewrite / wewrite_push_draft（Spec §5 / architecture §4.2）。
 * rewrite：透传 service.rewriteText（既有 45s 超时语义保留），返回值携带改写全文
 * ——模型需要看到改写结果才能继续对话。push：执行前先过审批 armed 复查（fail-closed D14②）。
 */
import type { WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
import type { PushApprovalHandle } from './push-approval';
export declare function buildRewriteTool(service: WeWriteService): WewriteToolDefinition;
export declare function buildPushTool(service: WeWriteService, approval: PushApprovalHandle): WewriteToolDefinition;
