/**
 * 日志与错误脱敏器（AC-13 / 架构 §8 三条硬规则）。
 * 纯函数集合，无副作用——host 侧所有 logger 输出与错误消息上抛前过这里。
 */

/** 掩码规则（QA 契约 §7.2-3）：长度 <=8 全掩（短值全掩防泄露）；>8 保留前 4 字符 + '****'。 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}****`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 已知 secret 值在文本中的全部出现替换为各自掩码（架构 §8 规则二：token 响应只记 errcode）。 */
export function redactText(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (!secret) continue;
    result = result.replace(new RegExp(escapeRegExp(secret), 'g'), maskSecret(secret));
  }
  return result;
}

/** 敏感键名命中集：键名小写并剥除非字母数字后做子串匹配（覆盖 API-Key / X-Auth-Token 等变体）。 */
const SENSITIVE_KEY_FRAGMENTS = ['secret', 'password', 'apikey', 'authorization', 'token'] as const;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/** 深遍历对象/数组，敏感键的值替换为 '[redacted]'。纯函数：返回新结构，原对象不动。 */
export function redactKeys<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? '[redacted]' : redactValue(item);
    }
    return output;
  }
  return value;
}

/** provider 错误消息截断（架构 §8 规则三：截断 500 字符并剥离 header 回显由调用方配合）。 */
export function truncateMessage(message: string, max = 500): string {
  return message.length <= max ? message : message.slice(0, max);
}
