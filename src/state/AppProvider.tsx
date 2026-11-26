// One context for the app: settings, theme, translator, the server list and the client for the
// active server. Screens read it with useApp().

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { KeyHelpClient } from '../api/client';
import { pickLanguage, translator, type Language, type Translate } from '../i18n';
import { resolveTokens, themeFor, type Theme } from '../theme/tokens';
import { secretStore, type SecretStore } from './secrets';
import {
  ACTIVE_KEY,
  addServer as addServerTo,
  clientFor,
  loadServers,
  removeServer as removeServerFrom,
  type AddServerInput,
  type KeyValueStore,
  type ServerEntry,
} from './servers';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';

export interface AppState {
  ready: boolean;
  settings: Settings;
  updateSettings(patch: Partial<Settings>): void;
  language: Language;
  t: Translate;
  theme: Theme;
  servers: ServerEntry[];
  active: ServerEntry | null;
  /** Null while there is no server, or its key is missing (web, new session). */
  client: KeyHelpClient | null;
  secretsPersistent: boolean;
  selectServer(id: string): void;
  addServer(input: AddServerInput): Promise<ServerEntry>;
  removeServer(id: string): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp outside AppProvider');
  return value;
}

export interface AppProviderProps {
  children: ReactNode;
  store?: KeyValueStore;
  secrets?: SecretStore;
}

export function AppProvider({ children, store = AsyncStorage, secrets = secretStore }: AppProviderProps) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [client, setClient] = useState<KeyHelpClient | null>(null);
  const scheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loadedSettings, loadedServers, storedActive] = await Promise.all([
        loadSettings(store).catch(() => DEFAULT_SETTINGS),
        loadServers(store).catch(() => []),
        store.getItem(ACTIVE_KEY).catch(() => null),
      ]);
      if (cancelled) return;
      setSettings(loadedSettings);
      setServers(loadedServers);
      setActiveId(loadedServers.some((s) => s.id === storedActive) ? storedActive : (loadedServers[0]?.id ?? null));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  const active = useMemo(() => servers.find((s) => s.id === activeId) ?? null, [servers, activeId]);

  useEffect(() => {
    let cancelled = false;
    setClient(null);
    if (!active) return undefined;
    void clientFor(active, secrets)
      .then((next) => {
        if (!cancelled) setClient(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, secrets]);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        void saveSettings(store, next).catch(() => undefined);
        return next;
      });
    },
    [store]
  );

  const selectServer = useCallback(
    (id: string) => {
      setActiveId(id);
      void store.setItem(ACTIVE_KEY, id).catch(() => undefined);
    },
    [store]
  );

  const addServer = useCallback(
    async (input: AddServerInput) => {
      const { entry, servers: next } = await addServerTo(input, { store, secrets });
      setServers(next);
      selectServer(entry.id);
      return entry;
    },
    [store, secrets, selectServer]
  );

  const removeServer = useCallback(
    async (id: string) => {
      const next = await removeServerFrom(id, { store, secrets });
      setServers(next);
      if (activeId === id) {
        const fallback = next[0]?.id ?? null;
        setActiveId(fallback);
        if (fallback) void store.setItem(ACTIVE_KEY, fallback).catch(() => undefined);
        else void store.removeItem(ACTIVE_KEY).catch(() => undefined);
      }
    },
    [store, secrets, activeId]
  );

  const language: Language =
    settings.language === 'system' ? pickLanguage(getLocales().map((l) => l.languageCode)) : settings.language;
  const t = useMemo(() => translator(language), [language]);
  const tokens = useMemo(() => resolveTokens(settings.preset, settings.customTokens), [settings.preset, settings.customTokens]);
  const mode = settings.theme === 'system' ? (scheme === 'light' ? 'light' : 'dark') : settings.theme;
  const theme = useMemo(() => themeFor(tokens, mode), [tokens, mode]);

  const value: AppState = {
    ready,
    settings,
    updateSettings,
    language,
    t,
    theme,
    servers,
    active,
    client,
    secretsPersistent: secrets.persistent,
    selectServer,
    addServer,
    removeServer,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
