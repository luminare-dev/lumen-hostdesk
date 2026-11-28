// An in-memory stand-in for the KeyHelp API v2, for the unit tests (through `fetch`) and the e2e
// run (Playwright answers the app's requests with `handle`). It implements the endpoints the app
// uses, with the documented status codes, error bodies and auto-generated values, and checks the
// X-API-Key header. It is test code: it never talks to a network.

import type { FetchLike } from '../api/client';
import type { Client, Created, Database, DnsRecord, DnsSoa, Domain, EmailAccount } from '../api/types';
import { createFixtures, defaultDns, MOCK_API_KEY, type MockData } from './fixtures';

export interface MockRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | null;
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface MockOptions {
  apiKey?: string;
  now?: Date;
}

export interface MockServer {
  data: MockData;
  /** Every request seen, oldest first (method and path with query). */
  log: string[];
  /** Answers the next n requests with this status before handling them normally. */
  failNext(status: number, count?: number): void;
  handle(request: MockRequest): MockResponse;
  fetch: FetchLike;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'X-API-Key, Content-Type, Accept',
  'Access-Control-Max-Age': '600',
};

const STATUS_TEXT: Record<number, string> = {
  400: '400 Bad Request',
  401: '401 Unauthorized',
  403: '403 Forbidden',
  404: '404 Not Found',
  405: '405 Method Not Allowed',
  500: '500 Internal Server Error',
  503: '503 Service Unavailable',
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const json = (status: number, value: unknown): MockResponse => ({
  status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: value === undefined ? '' : JSON.stringify(value),
});

const errorBody = (status: number, message: string) =>
  json(status, { code: STATUS_TEXT[status] ?? String(status), message });

const USERNAME = /^[a-z][a-z0-9_-]{2,31}$/;
const DOMAIN = /^(?=.{3,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const EMAIL = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

function parseBody(body: string | null | undefined): Record<string, unknown> {
  if (!body) throw new HttpError(400, 'Invalid request body.');
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // falls through to the error below
  }
  throw new HttpError(400, 'Invalid request body.');
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function createMockKeyHelp(options: MockOptions = {}): MockServer {
  const apiKey = options.apiKey ?? MOCK_API_KEY;
  const data = createFixtures(options.now ?? new Date());
  const log: string[] = [];
  const failures: number[] = [];
  let nextId = 1000;
  let generated = 0;

  const generatePassword = () => {
    generated += 1;
    return `mock-generated-${generated}`;
  };

  const userExists = (id: unknown) => typeof id === 'number' && data.clients.some((c) => c.id === id);

  const byId = <T extends { id: number }>(items: T[], raw: string, what: string): T => {
    const item = items.find((entry) => entry.id === Number(raw));
    if (!item) throw new HttpError(404, `${what} not found.`);
    return item;
  };

  function sortList<T>(items: T[], query: URLSearchParams): T[] {
    const key = query.get('sort') ?? 'id';
    const desc = query.get('order') === 'desc';
    return [...items].sort((a, b) => {
      const va = (a as Record<string, unknown>)[key];
      const vb = (b as Record<string, unknown>)[key];
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return desc ? -cmp : cmp;
    });
  }

  function route(method: string, path: string, query: URLSearchParams, body: string | null | undefined): MockResponse {
    const parts = path.split('/').filter(Boolean);
    const [resource, id, sub] = parts;

    if (method === 'GET' && path === '/ping') return json(200, { response: 'pong' });
    if (method === 'GET' && path === '/server') return json(200, data.server);
    if (method === 'POST' && path === '/server/reboot') {
      const input = parseBody(body);
      if (input.confirm !== true) throw new HttpError(400, 'Invalid value for field "confirm".');
      data.reboots += 1;
      return json(202, undefined);
    }

    if (resource === 'clients') {
      if (!id) {
        if (method === 'GET') return json(200, sortList(data.clients, query));
        if (method === 'POST') {
          const input = parseBody(body);
          const username = str(input.username);
          const email = str(input.email);
          if (!USERNAME.test(username)) throw new HttpError(400, 'Invalid value for field "username".');
          if (data.clients.some((c) => c.username === username)) {
            throw new HttpError(400, 'The username is already in use.');
          }
          if (!EMAIL.test(email)) throw new HttpError(400, 'Invalid value for field "email".');
          const plan = typeof input.id_hosting_plan === 'number' ? input.id_hosting_plan : 1;
          if (!data.plans.some((p) => p.id === plan)) throw new HttpError(400, 'Invalid value for field "id_hosting_plan".');
          const created: Created = { id: nextId++ };
          const password = str(input.password);
          if (password === '') created.password = generatePassword();
          const contact = (input.contact_data ?? {}) as Client['contact_data'];
          data.clients.push({
            id: created.id,
            status: 3,
            username,
            email,
            language: str(input.language) || 'en',
            notes: str(input.notes),
            id_hosting_plan: plan,
            created_at: new Date().toISOString(),
            is_suspended: false,
            contact_data: contact,
          });
          return json(201, created);
        }
      } else {
        const client = byId(data.clients, id, 'Client');
        if (sub === 'stats' && method === 'GET') {
          const mine = <T extends { id_user: number }>(items: T[]) => items.filter((i) => i.id_user === client.id).length;
          const disk = [...data.emails, ...data.databases]
            .filter((i) => i.id_user === client.id)
            .reduce((sum, i) => sum + (i.size ?? 0), 0);
          return json(200, {
            disk_space: { value: disk, max: 10 * 1024 ** 3 },
            domains: { value: data.domains.filter((d) => d.id_user === client.id && !d.is_subdomain).length, max: 10 },
            subdomains: { value: data.domains.filter((d) => d.id_user === client.id && d.is_subdomain).length, max: 20 },
            email_accounts: { value: mine(data.emails), max: 20 },
            databases: { value: mine(data.databases), max: 5 },
            ftp_users: { value: mine(data.ftpUsers), max: 5 },
            scheduled_tasks: { value: mine(data.scheduledTasks), max: 5 },
          });
        }
        if (!sub && method === 'GET') return json(200, client);
        if (!sub && method === 'DELETE') {
          // "Deletes a client account and all associated resources."
          const own = <T extends { id_user?: number }>(items: T[]) => items.filter((i) => i.id_user !== client.id);
          for (const d of data.domains) if (d.id_user === client.id) delete data.dns[d.id];
          data.clients = data.clients.filter((c) => c.id !== client.id);
          data.domains = own(data.domains);
          data.emails = own(data.emails);
          data.databases = own(data.databases);
          data.ftpUsers = own(data.ftpUsers);
          data.scheduledTasks = own(data.scheduledTasks);
          data.certificates = own(data.certificates);
          return json(204, undefined);
        }
        if (!sub && method === 'PUT') {
          const input = parseBody(body);
          if (input.email !== undefined && !EMAIL.test(str(input.email))) {
            throw new HttpError(400, 'Invalid value for field "email".');
          }
          if (input.email !== undefined) client.email = str(input.email);
          if (typeof input.notes === 'string') client.notes = input.notes;
          if (typeof input.is_suspended === 'boolean') client.is_suspended = input.is_suspended;
          if (typeof input.contact_data === 'object' && input.contact_data !== null) {
            client.contact_data = { ...client.contact_data, ...(input.contact_data as Client['contact_data']) };
          }
          return json(200, { id: client.id });
        }
      }
    }

    if (resource === 'hosting-plans' && !id && method === 'GET') return json(200, sortList(data.plans, query));

    if (resource === 'domains') {
      if (!id) {
        if (method === 'GET') return json(200, sortList(data.domains, query));
        if (method === 'POST') {
          const input = parseBody(body);
          const name = str(input.domain).toLowerCase();
          if (!userExists(input.id_user)) throw new HttpError(400, 'Invalid value for field "id_user".');
          if (!DOMAIN.test(name)) throw new HttpError(400, 'Invalid value for field "domain".');
          if (data.domains.some((d) => d.domain === name)) throw new HttpError(400, 'The domain already exists.');
          const security = (input.security ?? {}) as Domain['security'];
          const domain: Domain = {
            id: nextId++,
            id_user: input.id_user as number,
            id_parent_domain: 0,
            status: 3,
            domain: name,
            domain_utf8: name,
            created_at: new Date().toISOString(),
            is_disabled: false,
            is_subdomain: false,
            is_email_domain: input.is_email_domain !== false,
            security: { id_certificate: 0, lets_encrypt: security?.lets_encrypt ?? false, force_https: false },
          };
          data.domains.push(domain);
          return json(201, { id: domain.id });
        }
      } else {
        const domain = byId(data.domains, id, 'Domain');
        if (method === 'GET') return json(200, domain);
        if (method === 'DELETE') {
          // The mock removes the subdomains and the mailboxes on the domain with it.
          const gone = new Set([domain.id, ...data.domains.filter((d) => d.id_parent_domain === domain.id).map((d) => d.id)]);
          data.domains = data.domains.filter((d) => !gone.has(d.id));
          data.emails = data.emails.filter((e) => e.id_domain === undefined || !gone.has(e.id_domain));
          for (const g of gone) delete data.dns[g];
          return json(204, undefined);
        }
        if (method === 'PUT') {
          const input = parseBody(body);
          if (typeof input.is_disabled === 'boolean') domain.is_disabled = input.is_disabled;
          return json(200, { id: domain.id });
        }
      }
    }

    if (resource === 'dns' && id && !sub) {
      const domain = byId(data.domains, id, 'Domain');
      // Only main domains have DNS settings; a subdomain id answers 404.
      if (domain.is_subdomain || !data.dns[domain.id]) throw new HttpError(404, 'Domain not found.');
      if (method === 'GET') return json(200, data.dns[domain.id]);
      if (method === 'DELETE') {
        data.dns[domain.id] = defaultDns();
        return json(204, undefined);
      }
      if (method === 'PUT') {
        const input = parseBody(body);
        if (typeof input.is_dns_disabled === 'boolean') {
          data.dns[domain.id] = { ...defaultDns(), is_custom_dns: input.is_dns_disabled, is_dns_disabled: input.is_dns_disabled };
          return json(200, { id: domain.id });
        }
        const records = input.records as { soa?: unknown; other?: unknown } | undefined;
        if (typeof records !== 'object' || records === null || !Array.isArray(records.other)) {
          throw new HttpError(400, 'Invalid value for field "records".');
        }
        const other: DnsRecord[] = records.other.map((raw: unknown, index: number) => {
          const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
          const ttl = r.ttl === undefined ? 86400 : r.ttl;
          if (typeof r.host !== 'string' || r.host.trim() === '' || typeof r.type !== 'string' || typeof r.value !== 'string' || r.value.trim() === '') {
            throw new HttpError(400, `Invalid value for field "records.other.${index}".`);
          }
          if (typeof ttl !== 'number' || !Number.isInteger(ttl) || ttl < 1) throw new HttpError(400, `Invalid value for field "records.other.${index}.ttl".`);
          return { host: r.host, ttl, type: r.type.toUpperCase(), value: r.value };
        });
        const current = data.dns[domain.id];
        const soa = typeof records.soa === 'object' && records.soa !== null ? { ...current.records?.soa, ...(records.soa as object) } : current.records?.soa;
        data.dns[domain.id] = { ...current, is_custom_dns: true, is_dns_disabled: false, records: { soa: soa as DnsSoa | undefined, other } };
        return json(200, { id: domain.id });
      }
    }

    if (resource === 'certificates' && !id && method === 'GET') return json(200, sortList(data.certificates, query));

    if (resource === 'emails') {
      if (!id) {
        if (method === 'GET') return json(200, sortList(data.emails, query));
        if (method === 'POST') {
          const input = parseBody(body);
          const address = str(input.email).toLowerCase();
          if (!userExists(input.id_user)) throw new HttpError(400, 'Invalid value for field "id_user".');
          const match = EMAIL.exec(address);
          if (!match) throw new HttpError(400, 'Invalid value for field "email".');
          const domain = data.domains.find((d) => d.domain === match[1] && d.id_user === input.id_user);
          if (!domain) throw new HttpError(400, 'The domain does not belong to this client.');
          if (data.emails.some((e) => e.email === address)) throw new HttpError(400, 'The email address already exists.');
          const created: Created = { id: nextId++ };
          if (str(input.password) === '') created.password = generatePassword();
          const account: EmailAccount = {
            id: created.id,
            id_user: input.id_user as number,
            id_domain: domain.id,
            status: 3,
            email: address,
            email_utf8: address,
            description: str(input.description),
            size: 0,
            max_size: typeof input.max_size === 'number' ? input.max_size : 0,
            aliases: [],
            forwardings: [],
          };
          data.emails.push(account);
          return json(201, created);
        }
      } else {
        const account = byId(data.emails, id, 'Email account');
        if (method === 'GET') return json(200, account);
        if (method === 'DELETE') {
          data.emails = data.emails.filter((e) => e.id !== account.id);
          return json(204, undefined);
        }
        if (method === 'PUT') {
          const input = parseBody(body);
          const answer: Created = { id: account.id };
          if ('password' in input) {
            const password = input.password === null ? '' : str(input.password);
            if (password === '') answer.password = generatePassword();
            else if (password.length < 8) throw new HttpError(400, 'The password is too short.');
          }
          return json(200, answer);
        }
      }
    }

    if (resource === 'databases') {
      if (!id && method === 'GET') return json(200, sortList(data.databases, query));
      if (id && !sub) {
        const database = byId(data.databases, id, 'Database');
        if (method === 'GET') return json(200, database);
        if (method === 'DELETE') {
          data.databases = data.databases.filter((d) => d.id !== database.id);
          return json(204, undefined);
        }
      }
      if (!id && method === 'POST') {
        const input = parseBody(body);
        if (!userExists(input.id_user)) throw new HttpError(400, 'Invalid value for field "id_user".');
        const owner = data.clients.find((c) => c.id === input.id_user) as Client;
        const created: Created = { id: nextId++ };
        let name = str(input.database_name);
        let user = str(input.database_username);
        if (name === '' || user === '') {
          const n = data.databases.filter((d) => d.id_user === owner.id).length + 1;
          name = name || `${owner.username}_db${n}`;
          user = user || name;
          created.database_name = name;
          created.database_username = user;
        }
        if (!/^[a-z0-9_]{3,64}$/i.test(name)) throw new HttpError(400, 'Invalid value for field "database_name".');
        if (data.databases.some((d) => d.database_name === name)) throw new HttpError(400, 'The database already exists.');
        if (str(input.password) === '') created.password = generatePassword();
        const database: Database = {
          id: created.id,
          id_user: owner.id,
          database_name: name,
          database_username: user,
          description: str(input.description),
          size: 0,
          remote_hosts: [],
        };
        data.databases.push(database);
        return json(201, created);
      }
    }

    if (resource === 'ftp-users' && !id && method === 'GET') return json(200, sortList(data.ftpUsers, query));
    if (resource === 'scheduled-tasks' && !id && method === 'GET') return json(200, sortList(data.scheduledTasks, query));
    if (resource === 'backups' && id === 'operations' && method === 'GET') {
      const after = query.get('started_after');
      const state = query.get('state');
      const items = data.backups.filter(
        (b) => (!after || (b.started_at ?? '') >= after) && (!state || b.state === state)
      );
      return json(200, query.get('order') === 'asc' ? [...items].reverse() : items);
    }

    throw new HttpError(404, 'The requested endpoint was not found.');
  }

  function handle(request: MockRequest): MockResponse {
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS') return { status: 204, headers: CORS, body: '' };
    const match = /^https:\/\/[^/]+\/api\/v2(\/[^?#]*)(?:\?([^#]*))?/.exec(request.url);
    const path = match ? match[1].replace(/\/+$/, '') || '/' : '';
    const query = new URLSearchParams(match?.[2] ?? '');
    log.push(`${method} ${path}${match?.[2] ? `?${match[2]}` : ''}`);
    const failure = failures.shift();
    if (failure !== undefined) return errorBody(failure, 'Simulated failure.');
    if (!match) return errorBody(404, 'The requested endpoint was not found.');
    const key = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'x-api-key')?.[1];
    if (key !== apiKey) return errorBody(401, 'Invalid API key.');
    try {
      return route(method, path, query, request.body);
    } catch (error) {
      if (error instanceof HttpError) return errorBody(error.status, error.message);
      return errorBody(500, error instanceof Error ? error.message : 'error');
    }
  }

  const mockFetch: FetchLike = async (input, init) => {
    const headers: Record<string, string> = {};
    const raw = init?.headers;
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && !(typeof Headers !== 'undefined' && raw instanceof Headers)) {
      Object.assign(headers, raw as Record<string, string>);
    }
    const answer = handle({
      method: init?.method ?? 'GET',
      url: input,
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    // A minimal Response: the client reads status, ok and text() only.
    const response = {
      status: answer.status,
      ok: answer.status >= 200 && answer.status < 300,
      headers: answer.headers,
      text: async () => answer.body,
      json: async () => JSON.parse(answer.body) as unknown,
    };
    return response as unknown as Response;
  };

  return {
    data,
    log,
    failNext(status, count = 1) {
      for (let i = 0; i < count; i += 1) failures.push(status);
    },
    handle,
    fetch: mockFetch,
  };
}
