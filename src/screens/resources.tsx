import { useMemo, useState, type ReactNode } from 'react';

import type { KeyHelpClient } from '../api/client';
import type { BackupOperation, Certificate, Client, Database, Domain, EmailAccount, FtpUser, ScheduledTask } from '../api/types';
import { formatBytes, formatDate, formatDateTime, type Translate, type Language } from '../i18n';
import { useNav, type ResourceKind, type Route } from '../navigation';
import { useApp } from '../state/AppProvider';
import { useResource } from '../state/useResource';
import { Badge, Button, ErrorPanel, ListRow, Loading, Screen, SearchBar, T, type Tone } from '../ui/kit';
import { NeedsKey } from './servers';

const DAY = 86_400_000;

export const KIND_TITLE = {
  clients: 'resources.clients',
  domains: 'resources.domains',
  certificates: 'resources.certificates',
  emails: 'resources.emails',
  databases: 'resources.databases',
  ftp: 'resources.ftp',
  cron: 'resources.cron',
  backups: 'resources.backups',
} as const;

const KINDS: ResourceKind[] = ['clients', 'domains', 'certificates', 'emails', 'databases', 'ftp', 'cron', 'backups'];

export function ResourcesScreen() {
  const { t, client } = useApp();
  const nav = useNav();
  const status = useResource(client, 'server', (c) => c.server());
  const r = status.data?.resources;
  const counts: Partial<Record<ResourceKind, number | undefined>> = {
    clients: r?.client_accounts,
    domains: r ? (r.domains ?? 0) + (r.subdomains ?? 0) : undefined,
    emails: r?.email_accounts,
    databases: r?.databases,
    ftp: r?.ftp_users,
    cron: r?.scheduled_tasks,
  };
  return (
    <Screen title={t('resources.title')} testID="screen-resources">
      {!client ? <NeedsKey /> : null}
      {KINDS.map((kind) => (
        <ListRow
          key={kind}
          title={t(KIND_TITLE[kind])}
          right={counts[kind] !== undefined ? <Badge label={String(counts[kind])} /> : undefined}
          onPress={() => nav.push({ name: 'list', kind })}
          testID={`resource-${kind}`}
        />
      ))}
    </Screen>
  );
}

export function certificateBadge(cert: Certificate | undefined, t: Translate, warnDays: number, now: Date = new Date()): { label: string; tone: Tone } {
  if (!cert) return { label: t('domain.noCertificate'), tone: 'neutral' };
  const till = cert.valid_till ? new Date(cert.valid_till).getTime() : Number.NaN;
  if (Number.isNaN(till)) return { label: cert.name, tone: 'neutral' };
  const left = till - now.getTime();
  if (left <= 0) return { label: t('domain.expired', { days: Math.floor(-left / DAY) }), tone: 'danger' };
  // Rounded up like the alerts: 8.9 days left reads as "in 9 days".
  const days = Math.ceil(left / DAY);
  return { label: t('domain.expiresIn', { days }), tone: days < 3 ? 'danger' : days < warnDays ? 'warning' : 'success' };
}

interface Row {
  key: string;
  search: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  route?: Route;
}

type Loaded = {
  clients: Client[];
  domains?: Domain[];
  certificates?: Certificate[];
  emails?: EmailAccount[];
  databases?: Database[];
  ftp?: FtpUser[];
  cron?: ScheduledTask[];
  backups?: BackupOperation[];
};

async function loadKind(c: KeyHelpClient, kind: ResourceKind): Promise<Loaded> {
  const clients = await c.clients();
  switch (kind) {
    case 'clients':
      return { clients };
    case 'domains': {
      const [domains, certificates] = await Promise.all([c.domains(), c.certificates()]);
      return { clients, domains, certificates };
    }
    case 'certificates':
      return { clients, certificates: await c.certificates() };
    case 'emails':
      return { clients, emails: await c.emails() };
    case 'databases':
      return { clients, databases: await c.databases() };
    case 'ftp':
      return { clients, ftp: await c.ftpUsers() };
    case 'cron':
      return { clients, cron: await c.scheduledTasks() };
    case 'backups':
      return { clients, backups: await c.backupOperations() };
  }
}

function rowsFor(kind: ResourceKind, data: Loaded, t: Translate, language: Language, warnDays: number): Row[] {
  const owner = (id: number | undefined) => data.clients.find((c) => c.id === id)?.username ?? (id !== undefined ? `#${id}` : '');
  switch (kind) {
    case 'clients':
      return data.clients.map((c) => {
        const person = [c.contact_data?.first_name, c.contact_data?.last_name].filter(Boolean).join(' ');
        return {
          key: String(c.id),
          search: `${c.username} ${c.email ?? ''} ${person} ${c.contact_data?.company ?? ''}`,
          title: c.username,
          subtitle: [c.contact_data?.company || person, c.email].filter(Boolean).join(' · '),
          right: c.is_suspended ? <Badge label={t('client.suspended')} tone="warning" /> : undefined,
          route: { name: 'client', id: c.id },
        };
      });
    case 'domains':
      return (data.domains ?? []).map((d) => {
        const cert = data.certificates?.find((c) => c.id === d.security?.id_certificate);
        const badge = d.is_disabled ? { label: t('domain.disabled'), tone: 'warning' as Tone } : certificateBadge(cert, t, warnDays);
        return {
          key: String(d.id),
          search: `${d.domain} ${d.domain_utf8 ?? ''} ${owner(d.id_user)}`,
          title: d.domain_utf8 ?? d.domain,
          subtitle: [owner(d.id_user), d.target?.is_forwarding && d.target.target ? t('domain.forwarding', { target: d.target.target }) : undefined]
            .filter(Boolean)
            .join(' · '),
          right: <Badge label={badge.label} tone={badge.tone} />,
          route: { name: 'domain', id: d.id },
        };
      });
    case 'certificates':
      return (data.certificates ?? [])
        .slice()
        .sort((a, b) => (a.valid_till ?? '').localeCompare(b.valid_till ?? ''))
        .map((c) => {
          const badge = certificateBadge(c, t, warnDays);
          return {
            key: String(c.id),
            search: `${c.name} ${(c.secured_domains ?? []).join(' ')} ${c.issuer ?? ''} ${owner(c.id_user)}`,
            title: c.name,
            subtitle: [(c.secured_domains ?? []).join(', '), t('domain.validTill', { date: formatDate(c.valid_till, language) })].join(' · '),
            right: <Badge label={badge.label} tone={badge.tone} />,
          };
        });
    case 'emails':
      return (data.emails ?? []).map((e) => {
        const limited = (e.max_size ?? 0) > 0;
        const percent = limited ? Math.round(((e.size ?? 0) / (e.max_size as number)) * 100) : undefined;
        return {
          key: String(e.id),
          search: `${e.email} ${e.email_utf8 ?? ''} ${(e.aliases ?? []).join(' ')} ${e.description ?? ''} ${owner(e.id_user)}`,
          title: e.email_utf8 ?? e.email,
          subtitle: [
            owner(e.id_user),
            limited
              ? t('common.of', { used: formatBytes(e.size, language), total: formatBytes(e.max_size, language) })
              : `${formatBytes(e.size, language)} · ${t('common.unlimited')}`,
          ].join(' · '),
          right: percent !== undefined ? <Badge label={`${percent} %`} tone={percent >= 90 ? 'warning' : 'neutral'} /> : undefined,
          route: { name: 'email', id: e.id },
        };
      });
    case 'databases':
      return (data.databases ?? []).map((d) => ({
        key: String(d.id),
        search: `${d.database_name} ${d.database_username} ${d.description ?? ''} ${owner(d.id_user)}`,
        title: d.database_name,
        subtitle: [
          owner(d.id_user),
          d.database_username,
          formatBytes(d.size, language),
          d.remote_hosts && d.remote_hosts.length > 0 ? t('database.remoteHosts', { hosts: d.remote_hosts.join(', ') }) : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        right: d.description ? <Badge label={d.description} /> : undefined,
      }));
    case 'ftp':
      return (data.ftp ?? []).map((f) => ({
        key: String(f.id),
        search: `${f.username} ${f.description ?? ''} ${owner(f.id_user)}`,
        title: f.username,
        subtitle: [owner(f.id_user), t('ftp.home', { path: f.home_directory ?? '/' }), f.description].filter(Boolean).join(' · '),
      }));
    case 'cron':
      return (data.cron ?? []).map((c) => {
        const s = c.schedule;
        return {
          key: String(c.id),
          search: `${c.description ?? ''} ${c.command ?? ''} ${owner(c.id_user)}`,
          title: c.description || c.command || `#${c.id}`,
          subtitle: [owner(c.id_user), s ? `${s.minute} ${s.hour} ${s.day_of_month} ${s.month} ${s.day_of_week}` : undefined, c.command]
            .filter(Boolean)
            .join(' · '),
          right: c.status === 2 ? <Badge label={t('cron.error')} tone="danger" /> : <Badge label={c.type ?? ''} />,
        };
      });
    case 'backups':
      return (data.backups ?? []).map((b, index) => {
        const tone: Tone = b.state === 'failed' ? 'danger' : b.state === 'finished' ? 'success' : 'info';
        const label =
          b.state === 'failed'
            ? t('backup.failed')
            : b.state === 'finished'
              ? t('backup.finished')
              : t('backup.processing', { progress: Math.round(b.progress ?? 0) });
        return {
          key: `${b.id_user ?? ''}-${b.started_at ?? index}`,
          search: `${b.description ?? ''} ${b.state ?? ''} ${owner(b.id_user)} ${b.messages ?? ''}`,
          title: `${owner(b.id_user)} · ${b.description ?? b.type ?? ''}`,
          subtitle: [t('backup.started', { date: formatDateTime(b.started_at, language) }), b.state === 'failed' ? b.messages : formatBytes(b.size_change, language)]
            .filter(Boolean)
            .join(' · '),
          right: <Badge label={label} tone={tone} />,
        };
      });
  }
}

const CREATE: Partial<Record<ResourceKind, Route>> = {
  clients: { name: 'clientForm' },
  domains: { name: 'domainForm' },
  emails: { name: 'emailForm' },
  databases: { name: 'databaseForm' },
};

export function ListScreen({ kind }: { kind: ResourceKind }) {
  const { t, client, language, settings } = useApp();
  const nav = useNav();
  const [query, setQuery] = useState('');
  const resource = useResource(client, `list:${kind}`, (c) => loadKind(c, kind));
  const rows = useMemo(
    () => (resource.data ? rowsFor(kind, resource.data, t, language, settings.thresholds.certDays) : []),
    [resource.data, kind, t, language, settings.thresholds.certDays]
  );
  const needle = query.trim().toLowerCase();
  const visible = needle ? rows.filter((row) => row.search.toLowerCase().includes(needle)) : rows;
  const create = CREATE[kind];

  return (
    <Screen
      title={t(KIND_TITLE[kind])}
      onBack={nav.pop}
      testID={`screen-list-${kind}`}
      right={create ? <Button label="+" compact onPress={() => nav.push(create)} testID="create" /> : undefined}
    >
      {!client ? <NeedsKey /> : null}
      <SearchBar value={query} onChange={setQuery} placeholder={t('common.search')} />
      {resource.error ? <ErrorPanel error={resource.error} onRetry={resource.reload} /> : null}
      {!resource.data && resource.loading ? <Loading /> : null}
      {resource.data && visible.length === 0 ? (
        <T variant="muted" testID="list-empty">
          {needle ? t('common.noMatch', { query }) : t('common.none')}
        </T>
      ) : null}
      {visible.map((row) => (
        <ListRow
          key={row.key}
          title={row.title}
          subtitle={row.subtitle}
          right={row.right}
          onPress={row.route ? () => nav.push(row.route as Route) : undefined}
          testID={`row-${kind}-${row.key}`}
        />
      ))}
    </Screen>
  );
}
