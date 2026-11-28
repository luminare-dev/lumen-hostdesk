import { KeyHelpClient } from '../api/client';
import { cleanRecord, isIpv6, sameRecord, validateRecord, validateRecords, validateSoa } from '../api/dns';
import { KeyHelpError } from '../api/errors';
import type { DnsRecord } from '../api/types';
import { MOCK_API_KEY, MOCK_ORIGIN } from '../mock/fixtures';
import { createMockKeyHelp } from '../mock/server';
import { confirmWithDevice } from '../state/deviceAuth';
import { createSessionSecretStore } from '../state/secrets';
import {
  addServer,
  clientFor,
  effectiveReadOnly,
  loadServers,
  readOnlySetting,
  setServerReadOnly,
  unlocksWrites,
  type KeyValueStore,
} from '../state/servers';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../state/settings';

// The native module is not there under Jest; the tests pass their own stand-in.
jest.mock('expo-local-authentication', () => ({ SecurityLevel: { NONE: 0 }, getEnrolledLevelAsync: jest.fn(), authenticateAsync: jest.fn() }));

const NOW = new Date('2026-11-20T10:00:00Z');

function setup(readOnly: boolean | (() => boolean) = false) {
  const mock = createMockKeyHelp({ now: NOW });
  const client = new KeyHelpClient({ baseUrl: MOCK_ORIGIN, apiKey: MOCK_API_KEY, fetch: mock.fetch, retryDelayMs: 0, readOnly });
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

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

describe('deletes', () => {
  it('deletes a mailbox, a database and a domain with the documented endpoints', async () => {
    const { client, mock } = setup();
    await client.deleteEmail(21);
    expect(mock.log).toContain('DELETE /emails/21');
    expect(mock.data.emails.some((e) => e.id === 21)).toBe(false);

    expect((await client.database(30)).database_name).toBe('atelier_wp');
    await client.deleteDatabase(30);
    expect(mock.log).toContain('DELETE /databases/30');
    expect((await rejection(client.database(30))).kind).toBe('notFound');

    await client.deleteDomain(12);
    expect(mock.log).toContain('DELETE /domains/12');
    expect((await rejection(client.domain(12))).kind).toBe('notFound');
  });

  it('deletes a client with everything that belongs to it', async () => {
    const { client, mock } = setup();
    await client.deleteClient(2);
    expect(mock.log).toContain('DELETE /clients/2');
    expect(mock.data.clients.map((c) => c.id)).toEqual([3, 4]);
    expect(mock.data.domains.some((d) => d.id_user === 2)).toBe(false);
    expect(mock.data.emails.some((e) => e.id_user === 2)).toBe(false);
    expect(mock.data.databases.some((d) => d.id_user === 2)).toBe(false);
  });

  it('reports a missing object and never retries a delete', async () => {
    const { client, mock } = setup();
    expect((await rejection(client.deleteEmail(999))).kind).toBe('notFound');
    mock.failNext(503);
    expect((await rejection(client.deleteDatabase(31))).kind).toBe('server');
    expect(mock.log.filter((line) => line === 'DELETE /databases/31')).toHaveLength(1);
    expect(mock.data.databases.some((d) => d.id === 31)).toBe(true);
  });
});

describe('reboot', () => {
  it('posts the confirmation flag and accepts the 202', async () => {
    const calls: { url: string; body?: unknown }[] = [];
    const mock = createMockKeyHelp({ now: NOW });
    const client = new KeyHelpClient({
      baseUrl: MOCK_ORIGIN,
      apiKey: MOCK_API_KEY,
      fetch: (url, init) => {
        calls.push({ url, body: init?.body });
        return mock.fetch(url, init);
      },
    });
    await expect(client.rebootServer()).resolves.toBeUndefined();
    expect(calls[0].url).toBe(`${MOCK_ORIGIN}/api/v2/server/reboot`);
    expect(calls[0].body).toBe('{"confirm":true}');
    expect(mock.data.reboots).toBe(1);
  });
});

describe('DNS', () => {
  it('reads the records of a main domain and answers 404 for a subdomain', async () => {
    const { client } = setup();
    const dns = await client.dns(10);
    expect(dns.records?.soa?.primary_ns).toBe('ns1.example.net.');
    expect(dns.records?.other?.some((r) => r.type === 'MX' && r.value === '10 mail')).toBe(true);
    expect((await rejection(client.dns(11))).kind).toBe('notFound');
  });

  it('sends the whole record set with PUT and resets it with DELETE', async () => {
    const { client, mock } = setup();
    const before = (await client.dns(10)).records?.other ?? [];
    const added: DnsRecord = { host: 'www', ttl: 3600, type: 'CNAME', value: '@' };
    await client.setDnsRecords(10, { other: [...before, added] });
    const after = await client.dns(10);
    expect(after.is_custom_dns).toBe(true);
    expect(after.records?.other).toHaveLength(before.length + 1);
    expect(after.records?.soa?.primary_ns).toBe('ns1.example.net.');

    await client.resetDns(10);
    expect(mock.log).toContain('DELETE /dns/10');
    expect((await client.dns(10)).records?.other).toHaveLength(before.length);
  });

  it('shows the server rejection of a broken record', async () => {
    const { client } = setup();
    const error = await rejection(client.setDnsRecords(10, { other: [{ host: '', ttl: 60, type: 'A', value: '192.0.2.1' }] }));
    expect(error.kind).toBe('badRequest');
  });
});

describe('read-only guard in the client', () => {
  it('refuses every write before it is sent and still reads', async () => {
    const { client, mock } = setup(true);
    expect(client.readOnly).toBe(true);
    const writes: (() => Promise<unknown>)[] = [
      () => client.deleteClient(2),
      () => client.deleteDomain(10),
      () => client.deleteEmail(20),
      () => client.deleteDatabase(30),
      () => client.rebootServer(),
      () => client.setDnsRecords(10, { other: [] }),
      () => client.resetDns(10),
      () => client.setClientSuspended(2, true),
      () => client.createClient({ username: 'newco', email: 'office@newco.example' }),
      () => client.setEmailPassword(20, ''),
    ];
    for (const write of writes) expect((await rejection(write())).kind).toBe('readOnly');
    expect(mock.log).toEqual([]);
    expect(mock.data.reboots).toBe(0);
    expect(mock.data.clients).toHaveLength(3);
    await expect(client.ping()).resolves.toBe(true);
    expect(mock.log).toEqual(['GET /ping']);
  });

  it('asks the mode on every request', async () => {
    let readOnly = true;
    const { client, mock } = setup(() => readOnly);
    expect((await rejection(client.deleteEmail(20))).kind).toBe('readOnly');
    readOnly = false;
    await client.deleteEmail(20);
    expect(mock.log).toEqual(['DELETE /emails/20']);
  });

  it('uses the server setting, else the global default', async () => {
    const mock = createMockKeyHelp({ now: NOW });
    const store = memoryStore();
    const secrets = createSessionSecretStore(null);
    const { entry } = await addServer({ name: 'Main', url: 'panel.example.net', apiKey: MOCK_API_KEY }, { store, secrets, fetch: mock.fetch });
    expect(readOnlySetting(entry)).toBe('default');
    expect(effectiveReadOnly(entry, true)).toBe(true);
    expect(effectiveReadOnly(entry, false)).toBe(false);
    expect(effectiveReadOnly(null, true)).toBe(true);

    let servers = await setServerReadOnly(entry.id, 'on', store);
    expect(effectiveReadOnly(servers[0], false)).toBe(true);
    servers = await setServerReadOnly(entry.id, 'off', store);
    expect(effectiveReadOnly(servers[0], true)).toBe(false);
    servers = await setServerReadOnly(entry.id, 'default', store);
    expect(servers[0].readOnly).toBeUndefined();
    expect((await loadServers(store))[0]).toEqual(servers[0]);

    await setServerReadOnly(entry.id, 'on', store);
    const [saved] = await loadServers(store);
    const client = await clientFor(saved, secrets, mock.fetch, () => effectiveReadOnly(saved, false));
    expect((await rejection(client!.deleteClient(2))).kind).toBe('readOnly');
  });

  it('only a step from blocked to allowed needs the device check', () => {
    expect(unlocksWrites(true, false)).toBe(true);
    expect(unlocksWrites(false, true)).toBe(false);
    expect(unlocksWrites(true, true)).toBe(false);
    expect(unlocksWrites(false, false)).toBe(false);
  });

  it('keeps the global default in the settings', () => {
    expect(DEFAULT_SETTINGS.readOnlyDefault).toBe(false);
    expect(sanitizeSettings({ readOnlyDefault: true }).readOnlyDefault).toBe(true);
    expect(sanitizeSettings({ readOnlyDefault: 'yes' }).readOnlyDefault).toBe(false);
  });

  it('drops a stored server entry with a broken read-only value', async () => {
    const store = memoryStore();
    await store.setItem(
      'hostdesk.servers.v1',
      JSON.stringify([
        { id: 'a', name: 'A', origin: 'https://a.example', addedAt: NOW.toISOString(), readOnly: true },
        { id: 'b', name: 'B', origin: 'https://b.example', addedAt: NOW.toISOString(), readOnly: 'maybe' },
      ])
    );
    expect((await loadServers(store)).map((s) => s.id)).toEqual(['a']);
  });
});

describe('device check', () => {
  const SecurityLevel = { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 };
  const prompt = { title: 'Allow changes', cancel: 'Cancel' };
  const fake = (level: number, success: boolean | Error) =>
    ({
      SecurityLevel,
      getEnrolledLevelAsync: async () => level,
      authenticateAsync: async () => {
        if (success instanceof Error) throw success;
        return success ? { success: true } : { success: false, error: 'user_cancel' };
      },
    }) as unknown as Parameters<typeof confirmWithDevice>[1];

  it('asks the device where a check is set up', async () => {
    await expect(confirmWithDevice(prompt, fake(3, true), 'ios')).resolves.toBe('ok');
    await expect(confirmWithDevice(prompt, fake(1, false), 'android')).resolves.toBe('failed');
    await expect(confirmWithDevice(prompt, fake(2, new Error('boom')), 'android')).resolves.toBe('failed');
  });

  it('falls back to a dialog without one, and on the web', async () => {
    await expect(confirmWithDevice(prompt, fake(0, true), 'ios')).resolves.toBe('unavailable');
    await expect(confirmWithDevice(prompt, fake(3, true), 'web')).resolves.toBe('unavailable');
  });
});

describe('DNS checks', () => {
  const r = (type: string, value: string, host = '@', ttl = 3600) => validateRecord({ type, value, host, ttl });

  it.each([
    ['A', '192.0.2.1', '@'],
    ['A', '192.0.2.1', '*'],
    ['AAAA', '2001:db8::1', 'www'],
    ['AAAA', '::ffff:192.0.2.1', 'v6'],
    ['CNAME', 'target.example.org.', 'www'],
    ['CNAME', '@', 'blog'],
    ['MX', '10 mail', '@'],
    ['MX', '0 .', '@'],
    ['TXT', 'v=spf1 a mx -all', '@'],
    ['TXT', 'v=DMARC1; p=none', '_dmarc'],
    ['TXT', '<DKIM_RECORD_VALUE>', 'default._domainkey'],
    ['SRV', '10 5 5060 sip.example.org.', '_sip._tcp'],
    ['CAA', '0 issue "letsencrypt.org"', '@'],
    ['CAA', '128 iodef "mailto:security@example.org"', '@'],
    ['NS', 'ns1.example.net.', 'sub'],
  ])('accepts %s %s at %s', (type, value, host) => {
    expect(r(type, value, host)).toBeNull();
  });

  it.each([
    ['A', '192.0.2.256', '@', 'ipv4'],
    ['A', '2001:db8::1', '@', 'ipv4'],
    ['AAAA', '192.0.2.1', '@', 'ipv6'],
    ['AAAA', '2001:db8::1::2', '@', 'ipv6'],
    ['CNAME', 'target.example.org.', '@', 'cnameApex'],
    ['CNAME', 'not a name', 'www', 'target'],
    ['MX', 'mail', '@', 'mx'],
    ['MX', '70000 mail', '@', 'mx'],
    ['TXT', 'line\nbreak', '@', 'txt'],
    ['SRV', '10 5 5060 sip.example.org.', 'sip', 'srvHost'],
    ['SRV', '10 5 sip.example.org.', '_sip._tcp', 'srv'],
    ['CAA', '0 issue letsencrypt.org', '@', 'caa'],
    ['CAA', '0 policy "x"', '@', 'caa'],
    ['A', '192.0.2.1', 'two words', 'host'],
    ['PTR', 'x.example.', '@', 'type'],
  ])('refuses %s %s at %s (%s)', (type, value, host, issue) => {
    expect(r(type, value, host)).toBe(issue);
  });

  it('checks the TTL', () => {
    expect(r('A', '192.0.2.1', '@', 0)).toBe('ttl');
    expect(r('A', '192.0.2.1', '@', 1.5)).toBe('ttl');
    expect(r('A', '192.0.2.1', '@', 60)).toBeNull();
  });

  it('finds a CNAME next to other records at the same name', () => {
    const records: DnsRecord[] = [
      { host: 'www', ttl: 60, type: 'CNAME', value: '@' },
      { host: 'WWW', ttl: 60, type: 'A', value: '192.0.2.1' },
      { host: 'x', ttl: 60, type: 'PTR', value: 'anything' },
    ];
    expect(validateRecords(records)).toEqual([{ index: 0, issue: 'cnameConflict' }]);
  });

  it('checks the SOA', () => {
    const soa = { ttl: 86400, primary_ns: 'ns1.example.net.', rname: 'hostmaster.example.net.', refresh: 14400, retry: 1800, expire: 604800, minimum: 3600 };
    expect(validateSoa(soa)).toBeNull();
    expect(validateSoa({ ...soa, retry: 0 })).toBe('soaNumber');
    expect(validateSoa({ ...soa, rname: 'not valid' })).toBe('soaName');
  });

  it('normalises and compares records', () => {
    expect(cleanRecord({ host: ' www ', ttl: 60, type: 'cname', value: ' @ ' })).toEqual({ host: 'www', ttl: 60, type: 'CNAME', value: '@' });
    expect(sameRecord({ host: 'WWW', ttl: 60, type: 'a', value: '192.0.2.1' }, { host: 'www', ttl: 60, type: 'A', value: '192.0.2.1' })).toBe(true);
    expect(isIpv6('1:2:3:4:5:6:7:8')).toBe(true);
    expect(isIpv6('1:2:3:4:5:6:7')).toBe(false);
  });
});
