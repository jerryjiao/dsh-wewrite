/**
 * wewrite_run 工具（Spec §5 / architecture §4.2）：启动管线并等到终态才 settle。
 * abort 转发：exec.signal → service.cancelRun（D11）；参数非法返回结构化错误不抛异常。
 */
import type { WewriteToolDefinition } from '../platform';
import type { WeWriteService } from '../service';
export declare function buildRunTool(service: WeWriteService): WewriteToolDefinition;
