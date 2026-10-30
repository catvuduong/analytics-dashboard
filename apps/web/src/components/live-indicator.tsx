'use client';

import { useApi } from '@/lib/use-api';
import { Realtime } from '@/lib/types';

const REFRESH_MS = 10_000;

// "Visitors now" over the API's five-minute window, refreshed every 10 seconds.
export function LiveIndicator({ siteId }: { siteId: number }) {
  const { data, error, loading } = useApi<Realtime>(`/sites/${siteId}/realtime`, REFRESH_MS);
  const label = error ? 'live unavailable' : loading || !data ? 'connecting' : `${data.visitors} visitors now`;
  return (
    <div className={`live ${error ? 'live-error' : ''}`} title="Refreshes every 10 seconds">
      <span className="live-dot" aria-hidden="true" />
      <span data-testid="live-visitors" data-count={data?.visitors ?? ''}>
        {label}
      </span>
    </div>
  );
}
