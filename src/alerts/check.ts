// One check of every saved server: read status, certificates, mailboxes and backups, evaluate the
// alerts and keep the result (ids only for the notification de-duplication). Used by the alerts
// screen ("Check now") and by the background task.

import type { FetchLike } from '../api/client';
import { classifyFetchError, KeyHelpError } from '../api/errors';
import type { SecretStore } from '../state/secrets';
import { clientFor, loadServers, type KeyValueStore, type ServerEntry } from '../state/servers';
import { evaluateAlerts, newAlerts, type Alert, type Thresholds } from './evaluate';

export interface ServerResult {
  server: Pick<ServerEntry, 'id' | 'name'>;
  alerts: Alert[];
  /** Set when the server could not be checked. */
  error?: KeyHelpError['kind'];
  /** True when the key is not available (web session ended). */
  noKey?: boolean;
}

export interface CheckResult {
  checkedAt: string;
  results: ServerResult[];
}

export const LAST_CHECK_KEY = 'hostdesk.lastCheck.v1';

export async function loadLastCheck(store: KeyValueStore): Promise<CheckResult | null> {
  try {
    const raw = await store.getItem(LAST_CHECK_KEY);
    return raw ? (JSON.parse(raw) as CheckResult) : null;
  } catch {
    return null;
  }
}

export interface CheckDeps {
  store: KeyValueStore;
  secrets: SecretStore;
  thresholds: Thresholds;
  fetch?: FetchLike;
  now?: () => Date;
}

/** Runs one check; returns the result and the alerts that are new since the previous check. */
export async function checkAllServers(deps: CheckDeps): Promise<{ result: CheckResult; fresh: { server: string; alert: Alert }[] }> {
  const now = deps.now ?? (() => new Date());
  const previous = await loadLastCheck(deps.store);
  const servers = await loadServers(deps.store);
  const results: ServerResult[] = [];
  const fresh: { server: string; alert: Alert }[] = [];

  for (const entry of servers) {
    const base = { server: { id: entry.id, name: entry.name } };
    // The background check only reads, so its client never writes.
    const client = await clientFor(entry, deps.secrets, deps.fetch, true);
    if (!client) {
      results.push({ ...base, alerts: [], noKey: true });
      continue;
    }
    try {
      const [server, certificates, emails, backups] = await Promise.all([
        client.server(),
        client.certificates(),
        client.emails(),
        client.backupOperations({ startedAfter: new Date(now().getTime() - 7 * 86_400_000).toISOString() }),
      ]);
      const alerts = evaluateAlerts({ server, certificates, emails, backups }, deps.thresholds, now());
      results.push({ ...base, alerts });
      const before = previous?.results.find((r) => r.server.id === entry.id)?.alerts.map((a) => a.id) ?? [];
      for (const alert of newAlerts(before, alerts)) fresh.push({ server: entry.name, alert });
    } catch (error) {
      const kind = (error instanceof KeyHelpError ? error : classifyFetchError(error)).kind;
      results.push({ ...base, alerts: [], error: kind });
    }
  }

  const result: CheckResult = { checkedAt: now().toISOString(), results };
  await deps.store.setItem(LAST_CHECK_KEY, JSON.stringify(result));
  return { result, fresh };
}
