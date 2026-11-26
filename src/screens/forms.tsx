import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { parseByteShorthand } from '../api/bytes';
import { classifyFetchError, KeyHelpError } from '../api/errors';
import type { Client, Created } from '../api/types';
import { useNav } from '../navigation';
import { useApp } from '../state/AppProvider';
import { clearResourceCache, useResource } from '../state/useResource';
import { Badge, Button, Card, ErrorPanel, Field, KeyValue, Loading, Notice, Screen, styles, T, ToggleRow } from '../ui/kit';

/** Values the server generated (password, database names), shown once and never stored. */
export function GeneratedValues({ values, onDone }: { values: Created; onDone: () => void }) {
  const { t } = useApp();
  return (
    <Notice tone="warning" testID="generated">
      <T variant="label">{t('generated.title')}</T>
      <T variant="caption">{t('generated.body')}</T>
      {values.database_name ? <KeyValue label={t('generated.databaseName')} value={<T variant="mono" selectable>{values.database_name}</T>} /> : null}
      {values.database_username ? <KeyValue label={t('generated.databaseUser')} value={<T variant="mono" selectable>{values.database_username}</T>} /> : null}
      {values.password ? (
        <KeyValue label={t('generated.password')} value={<T variant="mono" selectable testID="generated-password">{values.password}</T>} />
      ) : null}
      <View style={{ alignSelf: 'flex-start', marginTop: 8 }}>
        <Button label={t('common.done')} compact onPress={onDone} testID="generated-done" />
      </View>
    </Notice>
  );
}

function ClientPicker({ clients, value, onChange }: { clients: Client[]; value: number | undefined; onChange: (id: number) => void }) {
  const { t, theme } = useApp();
  return (
    <View style={{ gap: theme.space(1) }}>
      <T variant="label">{t('domain.owner')}</T>
      <View role="radiogroup" aria-label={t('domain.owner')} style={[styles.row, { flexWrap: 'wrap', gap: theme.space(2) }]}>
        {clients.map((c) => (
          <Pressable key={c.id} role="radio" aria-checked={c.id === value} onPress={() => onChange(c.id)} testID={`owner-${c.username}`}>
            <Badge label={c.username} tone={c.id === value ? 'accent' : 'neutral'} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** The shared frame of the create and edit forms: submit, error, generated values, back. */
function useSubmit() {
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<KeyHelpError>();
  const [generated, setGenerated] = useState<Created>();
  const submit = async (action: () => Promise<Created>) => {
    setBusy(true);
    setError(undefined);
    try {
      const created = await action();
      clearResourceCache();
      if (created.password || created.database_name) setGenerated(created);
      else nav.pop();
    } catch (caught) {
      setError(caught instanceof KeyHelpError ? caught : classifyFetchError(caught));
    } finally {
      setBusy(false);
    }
  };
  const footer = (
    <>
      {error ? <ErrorPanel error={error} /> : null}
      {generated ? <GeneratedValues values={generated} onDone={nav.pop} /> : null}
    </>
  );
  return { busy, submit, footer, done: generated !== undefined };
}

export function ClientFormScreen({ id }: { id?: number }) {
  const { t, client } = useApp();
  const nav = useNav();
  const editing = id !== undefined;
  const existing = useResource(client, editing ? `client:${id}:form` : 'client:new', (c) => (id !== undefined ? c.client(id) : Promise.resolve(undefined)));
  const plans = useResource(client, 'plans', (c) => c.hostingPlans());
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<number>();
  const [sendCredentials, setSendCredentials] = useState(false);
  const form = useSubmit();

  useEffect(() => {
    const c = existing.data;
    if (!c) return;
    setUsername(c.username);
    setEmail(c.email ?? '');
    setFirstName(c.contact_data?.first_name ?? '');
    setLastName(c.contact_data?.last_name ?? '');
    setCompany(c.contact_data?.company ?? '');
    setNotes(c.notes ?? '');
  }, [existing.data]);

  const contact = { first_name: firstName.trim(), last_name: lastName.trim(), company: company.trim() };
  const save = () => {
    if (!client) return;
    void form.submit(() =>
      id !== undefined
        ? client.updateClient(id, { email: email.trim(), notes, contact_data: contact })
        : client.createClient({
            username: username.trim(),
            email: email.trim(),
            password: password || undefined,
            id_hosting_plan: plan,
            notes,
            send_login_credentials: sendCredentials,
            contact_data: contact,
          })
    );
  };

  return (
    <Screen title={editing ? t('client.editTitle', { name: existing.data?.username ?? '' }) : t('client.new')} onBack={nav.pop} testID="screen-client-form">
      {existing.error ? <ErrorPanel error={existing.error} onRetry={existing.reload} /> : null}
      {editing && !existing.data ? <Loading /> : null}
      {!editing || existing.data ? (
        <Card>
          {!editing ? <Field label={t('client.username')} value={username} onChangeText={setUsername} testID="client-username" /> : null}
          <Field label={t('client.email')} value={email} onChangeText={setEmail} keyboard="email-address" testID="client-email" />
          {!editing ? <Field label={t('client.password')} value={password} onChangeText={setPassword} secure hint={t('client.passwordHint')} testID="client-password" /> : null}
          <Field label={t('client.firstName')} value={firstName} onChangeText={setFirstName} autoCapitalize="words" testID="client-first-name" />
          <Field label={t('client.lastName')} value={lastName} onChangeText={setLastName} autoCapitalize="words" testID="client-last-name" />
          <Field label={t('client.company')} value={company} onChangeText={setCompany} autoCapitalize="words" testID="client-company" />
          <Field label={t('client.notes')} value={notes} onChangeText={setNotes} autoCapitalize="sentences" testID="client-notes" />
          {!editing && plans.data ? (
            <View style={{ gap: 6 }}>
              <T variant="label">{t('client.plan')}</T>
              <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>
                {plans.data.map((p) => (
                  <Pressable key={p.id} role="radio" aria-checked={p.id === plan} onPress={() => setPlan(p.id)} testID={`plan-${p.id}`}>
                    <Badge label={p.name} tone={p.id === plan ? 'accent' : 'neutral'} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {!editing ? <ToggleRow label={t('client.sendCredentials')} value={sendCredentials} onChange={setSendCredentials} /> : null}
        </Card>
      ) : null}
      {form.footer}
      {!form.done ? (
        <Button
          label={editing ? t('common.save') : t('common.create')}
          onPress={save}
          busy={form.busy}
          disabled={(!editing && username.trim() === '') || email.trim() === ''}
          testID="form-submit"
        />
      ) : null}
    </Screen>
  );
}

function useOwner(initial: number | undefined) {
  const { client } = useApp();
  const clients = useResource(client, 'clients', (c) => c.clients());
  const [owner, setOwner] = useState<number | undefined>(initial);
  return { clients, owner, setOwner };
}

export function DomainFormScreen({ clientId }: { clientId?: number }) {
  const { t, client } = useApp();
  const nav = useNav();
  const { clients, owner, setOwner } = useOwner(clientId);
  const [domain, setDomain] = useState('');
  const [letsEncrypt, setLetsEncrypt] = useState(true);
  const [emailDomain, setEmailDomain] = useState(true);
  const [www, setWww] = useState(true);
  const form = useSubmit();
  const save = () => {
    if (!client || owner === undefined) return;
    void form.submit(() =>
      client.createDomain({
        id_user: owner,
        domain: domain.trim().toLowerCase(),
        create_www_subdomain: www,
        is_email_domain: emailDomain,
        security: { lets_encrypt: letsEncrypt },
      })
    );
  };
  return (
    <Screen title={t('domain.new')} onBack={nav.pop} testID="screen-domain-form">
      {clients.error ? <ErrorPanel error={clients.error} onRetry={clients.reload} /> : null}
      <Card>
        {clients.data ? <ClientPicker clients={clients.data} value={owner} onChange={setOwner} /> : <Loading />}
        <Field label={t('domain.name')} value={domain} onChangeText={setDomain} keyboard="url" placeholder="example.org" testID="domain-name" />
        <ToggleRow label={t('domain.www')} value={www} onChange={setWww} />
        <ToggleRow label={t('domain.emailDomain')} value={emailDomain} onChange={setEmailDomain} />
        <ToggleRow label={t('domain.letsEncrypt')} value={letsEncrypt} onChange={setLetsEncrypt} />
      </Card>
      {form.footer}
      <Button label={t('common.create')} onPress={save} busy={form.busy} disabled={owner === undefined || domain.trim() === ''} testID="form-submit" />
    </Screen>
  );
}

export function EmailFormScreen({ clientId }: { clientId?: number }) {
  const { t, client } = useApp();
  const nav = useNav();
  const { clients, owner, setOwner } = useOwner(clientId);
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [quota, setQuota] = useState('1G');
  const [description, setDescription] = useState('');
  const [quotaError, setQuotaError] = useState(false);
  const form = useSubmit();
  const save = () => {
    if (!client || owner === undefined) return;
    const maxSize = parseByteShorthand(quota);
    setQuotaError(maxSize === null);
    if (maxSize === null) return;
    void form.submit(() =>
      client.createEmail({ id_user: owner, email: address.trim().toLowerCase(), password: password || undefined, max_size: maxSize, description })
    );
  };
  return (
    <Screen title={t('email.new')} onBack={nav.pop} testID="screen-email-form">
      {clients.error ? <ErrorPanel error={clients.error} onRetry={clients.reload} /> : null}
      <Card>
        {clients.data ? <ClientPicker clients={clients.data} value={owner} onChange={setOwner} /> : <Loading />}
        <Field label={t('email.address')} value={address} onChangeText={setAddress} keyboard="email-address" testID="email-address" />
        <Field label={t('client.password')} value={password} onChangeText={setPassword} secure hint={t('email.newPasswordHint')} testID="email-new-password" />
        <Field label={t('email.quota')} value={quota} onChangeText={setQuota} hint={t('email.quotaHint')} testID="email-quota-input" />
        {quotaError ? <Notice tone="danger">{t('email.quotaHint')}</Notice> : null}
        <Field label={t('email.description')} value={description} onChangeText={setDescription} autoCapitalize="sentences" />
      </Card>
      {form.footer}
      {!form.done ? (
        <Button label={t('common.create')} onPress={save} busy={form.busy} disabled={owner === undefined || !address.includes('@')} testID="form-submit" />
      ) : null}
    </Screen>
  );
}

export function DatabaseFormScreen({ clientId }: { clientId?: number }) {
  const { t, client } = useApp();
  const nav = useNav();
  const { clients, owner, setOwner } = useOwner(clientId);
  const [name, setName] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [description, setDescription] = useState('');
  const form = useSubmit();
  const save = () => {
    if (!client || owner === undefined) return;
    void form.submit(() =>
      client.createDatabase({
        id_user: owner,
        database_name: name.trim() || undefined,
        database_username: user.trim() || undefined,
        password: password || undefined,
        description,
      })
    );
  };
  return (
    <Screen title={t('database.new')} onBack={nav.pop} testID="screen-database-form">
      {clients.error ? <ErrorPanel error={clients.error} onRetry={clients.reload} /> : null}
      <Card>
        {clients.data ? <ClientPicker clients={clients.data} value={owner} onChange={setOwner} /> : <Loading />}
        <Field label={t('database.name')} value={name} onChangeText={setName} hint={t('database.nameHint')} testID="database-name" />
        <Field label={t('database.user')} value={user} onChangeText={setUser} testID="database-user" />
        <Field label={t('client.password')} value={password} onChangeText={setPassword} secure hint={t('client.passwordHint')} />
        <Field label={t('email.description')} value={description} onChangeText={setDescription} autoCapitalize="sentences" />
      </Card>
      {form.footer}
      {!form.done ? <Button label={t('common.create')} onPress={save} busy={form.busy} disabled={owner === undefined} testID="form-submit" /> : null}
    </Screen>
  );
}
