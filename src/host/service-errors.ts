/**
 * service 层错误类型：带 code，供 RPC/tools 归一化为结构化失败。
 */

export class WewriteServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'WewriteServiceError';
  }
}

export function toServiceError(error: unknown): WewriteServiceError {
  if (error instanceof WewriteServiceError) return error;
  const message = error instanceof Error ? error.message : String(error ?? '未知错误');
  return new WewriteServiceError('internal', message);
}
