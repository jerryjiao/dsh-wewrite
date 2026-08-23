/**
 * 工具定义共用构件（architecture §4.1 / ADR-011）：手构结构体的组装件。
 * 全部纯函数——render/presentCall/presentResult 禁访问 service（AC-M1-11 流式与回放共用）。
 */
import type { TextBlock, ToolCallView, ToolResultView } from '../platform';
/** object-root JsonSchemaNode 构造（canonical value 形状声明）。 */
export declare function jsonSchema(properties: Record<string, Record<string, unknown>>, required?: readonly string[]): Record<string, unknown>;
/** ContentBlock = {type:'text',text}（dsh-llm types.d.ts:39-42）；空行自动剔除。 */
export declare function textBlocks(...lines: readonly string[]): TextBlock[];
/** 工具结构化错误（不抛异常——AC-M1-03「结构化错误码」语义）。 */
export declare function toolError(code: string, message: string): {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
export type ToolErrorValue = ReturnType<typeof toolError>;
export declare function isToolError(value: unknown): value is ToolErrorValue;
/** 宽松 args 收窄（模型侧参数不保证形状；键缺失不炸）。 */
export declare function asArgsRecord(args: unknown): Record<string, unknown>;
export declare function optionalString(value: unknown): string | undefined;
/** 错误 → {code,message}（service 错误带 code 原样透传，兜底 fallbackCode）。 */
export declare function errorToCodeMessage(error: unknown, fallbackCode: string): {
    code: string;
    message: string;
};
/** presenter 侧 generic 卡组装（ADR-012：只用 generic+text）。 */
export declare function callView(kind: ToolCallView['kind'], title: string, rawInput?: Record<string, unknown>): ToolCallView;
export declare function resultView(title: string, content: readonly TextBlock[]): ToolResultView;
