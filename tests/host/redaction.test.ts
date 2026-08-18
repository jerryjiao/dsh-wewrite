import { describe, expect, it } from 'vitest';
import { maskSecret, redactKeys, redactText, truncateMessage } from '@/host/redaction';

/**
 * 日志脱敏器测试（AC-13）：secret / access_token / API key 出现即掩码，保留 <=4 字符可见。
 *
 * 本文件钉定 src/host/redaction.ts 消费面与掩码规则：
 * - maskSecret: 长度 <=8 全掩 '****'；长度 >8 保留前 4 字符 + '****'（可见字符恒 <=4）
 * - redactText(text, secrets): 已知 secret 值在文本中的全部出现替换为其掩码
 * - redactKeys(value): 深遍历，敏感键名（含嵌套与数组内对象）的值替换为 '[redacted]'，纯函数不改原对象
 * - truncateMessage(message, max=500): 超长错误消息截断（架构 §8 规则三）
 */

describe('maskSecret（AC-13：保留 <=4 字符可见）', () => {
  it('长 secret（>8 字符）保留前 4 字符 + 掩码尾', () => {
    expect(maskSecret('abcdefghijklmnopqrstuvwxyz')).toBe('abcd****');
  });

  it('恰 9 字符：保留前 4', () => {
    expect(maskSecret('123456789')).toBe('1234****');
  });

  it('短 secret（<=8 字符）全掩：长度 8/5/1 均为 ****', () => {
    expect(maskSecret('12345678')).toBe('****');
    expect(maskSecret('12345')).toBe('****');
    expect(maskSecret('x')).toBe('****');
  });

  it('掩码输出永不包含原始值的第 5 个及以后字符', () => {
    const secret = 'sk-abcdef123456';
    const masked = maskSecret(secret);
    expect(masked.length).toBeLessThanOrEqual(secret.length);
    expect(masked).not.toContain('abcdef');
    expect(masked).not.toContain('123456');
  });
});

describe('redactText（已知 secret 值扫描替换）', () => {
  it('token 响应日志：access_token 值被替换，errcode 保留（架构 §8 规则二）', () => {
    const text = '{"access_token":"ACCESS_TOKEN_64_CHARS_LONG","errcode":0,"expires_in":7200}';
    const redacted = redactText(text, ['ACCESS_TOKEN_64_CHARS_LONG']);
    expect(redacted).not.toContain('ACCESS_TOKEN_64_CHARS_LONG');
    expect(redacted).toContain('ACCE****');
    expect(redacted).toContain('"errcode":0');
  });

  it('同一 secret 多次出现全部替换', () => {
    const secret = 'wx_secret_value_9876543210';
    const text = `first=${secret} second=${secret}`;
    const redacted = redactText(text, [secret]);
    expect(redacted.match(/wx_s\*\*\*\*/g)?.length).toBe(2);
    expect(redacted).not.toContain(secret);
  });

  it('多个 secret 各自替换为各自掩码', () => {
    const redacted = redactText('a=APIKEYFIRST12345 b=APIKEYSECOND67890', ['APIKEYFIRST12345', 'APIKEYSECOND67890']);
    expect(redacted).toContain('APIK****');
    expect(redacted).not.toContain('APIKEYFIRST12345');
    expect(redacted).not.toContain('APIKEYSECOND67890');
  });

  it('空 secret 列表：原文原样返回', () => {
    const text = 'plain log line with nothing sensitive';
    expect(redactText(text, [])).toBe(text);
  });

  it('secret 不在文本中出现：原文不变', () => {
    const text = 'normal content';
    expect(redactText(text, ['NOT_PRESENT_SECRET'])).toBe(text);
  });
});

describe('redactKeys（键名匹配脱敏，深遍历）', () => {
  it('authorization/api_key/access_token/secret/password 键的值替换为 [redacted]', () => {
    const input = {
      authorization: 'Bearer sk-live-123456',
      nested: {
        api_key: 'rk-987654321',
        access_token: 'TOKEN_XYZ_9876',
        secret: 's3cr3t',
        password: 'hunter2',
      },
      keepMe: 'plain value',
      count: 42,
    };
    const output = redactKeys(input) as Record<string, unknown>;
    expect(output.authorization).toBe('[redacted]');
    const nested = output.nested as Record<string, unknown>;
    expect(nested.api_key).toBe('[redacted]');
    expect(nested.access_token).toBe('[redacted]');
    expect(nested.secret).toBe('[redacted]');
    expect(nested.password).toBe('[redacted]');
    expect(output.keepMe).toBe('plain value');
    expect(output.count).toBe(42);
  });

  it('数组内对象的敏感键同样脱敏（steps[].metrics 场景）', () => {
    const input = { steps: [{ name: 'draft', metrics: { apiKey: 'sk-111222333' } }] };
    const output = redactKeys(input) as { steps: Array<{ name: string; metrics: { apiKey: unknown } }> };
    expect(output.steps[0].metrics.apiKey).toBe('[redacted]');
    expect(output.steps[0].name).toBe('draft');
  });

  it('纯函数：返回新对象，原对象不被修改', () => {
    const input = { secret: 'ORIGINAL_VALUE' };
    const output = redactKeys(input) as { secret: string };
    expect(output.secret).toBe('[redacted]');
    expect(input.secret).toBe('ORIGINAL_VALUE');
  });

  it('键名大小写与连字符变体同样命中（API-Key / X-Auth-Token 形态）', () => {
    const input = { 'API-Key': 'v1', 'X-Auth-Token': 'v2', NormalKey: 'v3' };
    const output = redactKeys(input) as Record<string, unknown>;
    expect(output['API-Key']).toBe('[redacted]');
    expect(output['X-Auth-Token']).toBe('[redacted]');
    expect(output.NormalKey).toBe('v3');
  });
});

describe('truncateMessage（架构 §8 规则三：provider 错误消息截断）', () => {
  it('超过 500 字符截断到 500，默认上限 500', () => {
    const long = 'x'.repeat(600);
    expect(truncateMessage(long).length).toBe(500);
  });

  it('恰 500 与不足 500 原样返回', () => {
    expect(truncateMessage('y'.repeat(500))).toBe('y'.repeat(500));
    expect(truncateMessage('short message')).toBe('short message');
  });

  it('自定义上限生效', () => {
    expect(truncateMessage('abcdefghij', 5).length).toBe(5);
  });
});
