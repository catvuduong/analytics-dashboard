'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from './api';

interface State<T> {
  path: string;
  data?: T;
  error?: string;
}

// Fetches `path` from the API whenever it changes. `refreshMs` re-fetches on an interval without
// flashing the loading state, and `reload` re-fetches on demand (used by the retry buttons).
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [state, setState] = useState<State<T>>({ path: '' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    fetchJson<T>(path, controller.signal).then(
      (data) => setState({ path, data }),
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ path, error: err instanceof Error ? err.message : 'request failed' });
      },
    );
    return () => controller.abort();
  }, [path, tick]);

  const current = path !== null && state.path === path;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: path !== null && !current,
    reload: () => setTick((t) => t + 1),
  };
}
