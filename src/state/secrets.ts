// Where API keys live. Native: the platform keychain/keystore through expo-secure-store, readable
// after the first unlock so the background check can use it. Web: sessionStorage only, so a key
// disappears with the browser tab, and the app says so. Keys never go into AsyncStorage.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface SecretStore {
  /** False on the web: the key is gone after the session and must be entered again. */
  readonly persistent: boolean;
  get(serverId: string): Promise<string | null>;
  set(serverId: string, apiKey: string): Promise<void>;
  remove(serverId: string): Promise<void>;
}

// expo-secure-store accepts [A-Za-z0-9._-] in key names.
const keyName = (serverId: string) => `hostdesk.apikey.${serverId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function createSecureSecretStore(store: typeof SecureStore = SecureStore): SecretStore {
  const options: SecureStore.SecureStoreOptions = { keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  return {
    persistent: true,
    get: (id) => store.getItemAsync(keyName(id), options),
    set: (id, apiKey) => store.setItemAsync(keyName(id), apiKey, options),
    remove: (id) => store.deleteItemAsync(keyName(id), options),
  };
}

/** A session-only store over the Web Storage interface (sessionStorage in the browser). */
export function createSessionSecretStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): SecretStore {
  const memory = new Map<string, string>();
  return {
    persistent: false,
    async get(id) {
      try {
        return storage?.getItem(keyName(id)) ?? memory.get(id) ?? null;
      } catch {
        return memory.get(id) ?? null;
      }
    },
    async set(id, apiKey) {
      memory.set(id, apiKey);
      try {
        storage?.setItem(keyName(id), apiKey);
      } catch {
        // Storage blocked: the in-memory copy lasts until the page is reloaded.
      }
    },
    async remove(id) {
      memory.delete(id);
      try {
        storage?.removeItem(keyName(id));
      } catch {
        // nothing stored
      }
    },
  };
}

function browserSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export const secretStore: SecretStore =
  Platform.OS === 'web' ? createSessionSecretStore(browserSessionStorage()) : createSecureSecretStore();
