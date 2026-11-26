// The list of servers (name and address, no secrets) and the operations on it. The list is kept
// in the key-value store; each API key sits in the SecretStore under the server's id.

import { KeyHelpClient, type FetchLike } from '../api/client';
import { KeyHelpError } from '../api/errors';
import { hostOf, normalizeServerUrl } from '../api/url';
import type { SecretStore } from './secrets';

export interface ServerEntry {
  id: string;
  name: string;
  /** https://host[:port] */
  origin: string;
  addedAt: string;
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const SERVERS_KEY = 'hostdesk.servers.v1';
export const ACTIVE_KEY = 'hostdesk.activeServer.v1';

function isEntry(value: unknown): value is ServerEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.origin === 'string' && typeof v.addedAt === 'string';
}

export async function loadServers(store: KeyValueStore): Promise<ServerEntry[]> {
  const raw = await store.getItem(SERVERS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export async function saveServers(store: KeyValueStore, servers: ServerEntry[]): Promise<void> {
  await store.setItem(SERVERS_KEY, JSON.stringify(servers));
}

export function newServerId(now: Date = new Date(), random: () => number = Math.random): string {
  return `${now.getTime().toString(36)}${Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

export interface AddServerInput {
  name: string;
  url: string;
  apiKey: string;
}

export interface AddServerDeps {
  store: KeyValueStore;
  secrets: SecretStore;
  fetch?: FetchLike;
  now?: Date;
}

/**
 * Checks the address and key against the server (GET /ping, then GET /server for the host name),
 * and only then saves the entry and the key. Throws KeyHelpError when the check fails; nothing is
 * saved in that case. Adding the same address again replaces the key of the existing entry.
 */
export async function addServer(input: AddServerInput, deps: AddServerDeps): Promise<{ entry: ServerEntry; servers: ServerEntry[] }> {
  const origin = normalizeServerUrl(input.url);
  const apiKey = input.apiKey.trim();
  if (apiKey === '') throw new KeyHelpError('unauthorized', 'empty API key');
  const client = new KeyHelpClient({ baseUrl: origin, apiKey, fetch: deps.fetch });
  const pong = await client.ping();
  if (!pong) throw new KeyHelpError('invalidResponse', 'ping did not answer pong');

  const servers = await loadServers(deps.store);
  const existing = servers.find((s) => s.origin === origin);
  const name = input.name.trim() || hostOf(origin);
  const entry: ServerEntry = existing
    ? { ...existing, name: input.name.trim() || existing.name }
    : { id: newServerId(deps.now), name, origin, addedAt: (deps.now ?? new Date()).toISOString() };
  const next = existing ? servers.map((s) => (s.id === entry.id ? entry : s)) : [...servers, entry];
  await deps.secrets.set(entry.id, apiKey);
  await saveServers(deps.store, next);
  return { entry, servers: next };
}

export async function removeServer(id: string, deps: { store: KeyValueStore; secrets: SecretStore }): Promise<ServerEntry[]> {
  const servers = (await loadServers(deps.store)).filter((s) => s.id !== id);
  await deps.secrets.remove(id);
  await saveServers(deps.store, servers);
  return servers;
}

/** A client for a saved server, or null when its key is missing (web, after the session ended). */
export async function clientFor(entry: ServerEntry, secrets: SecretStore, fetchImpl?: FetchLike): Promise<KeyHelpClient | null> {
  const apiKey = await secrets.get(entry.id);
  if (!apiKey) return null;
  return new KeyHelpClient({ baseUrl: entry.origin, apiKey, fetch: fetchImpl });
}
