import { useCallback, useEffect, useRef, useState } from 'react';

import type { KeyHelpClient } from '../api/client';
import { KeyHelpError, classifyFetchError } from '../api/errors';

export interface Resource<T> {
  data: T | undefined;
  error: KeyHelpError | undefined;
  loading: boolean;
  reload(): void;
}

// Answers stay cached per server and query while the app runs, so going back to a list shows it
// at once; it is refreshed in the background every time a screen opens it.
const cache = new Map<string, unknown>();

export function clearResourceCache(): void {
  cache.clear();
}

export function useResource<T>(
  client: KeyHelpClient | null,
  key: string,
  load: (client: KeyHelpClient) => Promise<T>
): Resource<T> {
  const cacheKey = client ? `${client.origin}|${key}` : '';
  const [data, setData] = useState<T | undefined>(() => (cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined));
  const [error, setError] = useState<KeyHelpError | undefined>();
  const [loading, setLoading] = useState(false);
  const [round, setRound] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!client) return undefined;
    let cancelled = false;
    setData(cache.get(cacheKey) as T | undefined);
    setLoading(true);
    setError(undefined);
    loadRef
      .current(client)
      .then((value) => {
        if (cancelled) return;
        cache.set(cacheKey, value);
        setData(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof KeyHelpError ? reason : classifyFetchError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, cacheKey, round]);

  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { data, error, loading, reload };
}
