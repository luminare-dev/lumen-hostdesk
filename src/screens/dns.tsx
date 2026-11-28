// DNS of a main domain over GET/PUT/DELETE /dns/{id}. The API has no record ids and PUT replaces
// the whole set, so every change loads the current set again, checks that the edited record is
// still there unchanged, and sends the complete list back.

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { KeyHelpClient } from '../api/client';
import {
  cleanRecord,
  DEFAULT_TTL,
  EDITABLE_TYPES,
  isDelegationRecord,
  sameRecord,
  validateRecords,
  validateSoa,
  type EditableType,
} from '../api/dns';
import type { DnsRecord, DnsSoa } from '../api/types';
import { useNav } from '../navigation';
import { useApp } from '../state/AppProvider';
import { useResource } from '../state/useResource';
import {
  Badge,
  Button,
  Card,
  ErrorPanel,
  Field,
  KeyValue,
  ListRow,
  Loading,
  Notice,
  Screen,
  Section,
  Segmented,
  T,
  TypedConfirmDialog,
} from '../ui/kit';
import { useAction } from './details';

const DKIM_PLACEHOLDER = '<DKIM_RECORD_VALUE>';

const isEditableType = (type: string): type is EditableType => (EDITABLE_TYPES as readonly string[]).includes(type.toUpperCase());

function useDns(domainId: number) {
  const { client } = useApp();
  return useResource(client, `dns:${domainId}`, async (c) => {
    const [dns, domain] = await Promise.all([c.dns(domainId), c.domain(domainId)]);
    return { dns, name: domain.domain_utf8 ?? domain.domain, ascii: domain.domain };
  });
}

/** Loads the current set, applies a change to it and sends the whole set back. */
async function applyChange(
  client: KeyHelpClient,
  domainId: number,
  change: (records: DnsRecord[], soa: DnsSoa | undefined) => { other: DnsRecord[]; soa?: DnsSoa }
): Promise<void> {
  const fresh = await client.dns(domainId);
  const next = change(fresh.records?.other ?? [], fresh.records?.soa);
  await client.setDnsRecords(domainId, { soa: next.soa ?? fresh.records?.soa, other: next.other });
}

export function DnsScreen({ domainId }: { domainId: number }) {
  const { t, client, readOnly } = useApp();
  const nav = useNav();
  const dns = useDns(domainId);
  const reset = useAction();
  const [resetOpen, setResetOpen] = useState(false);
  const data = dns.data;
  const records = data?.dns.records?.other ?? [];
  const soa = data?.dns.records?.soa;

  return (
    <Screen title={data ? t('dns.title', { name: data.name }) : t('dns.open')} onBack={nav.pop} testID="screen-dns">
      {dns.error ? <ErrorPanel error={dns.error} onRetry={dns.reload} /> : null}
      {!data && dns.loading ? <Loading /> : null}
      {data ? (
        <>
          <Notice tone="info">{t('dns.intro')}</Notice>
          {data.dns.is_dns_disabled ? (
            <Notice tone="warning" testID="dns-disabled">
              {t('dns.disabled')}
            </Notice>
          ) : null}
          {soa ? (
            <Section title={t('dns.soa')}>
              <Card testID="dns-soa">
                <KeyValue label={t('dns.primaryNs')} value={soa.primary_ns} />
                <KeyValue label="RNAME" value={soa.rname} />
                <T variant="caption">
                  {`TTL ${soa.ttl} · refresh ${soa.refresh} · retry ${soa.retry} · expire ${soa.expire} · minimum ${soa.minimum}`}
                </T>
                {!readOnly ? (
                  <View style={{ alignSelf: 'flex-start' }}>
                    <Button label={t('dns.soaEdit')} kind="secondary" compact onPress={() => nav.push({ name: 'dnsSoa', domainId })} testID="dns-soa-edit" />
                  </View>
                ) : null}
              </Card>
            </Section>
          ) : null}
          <Section
            title={t('dns.records')}
            right={data.dns.is_custom_dns ? <Badge label={t('dns.custom')} tone="info" testID="dns-custom" /> : undefined}
          >
            {records.map((record, index) => {
              const editable = !readOnly && isEditableType(record.type);
              return (
                <ListRow
                  key={`${index}-${record.host}-${record.type}`}
                  title={`${record.host}   ${record.type.toUpperCase()}`}
                  titleLines={2}
                  subtitle={`${record.value === DKIM_PLACEHOLDER ? t('dns.dkim') : record.value} · TTL ${record.ttl}`}
                  right={isDelegationRecord(record) ? <Badge label="NS" tone="warning" /> : undefined}
                  onPress={editable ? () => nav.push({ name: 'dnsRecord', domainId, index }) : undefined}
                  testID={`dns-record-${index}`}
                />
              );
            })}
            {!readOnly ? <Button label={t('dns.add')} onPress={() => nav.push({ name: 'dnsRecord', domainId })} testID="dns-add" /> : null}
          </Section>
          {!readOnly && data.dns.is_custom_dns ? (
            <>
              <Button
                label={t('dns.reset')}
                kind="ghost"
                onPress={() => {
                  reset.reset();
                  setResetOpen(true);
                }}
                testID="dns-reset"
              />
              <TypedConfirmDialog
                visible={resetOpen}
                title={t('dns.resetTitle', { name: data.name })}
                body={t('dns.resetBody')}
                accepted={[...new Set([data.name, data.ascii])]}
                confirmLabel={t('dns.reset')}
                busy={reset.busy}
                error={reset.error}
                onCancel={() => setResetOpen(false)}
                onConfirm={async () => {
                  const done = await reset.run(async () => {
                    await client?.resetDns(domainId);
                    return true;
                  });
                  if (done) {
                    setResetOpen(false);
                    dns.reload();
                  }
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

export function DnsRecordScreen({ domainId, index }: { domainId: number; index?: number }) {
  const { t, client, readOnly } = useApp();
  const nav = useNav();
  const dns = useDns(domainId);
  const save = useAction();
  const remove = useAction();
  const [changed, setChanged] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const records = dns.data?.dns.records?.other;
  const original = index !== undefined ? records?.[index] : undefined;
  const [ready, setReady] = useState(index === undefined);
  const [type, setType] = useState<EditableType>('A');
  const [host, setHost] = useState('');
  const [ttl, setTtl] = useState(String(DEFAULT_TTL));
  const [value, setValue] = useState('');

  useEffect(() => {
    if (ready || !original) return;
    if (isEditableType(original.type)) setType(original.type.toUpperCase() as EditableType);
    setHost(original.host);
    setTtl(String(original.ttl));
    setValue(original.value);
    setReady(true);
  }, [original, ready]);

  const draft: DnsRecord = { host, ttl: ttl.trim() === '' ? Number.NaN : Number(ttl), type, value };
  // Checked as part of the whole set, so a CNAME next to another record at the same name shows.
  const list = records ? (index !== undefined ? records.map((r, i) => (i === index ? draft : r)) : [...records, draft]) : [draft];
  const position = index ?? list.length - 1;
  const issue = validateRecords(list).find((entry) => entry.index === position)?.issue;
  const showIssue = issue !== undefined && (host.trim() !== '' || value.trim() !== '');
  const delegation = isDelegationRecord(draft) || (original !== undefined && isDelegationRecord(original));

  /**
   * Loads the current set, checks that the edited record is still at its place unchanged, and
   * sends the whole set back with the change applied.
   */
  const guarded = async (action: typeof save, change: (current: DnsRecord[]) => DnsRecord[]) => {
    if (!client) return false;
    setChanged(false);
    let moved = false;
    const done = await action.run(async () => {
      const fresh = await client.dns(domainId);
      const current = fresh.records?.other ?? [];
      if (index !== undefined && (!original || !current[index] || !sameRecord(current[index], original))) {
        moved = true;
        return false;
      }
      await client.setDnsRecords(domainId, { soa: fresh.records?.soa, other: change(current) });
      return true;
    });
    if (moved) setChanged(true);
    return done === true;
  };

  const onSave = async () => {
    const record = cleanRecord(draft);
    const ok = await guarded(save, (current) => (index !== undefined ? current.map((r, i) => (i === index ? record : r)) : [...current, record]));
    if (ok) nav.pop();
  };

  const onDelete = async () => {
    const ok = await guarded(remove, (current) => current.filter((_, i) => i !== index));
    if (ok) {
      setDeleteOpen(false);
      nav.pop();
    }
  };

  const editing = index !== undefined;
  return (
    <Screen title={editing ? t('dns.edit') : t('dns.add')} onBack={nav.pop} testID="screen-dns-record">
      {dns.error ? <ErrorPanel error={dns.error} onRetry={dns.reload} /> : null}
      {!dns.data && dns.loading ? <Loading /> : null}
      {readOnly ? <Notice tone="info">{t('readOnly.notice')}</Notice> : null}
      {editing && dns.data && !original ? <Notice tone="warning">{t('dns.changed')}</Notice> : null}
      {dns.data && ready && !readOnly ? (
        <>
          <Segmented<EditableType>
            label={t('dns.type')}
            value={type}
            onChange={setType}
            options={EDITABLE_TYPES.map((name) => ({ value: name, label: name }))}
            testID="dns-type"
          />
          {delegation ? (
            <Notice tone="warning" testID="dns-ns-warning">
              {t('dns.nsWarning')}
            </Notice>
          ) : null}
          <Field label={t('dns.host')} value={host} onChangeText={setHost} placeholder="@" hint={t('dns.hostHint')} testID="dns-host" />
          <Field label={t('dns.ttl')} value={ttl} onChangeText={setTtl} keyboard="number-pad" testID="dns-ttl" />
          <Field
            label={t('dns.value')}
            value={value}
            onChangeText={setValue}
            hint={value === DKIM_PLACEHOLDER ? t('dns.dkim') : t(`dns.hint.${type}`)}
            testID="dns-value"
          />
          {showIssue && issue ? (
            <Notice tone="danger" testID="dns-issue">
              {t(`dns.issue.${issue}`)}
            </Notice>
          ) : null}
          {changed ? (
            <Notice tone="warning" testID="dns-changed">
              {t('dns.changed')}
            </Notice>
          ) : null}
          {save.error ? <ErrorPanel error={save.error} /> : null}
          <Button label={t('common.save')} onPress={onSave} busy={save.busy} disabled={issue !== undefined} testID="dns-save" />
          {editing && original ? (
            <>
              <Button
                label={t('dns.delete')}
                kind="danger"
                onPress={() => {
                  remove.reset();
                  setDeleteOpen(true);
                }}
                testID="dns-delete"
              />
              <TypedConfirmDialog
                visible={deleteOpen}
                title={t('dns.deleteTitle', { type: original.type.toUpperCase(), host: original.host })}
                body={t('dns.deleteBody', { value: original.value })}
                accepted={[original.host]}
                confirmLabel={t('dns.delete')}
                busy={remove.busy}
                error={remove.error}
                onCancel={() => setDeleteOpen(false)}
                onConfirm={onDelete}
              >
                {isDelegationRecord(original) ? <Notice tone="warning">{t('dns.nsWarning')}</Notice> : null}
                {changed ? <Notice tone="warning">{t('dns.changed')}</Notice> : null}
              </TypedConfirmDialog>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const SOA_FIELDS = ['ttl', 'refresh', 'retry', 'expire', 'minimum'] as const;

export function DnsSoaScreen({ domainId }: { domainId: number }) {
  const { t, client, readOnly } = useApp();
  const nav = useNav();
  const dns = useDns(domainId);
  const save = useAction();
  const soa = dns.data?.dns.records?.soa;
  const [form, setForm] = useState<Record<keyof DnsSoa, string>>();

  useEffect(() => {
    if (form || !soa) return;
    setForm({
      ttl: String(soa.ttl),
      primary_ns: soa.primary_ns,
      rname: soa.rname,
      refresh: String(soa.refresh),
      retry: String(soa.retry),
      expire: String(soa.expire),
      minimum: String(soa.minimum),
    });
  }, [form, soa]);

  const number = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));
  const draft: DnsSoa | undefined = form
    ? {
        ttl: number(form.ttl),
        primary_ns: form.primary_ns.trim(),
        rname: form.rname.trim(),
        refresh: number(form.refresh),
        retry: number(form.retry),
        expire: number(form.expire),
        minimum: number(form.minimum),
      }
    : undefined;
  const issue = draft ? validateSoa(draft) : null;
  const label = { ttl: t('dns.ttl'), refresh: t('dns.refresh'), retry: t('dns.retry'), expire: t('dns.expire'), minimum: t('dns.minimum') };

  const onSave = async () => {
    if (!client || !draft || issue) return;
    const done = await save.run(async () => {
      await applyChange(client, domainId, (current) => ({ other: current, soa: draft }));
      return true;
    });
    if (done) nav.pop();
  };

  return (
    <Screen title={t('dns.soaEdit')} onBack={nav.pop} testID="screen-dns-soa">
      {dns.error ? <ErrorPanel error={dns.error} onRetry={dns.reload} /> : null}
      {!dns.data && dns.loading ? <Loading /> : null}
      {readOnly ? <Notice tone="info">{t('readOnly.notice')}</Notice> : null}
      {form && !readOnly ? (
        <>
          <Notice tone="warning" testID="dns-soa-warning">
            {t('dns.soaWarning')}
          </Notice>
          <Field label={t('dns.primaryNs')} value={form.primary_ns} onChangeText={(primary_ns) => setForm({ ...form, primary_ns })} testID="soa-primary_ns" />
          <Field label={t('dns.rname')} value={form.rname} onChangeText={(rname) => setForm({ ...form, rname })} testID="soa-rname" />
          {SOA_FIELDS.map((key) => (
            <Field
              key={key}
              label={label[key]}
              value={form[key]}
              keyboard="number-pad"
              onChangeText={(text) => setForm({ ...form, [key]: text })}
              testID={`soa-${key}`}
            />
          ))}
          {issue ? (
            <Notice tone="danger" testID="dns-issue">
              {t(`dns.issue.${issue}`)}
            </Notice>
          ) : null}
          {save.error ? <ErrorPanel error={save.error} /> : null}
          <Button label={t('common.save')} onPress={onSave} busy={save.busy} disabled={issue !== null} testID="dns-save" />
        </>
      ) : null}
    </Screen>
  );
}
