import { describe, expect, it } from 'vitest';
import {
  classifyErrcode,
  extractExitIp,
  hintForClassification,
  hintForErrcode,
  ipWhitelistHint,
  WeChatApiError,
  type WeChatClassification,
} from '@/host/wechat/diagnostics';
import { WECHAT_FAILURE_CLASSES } from '@/shared/schema-base';

/**
 * diagnostics 单元面：errcode → 分类 → 文案。
 * 钉死三件事：48001 归 PERMISSION（不再是 RATE_LIMIT）且给专属出路；
 * 42001 保持 AUTH（transient，真正修复在 client 换 token 重试）但文案说清「已自动重试」；
 * 40164 的两条出路（加白名单 / 配代理）与出口 IP 提取原样保留。
 */

describe('classifyErrcode：分类与 shared 枚举对齐', () => {
  it('WeChatClassification 接纳 WECHAT_FAILURE_CLASSES 全部值（值集合编译期一致，无自定义字符串）', () => {
    const all: readonly WeChatClassification[] = WECHAT_FAILURE_CLASSES;
    expect(all).toEqual(['IP_WHITELIST', 'AUTH', 'PERMISSION', 'RATE_LIMIT', 'SYSTEM', 'TIMEOUT', 'NETWORK', 'UNKNOWN']);
  });

  it('48001（api unauthorized）→ PERMISSION：是权限问题，不是限频', () => {
    expect(classifyErrcode(48001)).toBe('PERMISSION');
    expect(classifyErrcode(48001)).not.toBe('RATE_LIMIT');
  });

  it('限频码不受影响：45009/45011 仍是 RATE_LIMIT', () => {
    expect(classifyErrcode(45009)).toBe('RATE_LIMIT');
    expect(classifyErrcode(45011)).toBe('RATE_LIMIT');
  });

  it('42001 保持 AUTH（transient 处理：修复在 client 重试，不在分类）', () => {
    expect(classifyErrcode(42001)).toBe('AUTH');
  });

  it('既有分类回归：40164 → IP_WHITELIST，-1/5xx 及以上 → SYSTEM，未映射小号段（1-499）→ UNKNOWN', () => {
    expect(classifyErrcode(40164)).toBe('IP_WHITELIST');
    expect(classifyErrcode(-1)).toBe('SYSTEM');
    expect(classifyErrcode(500)).toBe('SYSTEM');
    expect(classifyErrcode(444)).toBe('UNKNOWN');
  });
});

describe('hint 文案', () => {
  it('PERMISSION 专属出路：点明账号类型限制，给出认证 / 换号两条去路', () => {
    const hint = hintForClassification('PERMISSION');
    expect(hint).toContain('草稿箱权限');
    expect(hint).toContain('mp.weixin.qq.com');
    expect(hint).toContain('认证');
    expect(hint).toContain('换');
  });

  it('42001 errcode 专属文案优先于 AUTH 分类文案，说清「已自动重试」', () => {
    const hint = hintForErrcode(42001);
    expect(hint).toBeDefined();
    expect(hint).toContain('登录态过期');
    expect(hint).toContain('已自动重试');
    expect(hint).not.toBe(hintForClassification('AUTH'));
  });

  it('非专属 errcode 无 errcode 级文案（回落分类文案）', () => {
    expect(hintForErrcode(40001)).toBeUndefined();
    expect(hintForErrcode(45009)).toBeUndefined();
  });

  it('40164 两条出路保留：加白名单 / 配代理，且带出口 IP', () => {
    const hint = ipWhitelistHint('203.0.113.7');
    expect(hint).toContain('203.0.113.7');
    expect(hint).toContain('白名单');
    expect(hint).toContain('代理');
  });

  it('TIMEOUT 分类有专属出路文案', () => {
    expect(hintForClassification('TIMEOUT')).toContain('超时');
  });
});

describe('WeChatApiError（类本体在 diagnostics，client re-export）', () => {
  it('携带 errcode / classification / hint，且是 Error 子类', () => {
    const error = new WeChatApiError(48001, 'PERMISSION', hintForClassification('PERMISSION'));
    expect(error.errcode).toBe(48001);
    expect(error.classification).toBe('PERMISSION');
    expect(error.hint).toContain('认证');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WeChatApiError');
  });
});

describe('extractExitIp', () => {
  it('从 errmsg 回显中取出口 IP', () => {
    expect(extractExitIp('invalid ip 203.0.113.7 ipv6 ::ffff:203.0.113.7, not in whitelist')).toBe('203.0.113.7');
  });

  it('无回显时返回 undefined', () => {
    expect(extractExitIp('some other error')).toBeUndefined();
  });
});
