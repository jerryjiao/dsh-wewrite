import { describe, expect, it } from 'vitest';
import {
  clearDigestFailure,
  describeDigestError,
  looksLikeSerializedJson,
  recallDigestFailure,
  rememberDigestFailure,
} from '@/client/lib/digest-errors';

/**
 * 热榜逐条 AI 速览错误 UX（QA qa-digest 确诊修复，2026-08-20）：
 * - describeDigestError：LLM 错误 message → 中文人话文案（sensitive/1305/限流/超时/
 *   未配置/空返回），zod JSON 墙（~1.7KB 透传）兜底通用文案，真实 message 截断进 hint。
 * - 当日失败记忆 Map：URL → message 记/取/清生命周期。
 * message 形态锚定后端信封收口后的 `[PI_AI_ERROR] Provider finish_reason: sensitive`。
 */

/** QA 报告实测的 zod JSON 墙形态（截取到 >200 字符）。 */
const JSON_WALL = [
  '[ { "code": "invalid_union", "errors": [ [ { "code": "invalid_value", "values": [ true ], "path": [ "ok" ], "message": "Invalid input: expected true" } ],',
  '  [ { "code": "invalid_union", "errors": [], "note": "No matching discriminator", "discriminator": "code", "options": [ "bad-request", "cancelled", "session-not-found" ] } ] ],',
  '  "path": [ "result" ], "message": "Invalid input" } ]',
].join('\n');

describe('describeDigestError：LLM 错误人话映射', () => {
  it('内容过滤（finish_reason: sensitive）→ 安全过滤文案', () => {
    const notice = describeDigestError('[PI_AI_ERROR] Provider finish_reason: sensitive');
    expect(notice.title).toBe('这条内容被模型安全过滤，跳过或稍后再试。');
    expect(notice.hint).toBe('[PI_AI_ERROR] Provider finish_reason: sensitive');
  });

  it('信封 code 1301 → 安全过滤文案', () => {
    expect(describeDigestError('[1301] 内容含敏感信息').title).toBe('这条内容被模型安全过滤，跳过或稍后再试。');
  });

  it('1305 / 拥挤 → 拥挤文案', () => {
    expect(describeDigestError('[1305] 模型负载高').title).toBe('模型当前拥挤，稍后再试。');
    expect(describeDigestError('服务拥挤，排队中').title).toBe('模型当前拥挤，稍后再试。');
  });

  it('RATE_LIMIT / 429 → 限流文案', () => {
    expect(describeDigestError('[RATE_LIMIT] too many requests').title).toBe('触发限流，稍后再试。');
    expect(describeDigestError('HTTP 429').title).toBe('触发限流，稍后再试。');
  });

  it('digest-timeout / timeout / 超时 → 超时文案', () => {
    expect(describeDigestError('[DIGEST_TIMEOUT] 超过 30s').title).toBe('速览生成超时，请重试。');
    expect(describeDigestError('request timeout').title).toBe('速览生成超时，请重试。');
    expect(describeDigestError('生成超时').title).toBe('速览生成超时，请重试。');
  });

  it('llm-not-configured → 去设置选模型指引', () => {
    expect(describeDigestError('[LLM_NOT_CONFIGURED] no model selected').title).toBe('还没选择生成模型——到设置里选一个模型后再试。');
  });

  it('digest-empty → 模型未返回内容', () => {
    expect(describeDigestError('[DIGEST_EMPTY] provider returned empty').title).toBe('模型未返回内容，请重试。');
  });

  it('zod JSON 墙（QA 实测形态）→ 通用文案且不带墙 hint', () => {
    const notice = describeDigestError(JSON_WALL);
    expect(notice.title).toBe('速览生成失败，请重试。');
    expect(notice.hint).toBeUndefined();
  });

  it('未知 message → 通用文案 + 原文 hint', () => {
    const notice = describeDigestError('provider connection reset');
    expect(notice.title).toBe('速览生成失败，请重试。');
    expect(notice.hint).toBe('provider connection reset');
  });

  it('hint 超长截断到 160 字 + 省略号', () => {
    const long = 'x'.repeat(300);
    const notice = describeDigestError(long);
    expect(notice.hint).toHaveLength(161);
    expect(notice.hint?.endsWith('…')).toBe(true);
  });

  it('短 [CODE] 前缀形态不误判为 JSON 墙', () => {
    expect(looksLikeSerializedJson('[PI_AI_ERROR] Provider finish_reason: sensitive')).toBe(false);
    expect(looksLikeSerializedJson(JSON_WALL)).toBe(true);
    // 短 JSON（如 "[1,2]"）不算墙——长度门槛 200
    expect(looksLikeSerializedJson('{"ok":false}')).toBe(false);
  });
});

describe('当日失败记忆（模块级 Map）', () => {
  it('remember → recall 命中；clear 后不再命中', () => {
    const url = 'https://example.test/failure-map';
    rememberDigestFailure(url, '[PI_AI_ERROR] Provider finish_reason: sensitive');
    expect(recallDigestFailure(url)).toBe('[PI_AI_ERROR] Provider finish_reason: sensitive');
    clearDigestFailure(url);
    expect(recallDigestFailure(url)).toBeUndefined();
  });

  it('clear 未记录的 URL 是幂等 no-op', () => {
    expect(() => clearDigestFailure('https://example.test/never-failed')).not.toThrow();
  });
});
