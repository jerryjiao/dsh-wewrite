import { useEffect, useMemo, useState } from 'react';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ImageProviderConfig } from '@/shared/contract';
import { CREDENTIAL_REFS, DEFAULT_PROVIDER_MODELS, IMAGE_PROVIDER_IDS } from '@/shared/image-provider-ids';
import type { ImageProviderId } from '@/shared/image-provider-ids';
import { CodeChip } from '../components/bits';
import { Icon } from '../components/Icon';
import { ConfiguredBadge, MenuTrigger, SaveState, type SectionProps } from './settings-sections';

/**
 * 模型服务 + 图片供应商两组设置内容（从 settings-sections 拆分以守 300 行纪律）。
 */
export function LlmSection({ config, rpc, onSaved }: SectionProps) {
  const [provider, setProvider] = useState(config.settings.llmDefault.provider ?? '');
  const [model, setModel] = useState(config.settings.llmDefault.model ?? '');
  const [options, setOptions] = useState<{ id: string; models: string[] }[] | undefined>();
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    rpc
      .call<{ providers: { id: string; models: string[] }[] }>('llm/options', {})
      .then((result) => setOptions(result.providers))
      .catch(() => setOptions(undefined));
  }, [rpc]);

  const providerEntries: MenuEntry[] = (options ?? []).map((item) => ({ id: item.id, label: item.id }));
  const modelEntries: MenuEntry[] =
    (options?.find((item) => item.id === provider)?.models ?? (model ? [model] : [])).map((name) => ({ id: name, label: name }));

  async function save() {
    setSaveState('saving');
    try {
      await rpc.call('config/set', {
        llmDefault: { ...(provider ? { provider } : {}), ...(model ? { model } : {}) },
      });
      setSaveState('saved');
      await onSaved();
    } catch {
      setSaveState('error');
    }
  }

  return (
    <div className="ww-settings__section">
      <h3 className="ww-settings__h">模型服务（复用 DSH 宿主已配供应商）</h3>
      <div className="ww-field-row">
        <div className="ww-field">
          <span className="ww-field__label">供应商</span>
          <Menu
            open={providerOpen}
            anchor={<MenuTrigger label={provider || '选择供应商'} open={providerOpen} onToggle={() => setProviderOpen((v) => !v)} />}
            items={providerEntries}
            selectedId={provider || undefined}
            onSelect={(id) => {
              setProvider(id);
              const first = options?.find((item) => item.id === id)?.models[0];
              if (first) setModel(first);
              setProviderOpen(false);
            }}
            onClose={() => setProviderOpen(false)}
          />
        </div>
        <div className="ww-field">
          <span className="ww-field__label">模型</span>
          <Menu
            open={modelOpen}
            anchor={<MenuTrigger label={model || '选择模型'} open={modelOpen} onToggle={() => setModelOpen((v) => !v)} mono />}
            items={modelEntries}
            selectedId={model || undefined}
            onSelect={(id) => {
              setModel(id);
              setModelOpen(false);
            }}
            onClose={() => setModelOpen(false)}
          />
        </div>
      </div>
      <div className="ww-settings__row">
        <Button variant="primary" size="sm" className="ww-btn-accent" onClick={() => void save()} disabled={saveState === 'saving'}>
          保存
        </Button>
        <SaveState state={saveState} />
      </div>
    </div>
  );
}

/** 图片供应商：fallback 链排序（上下移）+ 供应商增删 + 每家 model/凭据位。 */
export function ImagesSection({ config, rpc, onSaved }: SectionProps) {
  const [chain, setChain] = useState<ImageProviderConfig[]>(config.imageProviders);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [addOpen, setAddOpen] = useState(false);

  const remaining = useMemo(
    () => IMAGE_PROVIDER_IDS.filter((id) => !chain.some((item) => item.providerId === id)),
    [chain],
  );

  async function save(next: ImageProviderConfig[]) {
    setSaveState('saving');
    try {
      await rpc.call('config/set', { imageProviders: next });
      setChain(next);
      setSaveState('saved');
      await onSaved();
    } catch {
      setSaveState('error');
    }
  }

  function move(index: number, delta: -1 | 1) {
    const next = [...chain];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void save(next);
  }

  return (
    <div className="ww-settings__section">
      <h3 className="ww-settings__h">图片供应商 fallback 链（gpt-image-2 第一优先）</h3>
      <ol className="ww-provider-chain">
        {chain.map((item, index) => (
          <li key={item.providerId} className="ww-provider">
            <span className="ww-provider__order">{index + 1}</span>
            <CodeChip>{item.providerId}</CodeChip>
            <span className="ww-provider__model">{item.model ?? DEFAULT_PROVIDER_MODELS[item.providerId as ImageProviderId] ?? '默认模型'}</span>
            <ConfiguredBadge descriptor={config.credentials[item.credentialRef]} />
            <span className="ww-provider__ops">
              <button type="button" className="ww-icon-btn" aria-label={`上移 ${item.providerId}`} onClick={() => move(index, -1)} disabled={index === 0}>
                <Icon name="chevron-down" size={16} className="ww-rotate-180" />
              </button>
              <button type="button" className="ww-icon-btn" aria-label={`下移 ${item.providerId}`} onClick={() => move(index, 1)} disabled={index === chain.length - 1}>
                <Icon name="chevron-down" size={16} />
              </button>
              <button type="button" className="ww-icon-btn" aria-label={`移除 ${item.providerId}`} onClick={() => void save(chain.filter((entry) => entry.providerId !== item.providerId))}>
                <Icon name="x" size={16} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <Menu
        open={addOpen}
        anchor={
          <Button variant="outline" size="sm" icon={<Icon name="image-plus" size={16} />} onClick={() => setAddOpen((v) => !v)}>
            添加供应商
          </Button>
        }
        items={remaining.map((id) => ({ id, label: id }))}
        onSelect={(id) => {
          setAddOpen(false);
          const providerId = id as ImageProviderId;
          void save([...chain, { providerId, credentialRef: CREDENTIAL_REFS.image(providerId) }]);
        }}
        onClose={() => setAddOpen(false)}
      />
      <div className="ww-settings__row">
        <SaveState state={saveState} />
        <span className="ww-field__hint">生成失败按链降级，全失败可无图推进（AC-9）。</span>
      </div>
    </div>
  );
}

