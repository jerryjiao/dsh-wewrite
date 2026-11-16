import { describe, expect, it } from 'vitest';
import { describePushFailure, describeRpcFailure } from '@/client/lib/rpc';

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

describe('describePushFailure：数据面失败 → 文案与直达动作（v0.5.6）', () => {
  it('48001/PERMISSION → 「公众号没有草稿箱权限」+ 去公众号后台外链，不跳设置', () => {
    const notice = describePushFailure({
      reason: 'wechat-api',
      message: '微信 API 错误 48001：api unauthorized',
      classification: 'PERMISSION',
      hint: '你的公众号类型没有草稿箱权限：未认证的订阅号/测试号没有草稿箱 API 权限。去 mp.weixin.qq.com 认证，或换已认证的号再推。',
    });
    expect(notice.title).toBe('公众号没有草稿箱权限。');
    expect(notice.openBackend).toBe(true);
    expect(notice.settingsNavigate).toBeFalsy();
    expect(notice.hint).toContain('认证');
  });

  it('IP_WHITELIST → 标题带回显 IP + 跳设置（配代理）+ 后台外链（加白名单）', () => {
    const notice = describePushFailure({
      reason: 'wechat-api',
      message: '微信 API 错误 40164',
      classification: 'IP_WHITELIST',
      egressIp: '203.0.113.7',
      settingsTarget: 'proxy',
      hint: '两条出路任选其一',
    });
    expect(notice.title).toContain('203.0.113.7');
    expect(notice.title).toContain('不在白名单');
    expect(notice.settingsNavigate).toBe(true);
    expect(notice.openBackend).toBe(true);
  });

  it('IP_WHITELIST 无回显 IP 时退化为通用标题，仍给两个动作', () => {
    const notice = describePushFailure({ reason: 'wechat-api', message: '微信 API 错误 40164', classification: 'IP_WHITELIST' });
    expect(notice.title).toBe('出口 IP 不在白名单。');
    expect(notice.settingsNavigate).toBe(true);
    expect(notice.openBackend).toBe(true);
  });

  it('AUTH → 「公众号连接失效」+ 跳设置，不给后台外链', () => {
    const notice = describePushFailure({
      reason: 'wechat-api',
      message: '微信 API 错误 40001',
      classification: 'AUTH',
      settingsTarget: 'wechat',
      hint: '请核对设置页的 AppID 与 Secret',
    });
    expect(notice.title).toBe('公众号连接失效。');
    expect(notice.settingsNavigate).toBe(true);
    expect(notice.openBackend).toBeFalsy();
    expect(notice.hint).toContain('AppID');
  });

  it('TIMEOUT / NETWORK → 「网络不通/超时」', () => {
    const timeoutNotice = describePushFailure({
      reason: 'wechat-api',
      message: '微信接口 20 秒无响应，已中止',
      classification: 'TIMEOUT',
    });
    const networkNotice = describePushFailure({
      reason: 'wechat-api',
      message: '微信 API 网络请求失败：fetch failed',
      classification: 'NETWORK',
    });
    expect(timeoutNotice.title).toContain('网络不通/超时');
    expect(networkNotice.title).toContain('网络不通/超时');
    expect(timeoutNotice.settingsNavigate).toBeFalsy();
    expect(timeoutNotice.openBackend).toBeFalsy();
  });

  it('RATE_LIMIT → 限频文案', () => {
    const notice = describePushFailure({ reason: 'wechat-api', message: '微信 API 错误 45009', classification: 'RATE_LIMIT' });
    expect(notice.title).toContain('限频');
  });

  it('SYSTEM/UNKNOWN → 透传宿主人话 message 兜底', () => {
    const notice = describePushFailure({
      reason: 'wechat-api',
      message: '微信返回了非 JSON 响应（可能被代理/网关拦截）',
      classification: 'SYSTEM',
    });
    expect(notice.title).toContain('非 JSON');
  });

  it('cover-missing → 「缺封面」+ 跳设置（宿主带 settingsTarget=image）', () => {
    const notice = describePushFailure({
      reason: 'cover-missing',
      message: '缺少封面图：微信草稿必须带封面。',
      settingsTarget: 'image',
      hint: '在编辑器顶部「封面」处点「生成封面」或「上传封面」',
    });
    expect(notice.title).toContain('缺封面');
    expect(notice.settingsNavigate).toBe(true);
  });

  it('no-credentials → 「公众号还没连接」+ 跳设置', () => {
    const notice = describePushFailure({ reason: 'no-credentials', message: '公众号 AppID / AppSecret 还没配。' });
    expect(notice.title).toContain('公众号还没连接');
    expect(notice.settingsNavigate).toBe(true);
  });

  it('gates-not-passed / article-not-found → 各自标题，无直达动作', () => {
    const gates = describePushFailure({ reason: 'gates-not-passed', message: '质量门禁未过' });
    expect(gates.title).toContain('门禁');
    expect(gates.settingsNavigate).toBeFalsy();
    const missing = describePushFailure({ reason: 'article-not-found', message: '文章不存在：a-1' });
    expect(missing.title).toContain('不存在');
    expect(missing.openBackend).toBeFalsy();
  });
});
