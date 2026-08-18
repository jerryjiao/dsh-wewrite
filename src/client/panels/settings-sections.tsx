import { useState } from 'react';
import { Button, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ConfigView, CredentialsDescriptor } from '@/shared/contract';
import type { WewriteRpc } from '../lib/rpc';
import { describeRpcFailure } from '../lib/rpc';
import { Icon } from '../components/Icon';

/**
 * 设置页分组内容区（DESIGN §9.6）：公众号 / API 代理 / 发布纪律（模型与图片组在 settings-models.tsx）。
 * 凭据只写直通（credentials/set）+ describe 驱动「已配置」徽标（AC-5）；
 * 代理 URL 字段级校验；40164 诊断展示出口 IP 与两条出路（AC-6）。
 */

export type SettingsGroup = 'wechat' | 'llm' | 'images' | 'proxy' | 'discipline';

export interface SectionProps {
  config: ConfigView;
  rpc: WewriteRpc;
  onSaved: () => Promise<void> | void;
}

export function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  return <span className={state === 'error' ? 'ww-settings__save ww-settings__save--error' : 'ww-settings__save'}>{state === 'saving' ? '保存中…' : state === 'saved' ? '已保存' : '保存失败，重试'}</span>;
}

export function ConfiguredBadge({ descriptor }: { descriptor: CredentialsDescriptor | undefined }) {
  if (!descriptor) return null;
  return descriptor.configured ? (
    <span className="ww-badge ww-badge--ok">
      <Icon name="check" size={16} /> 已配置
    </span>
  ) : (
    <span className="ww-badge">
      <Icon name="circle-alert" size={16} /> 未配置
    </span>
  );
}

/** 公众号接入：AppID/Secret/作者名（代理与测试在 API 代理组，避免重复表单）。 */
export function WechatSection({ config, rpc, onSaved }: SectionProps) {
  const [appId, setAppId] = useState(config.settings.wechatAppId);
  const [author, setAuthor] = useState(config.settings.wechatAuthor);
  const [secret, setSecret] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save() {
    setSaveState('saving');
    try {
      await rpc.call('config/set', { wechatAppId: appId.trim(), wechatAuthor: author.trim() });
      if (secret.trim().length > 0) {
        await rpc.call('credentials/set', { ref: 'WEWRITE_WECHAT_SECRET', value: secret.trim() });
        setSecret('');
      }
      setSaveState('saved');
      await onSaved();
    } catch {
      setSaveState('error');
    }
  }

  return (
    <div className="ww-settings__section">
      <h3 className="ww-settings__h">公众号接入</h3>
      <label className="ww-field">
        <span className="ww-field__label">AppID</span>
        <Input value={appId} onChange={(event) => setAppId(event.target.value)} aria-label="公众号 AppID" />
      </label>
      <label className="ww-field">
        <span className="ww-field__label">AppSecret <span className="ww-field__hint">仅存本机（credentials 存储，不进 git、不回显）</span></span>
        <Input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={config.credentials['WEWRITE_WECHAT_SECRET']?.configured ? '已配置——输入新值可覆盖' : '输入 AppSecret'} aria-label="公众号 AppSecret" />
        <ConfiguredBadge descriptor={config.credentials['WEWRITE_WECHAT_SECRET']} />
      </label>
      <label className="ww-field">
        <span className="ww-field__label">作者名（文章 byline）</span>
        <Input value={author} onChange={(event) => setAuthor(event.target.value)} aria-label="作者名" />
      </label>
      <div className="ww-settings__row">
        <Button variant="primary" size="sm" className="ww-btn-accent" onClick={() => void save()} disabled={saveState === 'saving'}>
          保存
        </Button>
        <SaveState state={saveState} />
      </div>
    </div>
  );
}

/** 模型服务：llm/options 透传宿主 providers/models，写回 llmDefault（provider/model 均可选）。 */
/** API 代理 + 连接测试（wechat/diagnose：reachable / 40164 出口 IP 两条出路）。 */
export function ProxySection({ config, rpc }: SectionProps) {
  const [baseUrl, setBaseUrl] = useState(config.settings.wechatApiBaseUrl);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<'ok' | 'fail' | undefined>();
  const [failure, setFailure] = useState<{ title: string; hint?: string; ip: boolean } | undefined>();

  const urlInvalid = baseUrl.length > 0 && !/^https?:\/\//.test(baseUrl);

  async function save() {
    setSaveState('saving');
    try {
      await rpc.call('config/set', { wechatApiBaseUrl: baseUrl.trim() });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  async function test() {
    setTesting(true);
    setResult(undefined);
    setFailure(undefined);
    try {
      const diagnose = await rpc.call<{ reachable: boolean; ipWhitelisted?: boolean; errcode?: number; hint?: string }>('wechat/diagnose', {});
      if (diagnose.reachable && diagnose.ipWhitelisted !== false) {
        setResult('ok');
      } else {
        const notice = describeRpcFailure({ errcode: diagnose.errcode, hint: diagnose.hint, message: diagnose.hint ?? '接口不可达' });
        setResult('fail');
        setFailure({ title: notice.title, hint: notice.hint, ip: notice.ipWhitelist || diagnose.errcode === 40164 });
      }
    } catch (error) {
      const notice = describeRpcFailure(error);
      setResult('fail');
      setFailure({ title: notice.title, hint: notice.hint, ip: notice.ipWhitelist });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="ww-settings__section">
      <h3 className="ww-settings__h">API 代理（微信接口统一出口）</h3>
      <p className="ww-field-note">本机 IP 不在微信白名单时必须走代理；所有微信调用统一走该地址，无混合路径（AC-2）。</p>
      <label className="ww-field">
        <span className="ww-field__label">API 代理地址</span>
        <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} aria-label="API 代理地址" className={urlInvalid ? 'ww-input-error' : undefined} />
        {urlInvalid ? <span className="ww-field__error">代理地址必须以 http(s):// 开头</span> : null}
      </label>
      <div className="ww-settings__row">
        <Button variant="primary" size="sm" className="ww-btn-accent" onClick={() => void save()} disabled={saveState === 'saving' || urlInvalid}>
          保存
        </Button>
        <SaveState state={saveState} />
        <Button variant="outline" size="sm" icon={<Icon name={testing ? 'loader-circle' : 'plug-zap'} size={16} className={testing ? 'ww-spin' : undefined} />} onClick={() => void test()} disabled={testing || urlInvalid}>
          {testing ? '测试中…' : '测试连接'}
        </Button>
      </div>
      {result === 'ok' ? (
        <p className="ww-callout ww-callout--ok">
          <Icon name="circle-check" size={16} /> 草稿箱 API 可达
        </p>
      ) : null}
      {result === 'fail' && failure ? (
        <div className="ww-callout ww-callout--fail" role="alert">
          <p className="ww-callout__title">
            <Icon name="triangle-alert" size={16} /> {failure.title}
          </p>
          {failure.hint ? <p className="ww-callout__hint">{failure.hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** 发布纪律：草稿箱锁定态（v0.1 无群发调用路径，AC-10）。 */
export function DisciplineSection() {
  return (
    <div className="ww-settings__section">
      <h3 className="ww-settings__h">发布纪律</h3>
      <div className="ww-locked">
        <span className="ww-locked__dot" aria-hidden="true" />
        <div>
          <p className="ww-locked__title">发布目标：草稿箱（锁定）</p>
          <p className="ww-locked__note">群发不可撤回，v0.1 不提供自动群发。定时任务与手动推送一律先落草稿箱，群发动作只能你在微信后台人工执行。</p>
        </div>
        <Pill>锁定</Pill>
      </div>
    </div>
  );
}

export function MenuTrigger({ label, open, onToggle, mono }: { label: string; open: boolean; onToggle: () => void; mono?: boolean }) {
  return (
    <button type="button" className="ww-menu-trigger" aria-expanded={open} aria-haspopup="menu" onClick={onToggle}>
      <span className={mono ? 'ww-menu-trigger__mono' : undefined}>{label}</span>
      <Icon name="chevron-down" size={16} />
    </button>
  );
}
