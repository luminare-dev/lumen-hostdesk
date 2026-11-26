// Turns a snapshot of one server into alerts. Pure functions: the background task, the alerts
// screen and the tests all use the same rules.

import type { BackupOperation, Certificate, EmailAccount, ServerInfo } from '../api/types';

export interface Thresholds {
  /** Warn when a certificate expires within this many days. */
  certDays: number;
  diskPercent: number;
  memoryPercent: number;
  /** Warn when a mailbox is this full (only mailboxes with a size limit). */
  quotaPercent: number;
  services: boolean;
  backups: boolean;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  certDays: 14,
  diskPercent: 85,
  memoryPercent: 90,
  quotaPercent: 90,
  services: true,
  backups: true,
};

export type AlertKind = 'certificateExpiring' | 'certificateExpired' | 'disk' | 'inodes' | 'memory' | 'service' | 'quota' | 'backup';

export interface Alert {
  /** Stable across checks, so a notification is sent once per problem, not on every check. */
  id: string;
  kind: AlertKind;
  severity: 'warning' | 'critical';
  /** Values for the message: domain, days, percent, service, port, address. */
  params: Record<string, string | number>;
}

export interface Snapshot {
  server?: ServerInfo;
  certificates?: Certificate[];
  emails?: EmailAccount[];
  backups?: BackupOperation[];
}

const DAY = 86_400_000;

export function evaluateAlerts(snapshot: Snapshot, thresholds: Thresholds, now: Date): Alert[] {
  const alerts: Alert[] = [];
  const util = snapshot.server?.utilization;

  for (const cert of snapshot.certificates ?? []) {
    if (!cert.valid_till) continue;
    const till = new Date(cert.valid_till).getTime();
    if (Number.isNaN(till)) continue;
    // Whole days left, rounded up: 8.9 days left reads as "in 9 days".
    const days = Math.ceil((till - now.getTime()) / DAY);
    const domain = cert.secured_domains?.[0] ?? cert.name;
    if (till <= now.getTime()) {
      alerts.push({ id: `cert-expired:${cert.id}:${cert.valid_till}`, kind: 'certificateExpired', severity: 'critical', params: { domain } });
    } else if (days < thresholds.certDays) {
      alerts.push({
        id: `cert:${cert.id}:${cert.valid_till}`,
        kind: 'certificateExpiring',
        severity: days < 3 ? 'critical' : 'warning',
        params: { domain, days },
      });
    }
  }

  const usage = (kind: 'disk' | 'inodes' | 'memory', percent: number | undefined, limit: number) => {
    if (percent === undefined || percent < limit) return;
    alerts.push({
      id: kind,
      kind,
      severity: percent >= Math.max(limit, 95) ? 'critical' : 'warning',
      params: { percent: Math.round(percent) },
    });
  };
  usage('disk', util?.disk_space?.percent, thresholds.diskPercent);
  usage('inodes', util?.inodes?.percent, thresholds.diskPercent);
  usage('memory', util?.memory?.percent, thresholds.memoryPercent);

  if (thresholds.services) {
    for (const port of snapshot.server?.ports ?? []) {
      if (port.status !== 'online') {
        alerts.push({
          id: `service:${port.service}:${port.port}`,
          kind: 'service',
          severity: 'critical',
          params: { service: port.service, port: port.port },
        });
      }
    }
  }

  for (const mailbox of snapshot.emails ?? []) {
    if (!mailbox.max_size || mailbox.max_size <= 0 || mailbox.size === undefined) continue;
    const percent = (mailbox.size / mailbox.max_size) * 100;
    if (percent >= thresholds.quotaPercent) {
      alerts.push({
        id: `quota:${mailbox.id}`,
        kind: 'quota',
        severity: percent >= 100 ? 'critical' : 'warning',
        params: { address: mailbox.email_utf8 ?? mailbox.email, percent: Math.round(percent) },
      });
    }
  }

  if (thresholds.backups) {
    // Only the latest operation per user and repository counts: a later success clears a failure.
    const latest = new Map<string, BackupOperation>();
    for (const op of snapshot.backups ?? []) {
      if (op.type !== undefined && op.type !== 'backup') continue;
      const key = `${op.id_user ?? '?'}:${op.id_repository ?? '?'}`;
      const seen = latest.get(key);
      if (!seen || (op.started_at ?? '') > (seen.started_at ?? '')) latest.set(key, op);
    }
    for (const [key, op] of latest) {
      if (op.state === 'failed' || op.state === 'error') {
        alerts.push({ id: `backup:${key}:${op.started_at ?? ''}`, kind: 'backup', severity: 'warning', params: {} });
      }
    }
  }

  const order = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** The alerts of `current` that were not in the previous check (by id), for notifications. */
export function newAlerts(previousIds: readonly string[], current: readonly Alert[]): Alert[] {
  const seen = new Set(previousIds);
  return current.filter((alert) => !seen.has(alert.id));
}
