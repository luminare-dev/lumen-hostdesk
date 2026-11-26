import { KeyHelpClient } from '../api/client';
import { classifyFetchError, KeyHelpError } from '../api/errors';
import { MOCK_API_KEY, MOCK_ORIGIN } from '../mock/fixtures';
import { createMockKeyHelp } from '../mock/server';

const NOW = new Date('2026-11-20T10:00:00Z');

function setup(apiKey = MOCK_API_KEY) {
  const mock = createMockKeyHelp({ now: NOW });
  const client = new KeyHelpClient({ baseUrl: MOCK_ORIGIN, apiKey, fetch: mock.fetch, retryDelayMs: 0 });
  return { mock, client };
}

async function rejection(promise: Promise<unknown>): Promise<KeyHelpError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof KeyHelpError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
}

describe('KeyHelpClient', () => {
  it('sends the key in X-API-Key to /api/v2 and parses the answer', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const mock = createMockKeyHelp({ now: NOW });
    const client = new KeyHelpClient({
      baseUrl: 'panel.example.net',
      apiKey: ' mock-key ',
      fetch: (url, init) => {
        calls.push({ url, init });
        return mock.fetch(url, init);
      },
    });
    await expect(client.ping()).resolves.toBe(true);
    expect(calls[0].url).toBe('https://panel.example.net/api/v2/ping');
    expect((calls[0].init?.headers as Record<string, string>)['X-API-Key']).toBe('mock-key');
    expect(calls[0].init?.credentials).toBe('omit');
  });

  it('reads the server status', async () => {
    const { client } = setup();
    const server = await client.server();
    expect(server.meta?.hostname).toBe('panel.example.net');
    expect(server.utilization?.disk_space?.percent).toBeGreaterThan(0);
    expect(server.ports?.find((p) => p.service === 'FTP')?.status).toBe('offline');
  });

  it('lists resources sorted as requested', async () => {
    const { client, mock } = setup();
    const clients = await client.clients();
    expect(clients.map((c) => c.username)).toEqual(['atelier', 'bakery', 'club']);
    expect(mock.log).toContain('GET /clients?sort=username&order=asc');
    expect((await client.domains()).length).toBe(5);
    expect((await client.certificates()).length).toBe(4);
    expect((await client.emails()).length).toBe(5);
    expect((await client.databases()).length).toBe(3);
    expect((await client.ftpUsers()).length).toBe(2);
    expect((await client.scheduledTasks()).length).toBe(2);
    expect((await client.backupOperations()).length).toBe(3);
    expect((await client.hostingPlans()).map((p) => p.name)).toEqual(['Business', 'Default', 'Small']);
  });

  it('maps HTTP errors to kinds and keeps the API message', async () => {
    const wrongKey = setup('wrong-key').client;
    expect((await rejection(wrongKey.server())).kind).toBe('unauthorized');

    const { client } = setup();
    const notFound = await rejection(client.client(999));
    expect(notFound.kind).toBe('notFound');
    expect(notFound.status).toBe(404);

    const bad = await rejection(client.createClient({ username: 'atelier', email: 'new@atelier.example' }));
    expect(bad.kind).toBe('badRequest');
    expect(bad.apiMessage).toBe('The username is already in use.');
  });

  it('retries a GET once after a 503 (web server reload)', async () => {
    const { client, mock } = setup();
    mock.failNext(503);
    await expect(client.ping()).resolves.toBe(true);
    mock.failNext(503, 2);
    expect((await rejection(client.ping())).kind).toBe('server');
  });

  it('does not retry a write', async () => {
    const { client, mock } = setup();
    mock.failNext(500);
    expect((await rejection(client.setClientSuspended(2, true))).kind).toBe('server');
    expect(mock.data.clients.find((c) => c.id === 2)?.is_suspended).toBe(false);
  });

  it('creates a client and returns the generated password once', async () => {
    const { client, mock } = setup();
    const created = await client.createClient({ username: 'newco', email: 'office@newco.example' });
    expect(created.id).toBeGreaterThan(0);
    expect(created.password).toMatch(/^mock-generated-/);
    expect(mock.data.clients.some((c) => c.username === 'newco')).toBe(true);
  });

  it('suspends and edits a client', async () => {
    const { client } = setup();
    await client.setClientSuspended(3, true);
    expect((await client.client(3)).is_suspended).toBe(true);
    await client.updateClient(3, { notes: 'Moved', contact_data: { company: 'Bakery Two' } });
    const updated = await client.client(3);
    expect(updated.notes).toBe('Moved');
    expect(updated.contact_data?.company).toBe('Bakery Two');
    expect(updated.contact_data?.first_name).toBe('Theo');
  });

  it('creates a domain, an e-mail account and a database', async () => {
    const { client } = setup();
    const domain = await client.createDomain({ id_user: 3, domain: 'Bakery-Two.example', security: { lets_encrypt: true } });
    expect((await client.domain(domain.id)).domain).toBe('bakery-two.example');

    const mail = await client.createEmail({ id_user: 3, email: 'info@bakery-two.example', password: 'long-enough-1' });
    expect(mail.password).toBeUndefined();
    const foreign = await rejection(client.createEmail({ id_user: 2, email: 'x@bakery-two.example' }));
    expect(foreign.kind).toBe('badRequest');

    const db = await client.createDatabase({ id_user: 3 });
    expect(db.database_name).toBe('bakery_db2');
    expect(db.password).toMatch(/^mock-generated-/);
  });

  it('resets an e-mail password, generated or given', async () => {
    const { client } = setup();
    expect((await client.setEmailPassword(20, '')).password).toMatch(/^mock-generated-/);
    expect((await client.setEmailPassword(20, 'a-new-password')).password).toBeUndefined();
    expect((await rejection(client.setEmailPassword(20, 'short'))).kind).toBe('badRequest');
  });

  it('disables a domain', async () => {
    const { client } = setup();
    await client.setDomainDisabled(10, true);
    expect((await client.domain(10)).is_disabled).toBe(true);
  });

  it('filters backup operations', async () => {
    const { client } = setup();
    expect((await client.backupOperations({ state: 'failed' })).length).toBe(1);
  });

  it('refuses a non-https address and an empty key', () => {
    expect(() => new KeyHelpClient({ baseUrl: 'http://panel.example.net', apiKey: 'k' })).toThrow(KeyHelpError);
    expect(() => new KeyHelpClient({ baseUrl: 'panel.example.net', apiKey: '  ' })).toThrow(KeyHelpError);
  });

  it('reports a non-JSON answer and a list that is not a list', async () => {
    const html = new KeyHelpClient({
      baseUrl: MOCK_ORIGIN,
      apiKey: 'k',
      fetch: async () => ({ status: 200, ok: true, text: async () => '<html>' }) as unknown as Response,
    });
    expect((await rejection(html.server())).kind).toBe('invalidResponse');
    const object = new KeyHelpClient({
      baseUrl: MOCK_ORIGIN,
      apiKey: 'k',
      fetch: async () => ({ status: 200, ok: true, text: async () => '{}' }) as unknown as Response,
    });
    expect((await rejection(object.clients())).kind).toBe('invalidResponse');
  });

  it('classifies a failed fetch', async () => {
    const failing = (message: string, name = 'TypeError') =>
      new KeyHelpClient({
        baseUrl: MOCK_ORIGIN,
        apiKey: 'k',
        fetch: async () => {
          const error = new Error(message);
          error.name = name;
          throw error;
        },
      });
    expect((await rejection(failing('net::ERR_CERT_DATE_INVALID').ping())).kind).toBe('certificate');
    expect((await rejection(failing('The certificate for this server is invalid.').ping())).kind).toBe('certificate');
    expect((await rejection(failing('Network request failed').ping())).kind).toBe('network');
    expect((await rejection(failing('aborted', 'AbortError').ping())).kind).toBe('timeout');
  });
});

describe('classifyFetchError', () => {
  it('reads the Android trust error', () => {
    expect(classifyFetchError(new Error('java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.')).kind).toBe(
      'certificate'
    );
  });
});
