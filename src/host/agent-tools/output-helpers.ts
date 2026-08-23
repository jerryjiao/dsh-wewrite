/**
 * 工具定义共用构件（architecture §4.1 / ADR-011）：手构结构体的组装件。
 * 全部纯函数——render/presentCall/presentResult 禁访问 service（AC-M1-11 流式与回放共用）。
 */

import type { TextBlock, ToolCallView, ToolResultView } from '../platform';

/** object-root JsonSchemaNode 构造（canonical value 形状声明）。 */
export function jsonSchema(
  properties: Record<string, Record<string, unknown>>,
  required: readonly string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required: [...required] } : {}),
  };
}

/** ContentBlock = {type:'text',text}（dsh-llm types.d.ts:39-42）；空行自动剔除。 */
export function textBlocks(...lines: readonly string[]): TextBlock[] {
  return lines.filter((line) => line !== '').map((text) => ({ type: 'text' as const, text }));
}

/** 工具结构化错误（不抛异常——AC-M1-03「结构化错误码」语义）。 */
export function toolError(code: string, message: string): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } };
}

export type ToolErrorValue = ReturnType<typeof toolError>;

export function isToolError(value: unknown): value is ToolErrorValue {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
}

/** 宽松 args 收窄（模型侧参数不保证形状；键缺失不炸）。 */
export function asArgsRecord(args: unknown): Record<string, unknown> {
  return typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** 错误 → {code,message}（service 错误带 code 原样透传，兜底 fallbackCode）。 */
export function errorToCodeMessage(error: unknown, fallbackCode: string): { code: string; message: string } {
  const code = error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : fallbackCode;
  const message = error instanceof Error ? error.message : String(error ?? '未知错误');
  return { code, message };
}

/** presenter 侧 generic 卡组装（ADR-012：只用 generic+text）。 */
export function callView(kind: ToolCallView['kind'], title: string, rawInput?: Record<string, unknown>): ToolCallView {
  return { card: 'generic', kind, title, ...(rawInput ? { rawInput } : {}) };
}

export function resultView(title: string, content: readonly TextBlock[]): ToolResultView {
  return { card: 'generic', title, content: [...content] };
}
