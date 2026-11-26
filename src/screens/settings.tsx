import { useState } from 'react';

import appConfig from '../../app.json';
import { backgroundSupported, setBackgroundChecks } from '../alerts/background';
import type { Thresholds } from '../alerts/evaluate';
import { useNav } from '../navigation';
import { useApp } from '../state/AppProvider';
import type { LanguageSetting, ThemeSetting } from '../state/settings';
import { importTokens, PRESET_NAMES, PRESETS, type PresetName } from '../theme/tokens';
import { Button, Card, Field, ListRow, Notice, Screen, Section, Segmented, T, ToggleRow } from '../ui/kit';

function NumberField({ label, value, onChange, testID }: { label: string; value: number; onChange: (n: number) => void; testID?: string }) {
  const [text, setText] = useState(String(value));
  return (
    <Field
      label={label}
      value={text}
      keyboard="number-pad"
      testID={testID}
      onChangeText={(next) => {
        setText(next);
        const n = Number(next);
        if (next.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function SettingsScreen() {
  const { t, settings, updateSettings, servers, active } = useApp();
  const nav = useNav();
  const th = settings.thresholds;
  const setThreshold = (patch: Partial<Thresholds>) => updateSettings({ thresholds: { ...th, ...patch } });
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));
  const version = appConfig.expo.version;

  return (
    <Screen title={t('settings.title')} testID="screen-settings">
      <Section title={t('settings.servers')}>
        <ListRow title={active?.name ?? t('servers.add')} subtitle={`${servers.length} × ${t('servers.title')}`} onPress={() => nav.push({ name: 'servers' })} testID="settings-servers" />
      </Section>

      <Section title={t('settings.language')}>
        <Segmented<LanguageSetting>
          label={t('settings.language')}
          value={settings.language}
          onChange={(language) => updateSettings({ language })}
          options={[
            { value: 'system', label: t('settings.languageSystem') },
            { value: 'en', label: 'English' },
            { value: 'de', label: 'Deutsch' },
          ]}
          testID="language"
        />
      </Section>

      <Section title={t('settings.theme')}>
        <Segmented<ThemeSetting>
          label={t('settings.theme')}
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'dark', label: t('settings.themeDark') },
            { value: 'light', label: t('settings.themeLight') },
          ]}
          testID="theme"
        />
      </Section>

      <Section title={t('settings.tokens')}>
        <Segmented<PresetName>
          label={t('settings.preset')}
          value={settings.preset}
          onChange={(preset) => updateSettings({ preset })}
          options={PRESET_NAMES.map((name) => ({ value: name, label: PRESETS[name].meta.name }))}
          testID="preset"
        />
        <Button label={t('settings.importTokens')} kind="secondary" onPress={() => nav.push({ name: 'tokens' })} testID="tokens-import" />
        {settings.customTokens ? (
          <Button label={t('settings.resetTokens')} kind="ghost" onPress={() => updateSettings({ customTokens: null })} testID="tokens-reset" />
        ) : null}
      </Section>

      <Section title={t('settings.thresholds')}>
        <Card>
          <NumberField label={t('settings.certDays')} value={th.certDays} onChange={(n) => setThreshold({ certDays: clamp(n, 1, 90) })} testID="threshold-cert" />
          <NumberField label={t('settings.diskPercent')} value={th.diskPercent} onChange={(n) => setThreshold({ diskPercent: clamp(n, 50, 99) })} testID="threshold-disk" />
          <NumberField label={t('settings.memoryPercent')} value={th.memoryPercent} onChange={(n) => setThreshold({ memoryPercent: clamp(n, 50, 99) })} />
          <NumberField label={t('settings.quotaPercent')} value={th.quotaPercent} onChange={(n) => setThreshold({ quotaPercent: clamp(n, 50, 100) })} />
          <ToggleRow label={t('settings.serviceAlerts')} value={th.services} onChange={(services) => setThreshold({ services })} />
          <ToggleRow label={t('settings.backupAlerts')} value={th.backups} onChange={(backups) => setThreshold({ backups })} />
          {backgroundSupported ? (
            <ToggleRow
              label={t('settings.backgroundChecks')}
              value={settings.backgroundChecks}
              onChange={(backgroundChecks) => {
                updateSettings({ backgroundChecks });
                void setBackgroundChecks(backgroundChecks).catch(() => undefined);
              }}
            />
          ) : null}
        </Card>
      </Section>

      <Section title={t('settings.about')}>
        <Card>
          <T variant="label">{t('app.name')}</T>
          <T variant="caption">{t('settings.version', { version })}</T>
          <T variant="caption">{t('settings.byline')}</T>
          <T variant="caption">{t('settings.source')}</T>
          <T variant="caption">{t('app.notAffiliated')}</T>
        </Card>
      </Section>
    </Screen>
  );
}

export function TokensScreen() {
  const { t, settings, updateSettings } = useApp();
  const nav = useNav();
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string }>();

  const apply = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setMessage({ tone: 'danger', text: t('tokens.invalidJson') });
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setMessage({ tone: 'danger', text: t('tokens.invalidJson') });
      return;
    }
    const result = importTokens(parsed, settings.preset);
    updateSettings({ customTokens: result.tokens });
    const parts = [result.replaced.length > 0 ? t('tokens.replaced', { fields: result.replaced.join(', ') }) : t('tokens.applied')];
    if (result.lowContrast > 0) parts.push(t('tokens.contrast', { count: result.lowContrast }));
    setMessage({ tone: result.replaced.length > 0 || result.lowContrast > 0 ? 'warning' : 'success', text: parts.join(' ') });
  };

  return (
    <Screen title={t('tokens.title')} onBack={nav.pop} testID="screen-tokens">
      <T variant="muted">{t('tokens.hint')}</T>
      <Field label="JSON" value={text} onChangeText={setText} multiline testID="tokens-json" />
      {message ? (
        <Notice tone={message.tone} testID="tokens-result">
          {message.text}
        </Notice>
      ) : null}
      <Button label={t('tokens.apply')} onPress={apply} disabled={text.trim() === ''} testID="tokens-apply" />
    </Screen>
  );
}
