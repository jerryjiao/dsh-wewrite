import { describe, expect, it } from 'vitest';
import { describeRpcFailure } from '@/client/lib/rpc';

/**
 * describeRpcFailure 兜底回归（QA qa-digest 修复，2026-08-20）：
 * message 形如序列化 JSON（以 [ 或 { 开头且 >200 字符）时回退通用标题，
 * 不把宿主信封校验失败的 zod JSON 墙透传给用户；既有分类行为保持不变。
 */

const JSON_WALL = `[ { "code": "invalid_union", "errors": [ [ { "code": "invalid_value", "values": [ true ], "path": [ "ok" ] } ] ], "path": [ "result" ], "message": "Invalid input" } ]${'x'.repeat(300)}`;

describe('describeRpcFailure：JSON 墙兜底', () => {
  it('message 为 zod JSON 墙（>200 字符）→ 通用标题，不透传墙', () => {
    const notice = describeRpcFailure(new Error(JSON_WALL));
    expect(notice.title).toBe('请求失败。');
    expect(notice.title).not.toContain('invalid_union');
    expect(notice.ipWhitelist).toBe(false);
  });

  it('结构化对象形态的墙同样兜底', () => {
    const notice = describeRpcFailure({ message: JSON_WALL });
    expect(notice.title).toBe('请求失败。');
  });

  it('正常 message 仍透传（回归）', () => {
    const notice = describeRpcFailure(new Error('草稿箱推送失败：appsecret 无效'));
    expect(notice.title).toBe('草稿箱推送失败：appsecret 无效');
  });

  it('短前缀 message（[PI_AI_ERROR] 形态）不触发墙兜底，正常透传', () => {
    const notice = describeRpcFailure(new Error('[PI_AI_ERROR] Provider finish_reason: sensitive'));
    expect(notice.title).toBe('[PI_AI_ERROR] Provider finish_reason: sensitive');
  });
});

describe('describeRpcFailure：既有分类回归', () => {
  it('errcode 40164 → IP 白名单文案 + ipWhitelist 动作', () => {
    const notice = describeRpcFailure(Object.assign(new Error('bad ip'), { errcode: 40164, egressIp: '1.2.3.4' }));
    expect(notice.title).toContain('1.2.3.4');
    expect(notice.ipWhitelist).toBe(true);
  });

  it('classification=RATE_LIMIT → 限频文案', () => {
    const notice = describeRpcFailure(Object.assign(new Error('limited'), { classification: 'RATE_LIMIT' }));
    expect(notice.title).toBe('触发微信接口限频，稍后自动恢复。');
  });

  it('classification=TIMEOUT → 超时文案', () => {
    const notice = describeRpcFailure(Object.assign(new Error('slow'), { classification: 'TIMEOUT' }));
    expect(notice.title).toBe('无法访问微信接口（超时）。');
  });
});
