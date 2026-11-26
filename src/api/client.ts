// A typed client for the KeyHelp REST API v2 (documented version 2.15). Every request carries the
// key in the X-API-Key header and goes to https://<panel>/api/v2/<endpoint>. Only endpoints that
// the API documents are used; docs/api.md lists them.

import { classifyFetchError, KeyHelpError, kindForStatus } from './errors';
import type {
  BackupOperation,
  Certificate,
  Client,
  ClientCreate,
  ClientStats,
  ClientUpdate,
  Created,
  Database,
  DatabaseCreate,
  Domain,
  DomainCreate,
  EmailAccount,
  EmailCreate,
  FtpUser,
  HostingPlan,
  ScheduledTask,
  ServerInfo,
} from './types';
import { API_PREFIX, normalizeServerUrl } from './url';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** The panel's address; normalised with normalizeServerUrl (https only). */
  baseUrl: string;
  apiKey: string;
  /** Defaults to the global fetch. Tests pass the mock server's fetch. */
  fetch?: FetchLike;
  /** Per request, in milliseconds. */
  timeoutMs?: number;
  /** How long to wait before the one retry of a GET after a 500/503 (the server's web reload). */
  retryDelayMs?: number;
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function queryString(query: Query | undefined): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

const segment = (value: number) => {
  if (!Number.isInteger(value) || value < 0) throw new KeyHelpError('invalidUrl', `not an id: ${value}`);
  return String(value);
};

export class KeyHelpClient {
  readonly origin: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(options: ClientOptions) {
    this.origin = normalizeServerUrl(options.baseUrl);
    if (options.apiKey.trim() === '') throw new KeyHelpError('unauthorized', 'empty API key');
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retryDelayMs = options.retryDelayMs ?? 3_000;
  }

  private async send(method: string, path: string, options: RequestOptions): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { 'X-API-Key': this.apiKey, Accept: 'application/json' };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    try {
      return await this.fetchImpl(`${this.origin}${API_PREFIX}${path}${queryString(options.query)}`, {
        method,
        headers,
        body,
        signal: controller.signal,
        // The key must never be stored by an HTTP cache.
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
    } catch (error) {
      throw classifyFetchError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Sends one request and parses the JSON answer; a GET is retried once after a 500 or 503. */
  async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options: RequestOptions = {}): Promise<T> {
    let response = await this.send(method, path, options);
    if (method === 'GET' && (response.status === 500 || response.status === 503)) {
      await sleep(this.retryDelayMs);
      response = await this.send(method, path, options);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    let data: unknown;
    try {
      data = text === '' ? undefined : JSON.parse(text);
    } catch {
      if (response.ok) throw new KeyHelpError('invalidResponse', 'the answer is not JSON', { status: response.status });
    }
    if (!response.ok) {
      const apiMessage =
        typeof data === 'object' && data !== null && typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message: string }).message
          : undefined;
      throw new KeyHelpError(kindForStatus(response.status), apiMessage ?? `HTTP ${response.status}`, {
        status: response.status,
        apiMessage,
      });
    }
    return data as T;
  }

  private async list<T>(path: string, query?: Query): Promise<T[]> {
    const data = await this.request<unknown>('GET', path, { query });
    if (!Array.isArray(data)) throw new KeyHelpError('invalidResponse', `${path} did not return a list`);
    return data as T[];
  }

  // --- Server ---------------------------------------------------------------------------------

  /** GET /ping: checks address and key. */
  async ping(): Promise<boolean> {
    const data = await this.request<{ response?: string }>('GET', '/ping');
    return data?.response === 'pong';
  }

  /** GET /server: status, load, disk, memory, updates and the service ports. */
  server(): Promise<ServerInfo> {
    return this.request<ServerInfo>('GET', '/server');
  }

  // --- Clients --------------------------------------------------------------------------------

  clients(): Promise<Client[]> {
    return this.list<Client>('/clients', { sort: 'username', order: 'asc' });
  }

  client(id: number): Promise<Client> {
    return this.request<Client>('GET', `/clients/${segment(id)}`);
  }

  clientStats(id: number): Promise<ClientStats> {
    return this.request<ClientStats>('GET', `/clients/${segment(id)}/stats`);
  }

  createClient(body: ClientCreate): Promise<Created> {
    return this.request<Created>('POST', '/clients', { body });
  }

  updateClient(id: number, body: ClientUpdate): Promise<Created> {
    return this.request<Created>('PUT', `/clients/${segment(id)}`, { body });
  }

  /** Suspends (disables) or re-enables a client account with PUT /clients/{id}. */
  setClientSuspended(id: number, suspended: boolean): Promise<Created> {
    return this.updateClient(id, { is_suspended: suspended });
  }

  hostingPlans(): Promise<HostingPlan[]> {
    return this.list<HostingPlan>('/hosting-plans', { sort: 'name', order: 'asc' });
  }

  // --- Domains and certificates ---------------------------------------------------------------

  domains(): Promise<Domain[]> {
    return this.list<Domain>('/domains', { sort: 'domain', order: 'asc' });
  }

  domain(id: number): Promise<Domain> {
    return this.request<Domain>('GET', `/domains/${segment(id)}`);
  }

  createDomain(body: DomainCreate): Promise<Created> {
    return this.request<Created>('POST', '/domains', { body });
  }

  setDomainDisabled(id: number, disabled: boolean): Promise<Created> {
    return this.request<Created>('PUT', `/domains/${segment(id)}`, { body: { is_disabled: disabled } });
  }

  certificates(): Promise<Certificate[]> {
    return this.list<Certificate>('/certificates', { sort: 'name', order: 'asc' });
  }

  // --- E-mail ---------------------------------------------------------------------------------

  emails(): Promise<EmailAccount[]> {
    return this.list<EmailAccount>('/emails', { sort: 'email', order: 'asc' });
  }

  email(id: number): Promise<EmailAccount> {
    return this.request<EmailAccount>('GET', `/emails/${segment(id)}`);
  }

  createEmail(body: EmailCreate): Promise<Created> {
    return this.request<Created>('POST', '/emails', { body });
  }

  /**
   * Sets a new password with PUT /emails/{id}. An empty password asks the server to generate one;
   * it is then returned in `password` of the answer.
   */
  setEmailPassword(id: number, password: string): Promise<Created> {
    return this.request<Created>('PUT', `/emails/${segment(id)}`, { body: { password } });
  }

  // --- Databases, FTP, scheduled tasks, backups -----------------------------------------------

  databases(): Promise<Database[]> {
    return this.list<Database>('/databases', { sort: 'database_name', order: 'asc' });
  }

  createDatabase(body: DatabaseCreate): Promise<Created> {
    return this.request<Created>('POST', '/databases', { body });
  }

  ftpUsers(): Promise<FtpUser[]> {
    return this.list<FtpUser>('/ftp-users', { sort: 'username', order: 'asc' });
  }

  scheduledTasks(): Promise<ScheduledTask[]> {
    return this.list<ScheduledTask>('/scheduled-tasks', { sort: 'id', order: 'asc' });
  }

  /** GET /backups/operations, newest first; optionally only those started after a date. */
  backupOperations(options: { startedAfter?: string; state?: string } = {}): Promise<BackupOperation[]> {
    return this.list<BackupOperation>('/backups/operations', {
      sort: 'id',
      order: 'desc',
      started_after: options.startedAfter,
      state: options.state,
    });
  }
}
