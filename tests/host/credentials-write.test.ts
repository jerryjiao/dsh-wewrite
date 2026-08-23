import { describe, expect, it } from 'vitest';
import { WeWriteService } from '@/host/service';
import { WewriteServiceError } from '@/host/service-errors';
import { CredentialsDescriptorSchema } from '@/shared/contract';
import { makeCredentials, makeLlm, MemoryDomain, silentLogger } from './service-harness';

/**
 * AC-5 凭据 write-only + 掩码回显 service 层回归（qa-test-plan §10-1 补齐）：
 * When 保存凭据，仅写 credentials 服务（本地 storage/credentials 语义），
 * 任何读面（config/snapshot）不回原文，描述符仅 configured/writable。
 *
 * 覆盖分层说明（qa-test-plan §10-1）：「前4后4 掩码」的像素级渲染属 client 组件，
 * 本仓无 DOM 测试基建（vitest 纯 node 环境、无 @testing-library），故按计划在
 * service/contract 层覆盖：掩码函数 maskSecret 已由 redaction.test.ts 锁定；
 * 本文件锁「UI 可用的数据源里不存在原文」（描述符 strictObject 无 value 键、
 * 读路径 describe-only 不触发 resolve）。
 *
 * 本文件钉定 src/host/service.ts 凭据消费面：
 * - setCredential(ref, value) → { ok: true }，唯一写路径是 ctx.credentials.set
 * - describeCredentials/getConfig → Record<ref, {configured, writable}>（无 source/value）
 */

const WECHAT_SECRET = 'wechat-secret-9f3a7c';

async function makeService() {
  const domain = new MemoryDomain();
  const credentials = makeCredentials();
  const llm = makeLlm();
  const service = await WeWriteService.open({
    domain,
    credentials: credentials.service,
    llm: { stream: llm.stream },
    now: () => new Date('2026-08-18T12:00:00.000Z'),
    logger: silentLogger,
  });
  return { service, domain, credentials };
}

describe('AC-5 凭据 write-only：service 层（qa-test-plan §10-1 补齐）', () => {
  it('setCredential 恰好一次经 credentials.set 写入，参数精确，返回 {ok:true}', async () => {
    const { service, credentials } = await makeService();

    const result = await service.setCredential('WEWRITE_WECHAT_SECRET', WECHAT_SECRET);

    expect(result).toEqual({ ok: true });
    expect(credentials.calls.set).toEqual([['WEWRITE_WECHAT_SECRET', WECHAT_SECRET]]);
  });

  it('凭据只落 credentials 服务：global 状态与 settings 无机密痕迹', async () => {
    const { service, domain } = await makeService();
    await service.setCredential('WEWRITE_WECHAT_SECRET', WECHAT_SECRET);

    const globalState = domain.global.get() as Record<string, unknown>;
    expect(JSON.stringify(globalState)).not.toContain(WECHAT_SECRET);
    // AC-M1-12 闸门真源标记 agentToolsTouched（非机密布尔）随 v1 global 落库，键集同步
    expect(Object.keys(globalState).sort()).toEqual(['agentToolsTouched', 'claimedOccurrences', 'settings', 'v']);
    const settingsKeys = Object.keys(globalState.settings as Record<string, unknown>).sort();
    expect(settingsKeys).toEqual(
      [
        'agentToolsEnabled',
        'defaultImageSize',
        'defaultTheme',
        'hotspotAggregatorUrl',
        'imageProviders',
        'llmDefault',
        'runHistoryLimit',
        'wechatApiBaseUrl',
        'wechatAppId',
        'wechatAuthor',
      ].sort(),
    );
  });

  it('config/set 不是凭据写面：注入机密字段被 strictObject 拒绝（config-invalid）', async () => {
    const { service } = await makeService();

    const attempt = service.setConfig({ WEWRITE_WECHAT_SECRET: 'injected-secret' } as Record<string, unknown>);

    await expect(attempt).rejects.toBeInstanceOf(WewriteServiceError);
    const code = await attempt.catch((error: WewriteServiceError) => error.code);
    expect(code).toBe('config-invalid');
  });

  it('getConfig 回显面 write-only：描述符仅 configured/writable（source 由视图层剥离），不含原文', async () => {
    const { service, credentials } = await makeService();
    await service.setCredential('WEWRITE_WECHAT_SECRET', WECHAT_SECRET);

    const config = await service.getConfig();

    expect(credentials.calls.describe).toContain('WEWRITE_WECHAT_SECRET');
    const descriptor = config.credentials['WEWRITE_WECHAT_SECRET'];
    expect(Object.keys(descriptor ?? {}).sort()).toEqual(['configured', 'writable']);
    expect(descriptor).toEqual({ configured: true, writable: true });
    expect(JSON.stringify(config)).not.toContain(WECHAT_SECRET);
    expect(() => CredentialsDescriptorSchema.parse(descriptor)).not.toThrow();
  });

  it('描述符契约无原文键位：value/secret/source 字段被 strict schema 拒绝', () => {
    expect(CredentialsDescriptorSchema.safeParse({ configured: true, writable: true, value: 'x' }).success).toBe(false);
    expect(CredentialsDescriptorSchema.safeParse({ configured: true, writable: true, secret: 'x' }).success).toBe(false);
    expect(CredentialsDescriptorSchema.safeParse({ configured: true, writable: true, source: 'x' }).success).toBe(false);
  });

  it('snapshot 全响应不含凭据原文', async () => {
    const { service } = await makeService();
    await service.setCredential('WEWRITE_WECHAT_SECRET', WECHAT_SECRET);

    const snapshot = await service.snapshot();

    expect(JSON.stringify(snapshot)).not.toContain(WECHAT_SECRET);
    expect(snapshot.config.credentials['WEWRITE_WECHAT_SECRET']).toEqual({ configured: true, writable: true });
  });

  it('读路径 describe-only：getConfig/snapshot 全程不触发 credentials.resolve（原文不出库）', async () => {
    const { service, credentials } = await makeService();
    await service.setCredential('WEWRITE_WECHAT_SECRET', WECHAT_SECRET);
    credentials.calls.resolve.length = 0;

    await service.getConfig();
    await service.snapshot();
    await service.describeCredentials();

    expect(credentials.calls.resolve).toEqual([]);
  });

  it('unset 后描述符回落 configured=false（回显面与存储面一致）', async () => {
    const { service, credentials } = await makeService();
    await service.setCredential('WEWRITE_WECHAT_SECRET', WECHAT_SECRET);
    await credentials.service.unset('WEWRITE_WECHAT_SECRET');

    const config = await service.getConfig();

    expect(config.credentials['WEWRITE_WECHAT_SECRET']).toEqual({ configured: false, writable: true });
  });
});
