import { KeyHelpError } from '../api/errors';
import { MOCK_API_KEY } from '../mock/fixtures';
import { createMockKeyHelp } from '../mock/server';
import { createSessionSecretStore } from '../state/secrets';
import { addServer, clientFor, loadServers, removeServer, SERVERS_KEY, type KeyValueStore } from '../state/servers';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

function memorySession() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('server list', () => {
  it('checks the key before saving, and keeps the key out of the list', async () => {
    const mock = createMockKeyHelp();
    const store = memoryStore();
    const session = memorySession();
    const secrets = createSessionSecretStore(session);
    const { entry } = await addServer({ name: '', url: 'panel.example.net', apiKey: MOCK_API_KEY }, { store, secrets, fetch: mock.fetch });
    expect(entry.name).toBe('panel.example.net');
    expect(entry.origin).toBe('https://panel.example.net');
    expect(store.data.get(SERVERS_KEY)).not.toContain(MOCK_API_KEY);
    expect(await secrets.get(entry.id)).toBe(MOCK_API_KEY);
    expect(secrets.persistent).toBe(false);

    const client = await clientFor(entry, secrets, mock.fetch);
    await expect(client?.ping()).resolves.toBe(true);
  });

  it('saves nothing when the key is wrong', async () => {
    const mock = createMockKeyHelp();
    const store = memoryStore();
    const secrets = createSessionSecretStore(memorySession());
    await expect(addServer({ name: 'x', url: 'panel.example.net', apiKey: 'wrong' }, { store, secrets, fetch: mock.fetch })).rejects.toBeInstanceOf(
      KeyHelpError
    );
    expect(await loadServers(store)).toEqual([]);
  });

  it('refuses http before any request', async () => {
    const mock = createMockKeyHelp();
    const store = memoryStore();
    const secrets = createSessionSecretStore(null);
    await expect(addServer({ name: 'x', url: 'http://panel.example.net', apiKey: MOCK_API_KEY }, { store, secrets, fetch: mock.fetch })).rejects.toMatchObject({
      kind: 'insecure',
    });
    expect(mock.log).toEqual([]);
  });

  it('replaces the key when the same address is added again, and removes key and entry', async () => {
    const mock = createMockKeyHelp();
    const store = memoryStore();
    const secrets = createSessionSecretStore(null);
    const deps = { store, secrets, fetch: mock.fetch };
    const first = await addServer({ name: 'Main', url: 'panel.example.net', apiKey: MOCK_API_KEY }, deps);
    const second = await addServer({ name: '', url: 'https://panel.example.net/api/v2', apiKey: MOCK_API_KEY }, deps);
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.entry.name).toBe('Main');
    expect(second.servers).toHaveLength(1);

    await removeServer(first.entry.id, { store, secrets });
    expect(await loadServers(store)).toEqual([]);
    expect(await secrets.get(first.entry.id)).toBeNull();
  });

  it('ignores a damaged list', async () => {
    const store = memoryStore();
    await store.setItem(SERVERS_KEY, '{not json');
    expect(await loadServers(store)).toEqual([]);
    await store.setItem(SERVERS_KEY, JSON.stringify([{ id: 1 }, { id: 'a', name: 'n', origin: 'https://h.example', addedAt: 'x' }]));
    expect(await loadServers(store)).toHaveLength(1);
  });
});
