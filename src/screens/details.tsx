import { useState } from 'react';
import { View } from 'react-native';

import { classifyFetchError, KeyHelpError } from '../api/errors';
import type { Created } from '../api/types';
import { formatBytes, formatDate } from '../i18n';
import { useNav } from '../navigation';
import { useApp } from '../state/AppProvider';
import { clearResourceCache, useResource } from '../state/useResource';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorPanel,
  Field,
  KeyValue,
  ListRow,
  Loading,
  Meter,
  Notice,
  Screen,
  Section,
  T,
  TypedConfirmDialog,
} from '../ui/kit';
import { GeneratedValues } from './forms';
import { certificateBadge } from './resources';

/** Runs one write, keeps its error and busy state, and clears the cache after success. */
export function useAction() {
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
  const reset = () => setError(undefined);
  return { busy, error, run, reset };
}

/** The names a typed confirmation accepts: the shown (UTF-8) form first, then the ASCII form. */
const names = (...values: (string | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))];

/** A delete button with its typed confirmation; pops the screen after the delete. */
function DeleteAction({
  label,
  title,
  body,
  accepted,
  remove,
  testID,
}: {
  label: string;
  title: string;
  body: string;
  accepted: string[];
  remove: () => Promise<void>;
  testID: string;
}) {
  const nav = useNav();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const confirm = async () => {
    const done = await action.run(async () => {
      await remove();
      return true;
    });
    if (done) {
      setOpen(false);
      nav.pop();
    }
  };
  return (
    <>
      <Button
        label={label}
        kind="danger"
        onPress={() => {
          action.reset();
          setOpen(true);
        }}
        testID={testID}
      />
      <TypedConfirmDialog
        visible={open}
        title={title}
        body={body}
        accepted={accepted}
        confirmLabel={label}
        busy={action.busy}
        error={action.error}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
      />
    </>
  );
}

export function ClientScreen({ id }: { id: number }) {
  const { t, client, language, readOnly } = useApp();
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
      right={
        account && !readOnly ? (
          <Button label={t('common.edit')} compact kind="secondary" onPress={() => nav.push({ name: 'clientForm', id })} testID="client-edit" />
        ) : undefined
      }
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
              label={t('client.contact')}
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
            {!readOnly ? <Button label={t('domain.new')} kind="secondary" compact onPress={() => nav.push({ name: 'domainForm', clientId: id })} /> : null}
          </Section>
          <Section title={t('client.emails')}>
            {data.emails.map((e) => (
              <ListRow key={e.id} title={e.email_utf8 ?? e.email} onPress={() => nav.push({ name: 'email', id: e.id })} />
            ))}
            {!readOnly ? <Button label={t('email.new')} kind="secondary" compact onPress={() => nav.push({ name: 'emailForm', clientId: id })} /> : null}
          </Section>
          <Section title={t('client.databases')}>
            {data.databases.map((d) => (
              <ListRow key={d.id} title={d.database_name} subtitle={formatBytes(d.size, language)} onPress={() => nav.push({ name: 'database', id: d.id })} />
            ))}
            {!readOnly ? (
              <Button label={t('database.new')} kind="secondary" compact onPress={() => nav.push({ name: 'databaseForm', clientId: id })} />
            ) : null}
          </Section>
          {action.error ? <ErrorPanel error={action.error} /> : null}
          {!readOnly ? (
            <>
              <Button
                label={suspended ? t('client.enable') : t('client.disable')}
                kind={suspended ? 'primary' : 'danger'}
                onPress={() => setConfirm(true)}
                testID="client-toggle"
              />
              <DeleteAction
                label={t('client.delete')}
                title={t('client.deleteTitle', { name: account.username })}
                body={t('client.deleteBody', { domains: data.domains.length, emails: data.emails.length, databases: data.databases.length })}
                accepted={[account.username]}
                remove={() => (client ? client.deleteClient(id) : Promise.resolve())}
                testID="client-delete"
              />
            </>
          ) : null}
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
  const { t, client, language, settings, readOnly } = useApp();
  const nav = useNav();
  const detail = useResource(client, `domain:${id}`, async (c) => {
    const [domain, certificates, clients, domains, emails] = await Promise.all([c.domain(id), c.certificates(), c.clients(), c.domains(), c.emails()]);
    return {
      domain,
      certificate: certificates.find((cert) => cert.id === domain.security?.id_certificate),
      owner: clients.find((cl) => cl.id === domain.id_user),
      subdomains: domains.filter((d) => d.id_parent_domain === id).length,
      emails: emails.filter((e) => e.id_domain === id).length,
    };
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
          {!domain.is_subdomain ? (
            <ListRow title={t('dns.open')} onPress={() => nav.push({ name: 'dns', domainId: id })} testID="domain-dns" />
          ) : null}
          {action.error ? <ErrorPanel error={action.error} /> : null}
          {!readOnly ? (
            <>
              <Button
                label={disabled ? t('domain.enable') : t('domain.disable')}
                kind={disabled ? 'primary' : 'danger'}
                onPress={() => setConfirm(true)}
                testID="domain-toggle"
              />
              <DeleteAction
                label={t('domain.delete')}
                title={t('domain.deleteTitle', { name })}
                body={t('domain.deleteBody', { subdomains: data.subdomains, emails: data.emails })}
                accepted={names(domain.domain_utf8, domain.domain)}
                remove={() => (client ? client.deleteDomain(id) : Promise.resolve())}
                testID="domain-delete"
              />
            </>
          ) : null}
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
  const { t, client, language, readOnly } = useApp();
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
          {!readOnly ? (
            <Section title={t('email.resetPassword')}>
              <Card>
                <Field label={t('email.newPassword')} value={password} onChangeText={setPassword} secure hint={t('email.newPasswordHint')} testID="email-password" />
                <Button label={t('email.resetPassword')} kind="danger" onPress={() => setConfirm(true)} testID="email-reset" />
              </Card>
            </Section>
          ) : null}
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
          {!readOnly ? (
            <DeleteAction
              label={t('email.delete')}
              title={t('email.deleteTitle', { address })}
              body={t('email.deleteBody')}
              accepted={names(account.email_utf8, account.email)}
              remove={() => (client ? client.deleteEmail(id) : Promise.resolve())}
              testID="email-delete"
            />
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

export function DatabaseScreen({ id }: { id: number }) {
  const { t, client, language, readOnly } = useApp();
  const nav = useNav();
  const detail = useResource(client, `database:${id}`, async (c) => {
    const [database, clients] = await Promise.all([c.database(id), c.clients()]);
    return { database, owner: clients.find((cl) => cl.id === database.id_user) };
  });
  const database = detail.data?.database;
  return (
    <Screen title={database?.database_name ?? t('database.title')} onBack={nav.pop} testID="screen-database">
      {detail.error ? <ErrorPanel error={detail.error} onRetry={detail.reload} /> : null}
      {!database && detail.loading ? <Loading /> : null}
      {database ? (
        <>
          <Card>
            <KeyValue label={t('domain.owner')} value={detail.data?.owner?.username ?? `#${database.id_user}`} />
            <KeyValue label={t('database.user')} value={database.database_username} />
            <KeyValue label={t('database.size')} value={formatBytes(database.size, language)} />
            {database.description ? <KeyValue label={t('email.description')} value={database.description} /> : null}
            {database.remote_hosts && database.remote_hosts.length > 0 ? (
              <T variant="caption">{t('database.remoteHosts', { hosts: database.remote_hosts.join(', ') })}</T>
            ) : null}
          </Card>
          {!readOnly ? (
            <DeleteAction
              label={t('database.delete')}
              title={t('database.deleteTitle', { name: database.database_name })}
              body={t('database.deleteBody', { user: database.database_username })}
              accepted={[database.database_name]}
              remove={() => (client ? client.deleteDatabase(id) : Promise.resolve())}
              testID="database-delete"
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
