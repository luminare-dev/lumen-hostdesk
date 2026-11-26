import { useState } from 'react';
import { View } from 'react-native';

import { classifyFetchError, KeyHelpError } from '../api/errors';
import type { Created } from '../api/types';
import { formatBytes, formatDate } from '../i18n';
import { useNav } from '../navigation';
import { useApp } from '../state/AppProvider';
import { clearResourceCache, useResource } from '../state/useResource';
import { Badge, Button, Card, ConfirmDialog, ErrorPanel, Field, KeyValue, ListRow, Loading, Meter, Notice, Screen, Section, T } from '../ui/kit';
import { GeneratedValues } from './forms';
import { certificateBadge } from './resources';

/** Runs one write, keeps its error and busy state, and clears the cache after success. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<KeyHelpError>();
  const run = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await action();
      clearResourceCache();
      return result;
    } catch (caught) {
      setError(caught instanceof KeyHelpError ? caught : classifyFetchError(caught));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function ClientScreen({ id }: { id: number }) {
  const { t, client, language } = useApp();
  const nav = useNav();
  const detail = useResource(client, `client:${id}`, async (c) => {
    const [account, stats, domains, emails, databases] = await Promise.all([c.client(id), c.clientStats(id), c.domains(), c.emails(), c.databases()]);
    return {
      account,
      stats,
      domains: domains.filter((d) => d.id_user === id),
      emails: emails.filter((e) => e.id_user === id),
      databases: databases.filter((d) => d.id_user === id),
    };
  });
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const data = detail.data;
  const account = data?.account;
  const suspended = account?.is_suspended === true;

  const toggle = async () => {
    if (!client || !account) return;
    const ok = await action.run(() => client.setClientSuspended(id, !suspended));
    setConfirm(false);
    if (ok) detail.reload();
  };

  return (
    <Screen
      title={account?.username ?? t('resources.clients')}
      onBack={nav.pop}
      testID="screen-client"
      right={account ? <Button label={t('common.edit')} compact kind="secondary" onPress={() => nav.push({ name: 'clientForm', id })} testID="client-edit" /> : undefined}
    >
      {detail.error ? <ErrorPanel error={detail.error} onRetry={detail.reload} /> : null}
      {!data && detail.loading ? <Loading /> : null}
      {account && data ? (
        <>
          <Card>
            <Badge label={suspended ? t('client.suspended') : t('client.active')} tone={suspended ? 'warning' : 'success'} testID="client-state" />
            <KeyValue label={t('client.email')} value={account.email ?? '—'} />
            <KeyValue label={t('client.company')} value={account.contact_data?.company || '—'} />
            <KeyValue
              label={t('client.firstName')}
              value={[account.contact_data?.first_name, account.contact_data?.last_name].filter(Boolean).join(' ') || '—'}
            />
            {account.created_at ? <T variant="caption">{t('client.created', { date: formatDate(account.created_at, language) })}</T> : null}
            {account.notes ? <T variant="muted">{account.notes}</T> : null}
          </Card>
          <Section title={t('client.usage')}>
            <Card>
              {data.stats.disk_space && data.stats.disk_space.max > 0 ? (
                <Meter
                  label={t('dashboard.disk')}
                  percent={(data.stats.disk_space.value / data.stats.disk_space.max) * 100}
                  detail={t('common.of', {
                    used: formatBytes(data.stats.disk_space.value, language),
                    total: formatBytes(data.stats.disk_space.max, language),
                  })}
                />
              ) : null}
              {(['domains', 'email_accounts', 'databases', 'ftp_users', 'scheduled_tasks'] as const).map((key) => {
                const stat = data.stats[key];
                if (!stat) return null;
                const label = {
                  domains: t('resources.domains'),
                  email_accounts: t('resources.emails'),
                  databases: t('resources.databases'),
                  ftp_users: t('resources.ftp'),
                  scheduled_tasks: t('resources.cron'),
                }[key];
                return <KeyValue key={key} label={label} value={`${stat.value} / ${stat.max < 0 ? '∞' : stat.max}`} />;
              })}
            </Card>
          </Section>
          <Section title={t('client.domains')}>
            {data.domains.map((d) => (
              <ListRow key={d.id} title={d.domain_utf8 ?? d.domain} onPress={() => nav.push({ name: 'domain', id: d.id })} />
            ))}
            <Button label={t('domain.new')} kind="secondary" compact onPress={() => nav.push({ name: 'domainForm', clientId: id })} />
          </Section>
          <Section title={t('client.emails')}>
            {data.emails.map((e) => (
              <ListRow key={e.id} title={e.email_utf8 ?? e.email} onPress={() => nav.push({ name: 'email', id: e.id })} />
            ))}
            <Button label={t('email.new')} kind="secondary" compact onPress={() => nav.push({ name: 'emailForm', clientId: id })} />
          </Section>
          <Section title={t('client.databases')}>
            {data.databases.map((d) => (
              <ListRow key={d.id} title={d.database_name} subtitle={formatBytes(d.size, language)} />
            ))}
            <Button label={t('database.new')} kind="secondary" compact onPress={() => nav.push({ name: 'databaseForm', clientId: id })} />
          </Section>
          {action.error ? <ErrorPanel error={action.error} /> : null}
          <Button
            label={suspended ? t('client.enable') : t('client.disable')}
            kind={suspended ? 'primary' : 'danger'}
            onPress={() => setConfirm(true)}
            testID="client-toggle"
          />
          <ConfirmDialog
            visible={confirm}
            title={t(suspended ? 'client.enableTitle' : 'client.disableTitle', { name: account.username })}
            body={t(suspended ? 'client.enableBody' : 'client.disableBody')}
            confirmLabel={suspended ? t('client.enable') : t('client.disable')}
            danger={!suspended}
            busy={action.busy}
            onCancel={() => setConfirm(false)}
            onConfirm={toggle}
          />
        </>
      ) : null}
    </Screen>
  );
}

export function DomainScreen({ id }: { id: number }) {
  const { t, client, language, settings } = useApp();
  const nav = useNav();
  const detail = useResource(client, `domain:${id}`, async (c) => {
    const [domain, certificates, clients] = await Promise.all([c.domain(id), c.certificates(), c.clients()]);
    return { domain, certificate: certificates.find((cert) => cert.id === domain.security?.id_certificate), owner: clients.find((cl) => cl.id === domain.id_user) };
  });
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const data = detail.data;
  const domain = data?.domain;
  const disabled = domain?.is_disabled === true;
  const name = domain ? (domain.domain_utf8 ?? domain.domain) : '';
  const badge = certificateBadge(data?.certificate, t, settings.thresholds.certDays);

  const toggle = async () => {
    if (!client || !domain) return;
    const ok = await action.run(() => client.setDomainDisabled(id, !disabled));
    setConfirm(false);
    if (ok) detail.reload();
  };

  return (
    <Screen title={name || t('resources.domains')} onBack={nav.pop} testID="screen-domain">
      {detail.error ? <ErrorPanel error={detail.error} onRetry={detail.reload} /> : null}
      {!data && detail.loading ? <Loading /> : null}
      {domain && data ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {disabled ? <Badge label={t('domain.disabled')} tone="warning" /> : null}
              {domain.is_subdomain ? <Badge label={t('domain.subdomain')} /> : null}
              {domain.status === 2 ? <Badge label={t('domain.statusError')} tone="danger" /> : null}
            </View>
            <KeyValue label={t('domain.owner')} value={data.owner?.username ?? `#${domain.id_user}`} />
            {domain.target?.is_forwarding && domain.target.target ? <T variant="muted">{t('domain.forwarding', { target: domain.target.target })}</T> : null}
            <KeyValue label={t('domain.forceHttps')} value={domain.security?.force_https ? t('common.yes') : t('common.no')} />
            <KeyValue label={t('domain.hsts')} value={domain.security?.is_hsts ? t('common.yes') : t('common.no')} />
            <KeyValue label={t('domain.emailDomain')} value={domain.is_email_domain ? t('common.yes') : t('common.no')} />
          </Card>
          <Section title={t('domain.certificate')}>
            <Card testID="domain-certificate">
              <Badge label={badge.label} tone={badge.tone} />
              {data.certificate ? (
                <>
                  <KeyValue label={t('connect.name')} value={data.certificate.name} />
                  <KeyValue label={t('domain.issuer')} value={data.certificate.issuer ?? '—'} />
                  <T variant="muted">{t('domain.validTill', { date: formatDate(data.certificate.valid_till, language) })}</T>
                  <T variant="caption">{(data.certificate.secured_domains ?? []).join(', ')}</T>
                </>
              ) : null}
            </Card>
          </Section>
          {action.error ? <ErrorPanel error={action.error} /> : null}
          <Button label={disabled ? t('domain.enable') : t('domain.disable')} kind={disabled ? 'primary' : 'danger'} onPress={() => setConfirm(true)} testID="domain-toggle" />
          <ConfirmDialog
            visible={confirm}
            title={t(disabled ? 'domain.enableTitle' : 'domain.disableTitle', { name })}
            body={t(disabled ? 'domain.enableBody' : 'domain.disableBody')}
            confirmLabel={disabled ? t('domain.enable') : t('domain.disable')}
            danger={!disabled}
            busy={action.busy}
            onCancel={() => setConfirm(false)}
            onConfirm={toggle}
          />
        </>
      ) : null}
    </Screen>
  );
}

export function EmailScreen({ id }: { id: number }) {
  const { t, client, language } = useApp();
  const nav = useNav();
  const detail = useResource(client, `email:${id}`, (c) => c.email(id));
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<Created>();
  const account = detail.data;
  const address = account ? (account.email_utf8 ?? account.email) : '';
  const limited = (account?.max_size ?? 0) > 0;

  const reset = async () => {
    if (!client) return;
    const answer = await action.run(() => client.setEmailPassword(id, password));
    setConfirm(false);
    setPassword('');
    if (answer) setResult(answer);
  };

  return (
    <Screen title={address || t('resources.emails')} onBack={nav.pop} testID="screen-email">
      {detail.error ? <ErrorPanel error={detail.error} onRetry={detail.reload} /> : null}
      {!account && detail.loading ? <Loading /> : null}
      {account ? (
        <>
          <Card>
            {limited ? (
              <Meter
                label={t('email.quota')}
                percent={((account.size ?? 0) / (account.max_size as number)) * 100}
                detail={t('common.of', { used: formatBytes(account.size, language), total: formatBytes(account.max_size, language) })}
                testID="email-quota"
              />
            ) : (
              <KeyValue label={t('email.quota')} value={`${formatBytes(account.size, language)} · ${t('common.unlimited')}`} />
            )}
            {account.description ? <KeyValue label={t('email.description')} value={account.description} /> : null}
            <KeyValue label={t('email.aliases')} value={(account.aliases ?? []).join(', ') || '—'} />
            <KeyValue label={t('email.forwardings')} value={(account.forwardings ?? []).join(', ') || '—'} />
          </Card>
          <Section title={t('email.resetPassword')}>
            <Card>
              <Field label={t('email.newPassword')} value={password} onChangeText={setPassword} secure hint={t('email.newPasswordHint')} testID="email-password" />
              <Button label={t('email.resetPassword')} kind="danger" onPress={() => setConfirm(true)} testID="email-reset" />
            </Card>
          </Section>
          {action.error ? <ErrorPanel error={action.error} /> : null}
          {result ? (
            result.password ? (
              <GeneratedValues values={result} onDone={() => setResult(undefined)} />
            ) : (
              <Notice tone="success" testID="password-set">
                {t('email.passwordSet')}
              </Notice>
            )
          ) : null}
          <ConfirmDialog
            visible={confirm}
            title={t('email.resetTitle', { address })}
            body={t('email.resetBody')}
            confirmLabel={t('email.resetPassword')}
            busy={action.busy}
            onCancel={() => setConfirm(false)}
            onConfirm={reset}
          />
        </>
      ) : null}
    </Screen>
  );
}
