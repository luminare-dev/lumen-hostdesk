// One context for the app: settings, theme, translator, the server list and the client for the
// active server. Screens read it with useApp().

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { backgroundSupported, setBackgroundChecks } from '../alerts/background';
import type { KeyHelpClient } from '../api/client';
import { pickLanguage, translator, type Language, type Translate } from '../i18n';
import { resolveTokens, themeFor, type Theme } from '../theme/tokens';
import { secretStore, type SecretStore } from './secrets';
import {
  ACTIVE_KEY,
  addServer as addServerTo,
  clientFor,
  effectiveReadOnly,
  loadServers,
  removeServer as removeServerFrom,
  setServerReadOnly as setServerReadOnlyIn,
  type AddServerInput,
  type KeyValueStore,
  type ReadOnlySetting,
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
  /**
   * Read-only mode of the active server (its own setting or the global default). Screens hide
   * every write action; the client refuses writes on its own as well.
   */
  readOnly: boolean;
  setServerReadOnly(id: string, setting: ReadOnlySetting): Promise<void>;
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
  const [keyRound, setKeyRound] = useState(0);
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

  // Register the background check once settings are loaded and a server exists (the default is
  // "on", so waiting for the settings switch to be toggled would never start it).
  const hasServers = servers.length > 0;
  useEffect(() => {
    if (!ready || !backgroundSupported) return;
    void setBackgroundChecks(settings.backgroundChecks && hasServers).catch(() => undefined);
  }, [ready, hasServers, settings.backgroundChecks]);

  const active = useMemo(() => servers.find((s) => s.id === activeId) ?? null, [servers, activeId]);
  const readOnly = effectiveReadOnly(active, settings.readOnlyDefault);
  // The client asks this ref on every request, so a mode change applies at once without a new
  // client (and without dropping the cached lists).
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const activeOrigin = active?.origin;

  useEffect(() => {
    let cancelled = false;
    setClient(null);
    if (!active) return undefined;
    void clientFor(active, secrets, undefined, () => readOnlyRef.current)
      .then((next) => {
        if (!cancelled) setClient(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // A new client only for another server or a new key, not when a setting of the entry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeOrigin, keyRound, secrets]);

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
      setKeyRound((n) => n + 1);
      selectServer(entry.id);
      return entry;
    },
    [store, secrets, selectServer]
  );

  const setServerReadOnly = useCallback(
    async (id: string, setting: ReadOnlySetting) => {
      setServers(await setServerReadOnlyIn(id, setting, store));
    },
    [store]
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
    readOnly,
    setServerReadOnly,
    secretsPersistent: secrets.persistent,
    selectServer,
    addServer,
    removeServer,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
