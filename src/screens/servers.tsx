import { useState } from 'react';
import { Platform, View } from 'react-native';

import { classifyFetchError, KeyHelpError } from '../api/errors';
import { hostOf } from '../api/url';
import { useNav } from '../navigation';
import { useApp } from '../state/AppProvider';
import { clearResourceCache } from '../state/useResource';
import { Badge, Button, ConfirmDialog, ErrorPanel, Field, ListRow, Notice, Screen, T } from '../ui/kit';

/** Address and API key; the key is checked against the server before anything is saved. */
export function ConnectScreen({ onDone, onBack, prefillUrl }: { onDone?: () => void; onBack?: () => void; prefillUrl?: string }) {
  const { t, addServer, secretsPersistent, theme } = useApp();
  const [name, setName] = useState('');
  const [url, setUrl] = useState(prefillUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<KeyHelpError>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await addServer({ name, url, apiKey });
      clearResourceCache();
      setApiKey('');
      onDone?.();
    } catch (caught) {
      setError(caught instanceof KeyHelpError ? caught : classifyFetchError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('connect.title')} onBack={onBack} testID="screen-connect">
      {!onBack ? (
        <View style={{ gap: theme.space(1), marginBottom: theme.space(2) }}>
          <T variant="display">{t('app.name')}</T>
          <T variant="muted">{t('app.tagline')}</T>
        </View>
      ) : null}
      {!secretsPersistent || Platform.OS === 'web' ? (
        <Notice tone="warning" testID="web-key-warning">
          {t('connect.webWarning')}
        </Notice>
      ) : null}
      <Field label={t('connect.name')} value={name} onChangeText={setName} placeholder={t('connect.namePlaceholder')} autoCapitalize="words" testID="connect-name" />
      <Field
        label={t('connect.url')}
        value={url}
        onChangeText={setUrl}
        placeholder="panel.example.org"
        keyboard="url"
        hint={t('connect.urlHint')}
        testID="connect-url"
      />
      <Field label={t('connect.key')} value={apiKey} onChangeText={setApiKey} secure hint={t('connect.keyHint')} testID="connect-key" />
      {error ? <ErrorPanel error={error} /> : null}
      <Button label={busy ? t('connect.checking') : t('connect.submit')} onPress={submit} busy={busy} disabled={url.trim() === '' || apiKey.trim() === ''} testID="connect-submit" />
      {secretsPersistent ? <T variant="caption">{t('connect.secureNote')}</T> : null}
      <T variant="caption">{t('app.notAffiliated')}</T>
    </Screen>
  );
}

export function ServersScreen() {
  const { t, servers, active, selectServer, removeServer } = useApp();
  const nav = useNav();
  const [removing, setRemoving] = useState<string | null>(null);
  const target = servers.find((s) => s.id === removing);

  return (
    <Screen title={t('servers.title')} onBack={nav.pop} testID="screen-servers">
      {servers.length === 0 ? <T variant="muted">{t('servers.empty')}</T> : null}
      {servers.map((server) => (
        <View key={server.id} style={{ gap: 6 }}>
          <ListRow
            title={server.name}
            subtitle={hostOf(server.origin)}
            onPress={() => {
              selectServer(server.id);
              nav.pop();
            }}
            right={server.id === active?.id ? <Badge label={t('servers.active')} tone="success" /> : undefined}
            testID={`server-${server.id}`}
          />
          <View style={{ alignSelf: 'flex-end' }}>
            <Button label={t('servers.remove')} kind="ghost" compact onPress={() => setRemoving(server.id)} testID={`server-remove-${server.id}`} />
          </View>
        </View>
      ))}
      <Button label={t('servers.add')} onPress={() => nav.push({ name: 'connect' })} testID="servers-add" />
      <ConfirmDialog
        visible={target !== undefined}
        title={t('servers.removeTitle', { name: target?.name ?? '' })}
        body={t('servers.removeBody')}
        confirmLabel={t('servers.remove')}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (target) void removeServer(target.id);
          setRemoving(null);
        }}
      />
    </Screen>
  );
}

/** Shown instead of a screen's content when the active server's key is not available. */
export function NeedsKey() {
  const { t, active } = useApp();
  const nav = useNav();
  return (
    <Notice tone="warning" testID="needs-key">
      <T>{t('servers.needsKey')}</T>
      <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
        <Button label={t('connect.title')} compact onPress={() => nav.push({ name: 'connect' })} />
      </View>
      {active ? <T variant="caption">{hostOf(active.origin)}</T> : null}
    </Notice>
  );
}
