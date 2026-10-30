'use client';

import { ReactNode, useState } from 'react';
import { API_URL } from '@/lib/api';
import { downloadCsv, toCsv } from '@/lib/csv';
import { countryName, formatCount, formatPercent, formatRevenue } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { FunnelStep, Health, Site, SeriesPoint, Summary, TopRow } from '@/lib/types';
import { Funnel } from './funnel';
import { KpiCard } from './kpi-card';
import { LiveIndicator } from './live-indicator';
import { Panel, PanelState } from './panel';
import { TOP_CSV_HEADERS, topRowsToCsv, TopTable } from './top-table';
import { TrafficChart } from './traffic-chart';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const RANGES = [
  { id: '24h', label: 'Last 24 hours', ms: DAY, interval: 'hour' },
  { id: '7d', label: 'Last 7 days', ms: 7 * DAY, interval: 'day' },
  { id: '30d', label: 'Last 30 days', ms: 30 * DAY, interval: 'day' },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const TOP_TABLES = [
  { dimension: 'path', title: 'Top pages', keyLabel: 'Page', testId: 'top-pages' },
  { dimension: 'referrer', title: 'Top referrers', keyLabel: 'Referrer', testId: 'top-referrers' },
  { dimension: 'country', title: 'Top countries', keyLabel: 'Country', testId: 'top-countries' },
  { dimension: 'device', title: 'Devices', keyLabel: 'Device', testId: 'top-devices' },
] as const;
type Dimension = (typeof TOP_TABLES)[number]['dimension'];

const DISPLAY_KEY: Partial<Record<Dimension, (key: string) => string>> = {
  country: countryName,
};

export function Dashboard() {
  const sites = useApi<Site[]>('/sites');
  const health = useApi<Health>('/health');
  const [selectedSite, setSelectedSite] = useState<number | null>(null);
  const [rangeId, setRangeId] = useState<RangeId>('7d');
  // The range is anchored to the time the user picks it, so request URLs stay stable between renders.
  const [anchor, setAnchor] = useState(() => Date.now());

  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[1];
  const siteId = selectedSite ?? sites.data?.[0]?.id ?? null;
  const site = sites.data?.find((s) => s.id === siteId);
  const query = `from=${new Date(anchor - range.ms).toISOString()}&to=${new Date(anchor).toISOString()}`;
  const base = siteId === null ? null : `/sites/${siteId}`;

  const summary = useApi<Summary>(base && `${base}/summary?${query}&compare=true`);
  const series = useApi<SeriesPoint[]>(base && `${base}/timeseries?${query}&interval=${range.interval}`);
  const funnel = useApi<FunnelStep[]>(base && `${base}/funnel?${query}`);
  const tops = {
    path: useApi<TopRow[]>(base && `${base}/top?${query}&dimension=path&limit=8`),
    referrer: useApi<TopRow[]>(base && `${base}/top?${query}&dimension=referrer&limit=8`),
    country: useApi<TopRow[]>(base && `${base}/top?${query}&dimension=country&limit=8`),
    device: useApi<TopRow[]>(base && `${base}/top?${query}&dimension=device&limit=8`),
  };

  const exportTop = (dimension: Dimension, rows: TopRow[]) => {
    const name = `${site?.domain ?? 'site'}-${dimension}-${rangeId}.csv`;
    downloadCsv(name, toCsv(TOP_CSV_HEADERS, topRowsToCsv(rows)));
  };

  if (sites.error) {
    return (
      <Shell siteId={null}>
        <div className="state state-error" role="alert">
          <span>
            Could not reach the API at {API_URL}: {sites.error}
          </span>
          <button type="button" className="ghost-button" onClick={sites.reload}>
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  if (sites.data && sites.data.length === 0) {
    return (
      <Shell siteId={null}>
        <div className="state">No sites yet. Send events to POST /collect and they will appear here.</div>
      </Shell>
    );
  }

  const kpis = summary.data?.kpis;
  const points = series.data ?? [];
  const seriesEmpty = points.every((p) => p.visitors === 0 && p.pageviews === 0);

  return (
    <Shell
      siteId={siteId}
      toolbar={
        <div className="toolbar">
          <div className="site-picker">
            <label className="visually-hidden" htmlFor="site-switcher">
              Site
            </label>
            <select
              id="site-switcher"
              data-testid="site-switcher"
              className="select"
              value={siteId ?? ''}
              disabled={!sites.data}
              onChange={(e) => setSelectedSite(Number(e.target.value))}
            >
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {site && <span className="site-domain">{site.domain}</span>}
          </div>
          <div className="segmented" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                data-testid={`range-${r.id}`}
                aria-pressed={r.id === rangeId}
                className={`segment ${r.id === rangeId ? 'segment-active' : ''}`}
                onClick={() => {
                  setRangeId(r.id);
                  setAnchor(Date.now());
                }}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {summary.error && (
        <div className="state state-error" role="alert">
          <span>Could not load KPIs: {summary.error}</span>
          <button type="button" className="ghost-button" onClick={summary.reload}>
            Retry
          </button>
        </div>
      )}

      <section className="kpis" aria-label="Key metrics">
        <KpiCard
          label="Visitors"
          value={kpis ? formatCount(kpis.visitors.value) : null}
          change={kpis?.visitors.change}
          valueTestId="kpi-visitors"
          deltaTestId="kpi-delta-visitors"
          loading={summary.loading}
        />
        <KpiCard
          label="Pageviews"
          value={kpis ? formatCount(kpis.pageviews.value) : null}
          change={kpis?.pageviews.change}
          valueTestId="kpi-pageviews"
          deltaTestId="kpi-delta-pageviews"
          loading={summary.loading}
        />
        <KpiCard
          label="Sessions"
          value={kpis ? formatCount(kpis.sessions.value) : null}
          change={kpis?.sessions.change}
          valueTestId="kpi-sessions"
          deltaTestId="kpi-delta-sessions"
          loading={summary.loading}
        />
        <KpiCard
          label="Bounce rate"
          value={kpis ? formatPercent(kpis.bounceRate.value) : null}
          change={kpis?.bounceRate.change}
          goodWhenDown
          valueTestId="kpi-bounce-rate"
          deltaTestId="kpi-delta-bounce-rate"
          loading={summary.loading}
        />
        <KpiCard
          label="Revenue"
          value={kpis ? formatRevenue(kpis.revenueCents.value) : null}
          change={kpis?.revenueCents.change}
          valueTestId="kpi-revenue"
          deltaTestId="kpi-delta-revenue"
          loading={summary.loading}
        />
      </section>

      <section className="grid-main">
        <Panel
          title="Visitors vs pageviews"
          subtitle={`${range.label} · ${range.interval === 'hour' ? 'hourly' : 'daily'} buckets, UTC`}
          className="panel-chart"
          actions={
            <div className="legend">
              <span className="legend-item">
                <span className="swatch swatch-visitors" /> Visitors
              </span>
              <span className="legend-item">
                <span className="swatch swatch-pageviews" /> Pageviews
              </span>
            </div>
          }
        >
          <PanelState loading={series.loading} error={series.error} empty={seriesEmpty} onRetry={series.reload}>
            <TrafficChart points={points} interval={range.interval} />
          </PanelState>
        </Panel>

        <Funnel steps={funnel.data} loading={funnel.loading} error={funnel.error} onRetry={funnel.reload} />
      </section>

      <section className="grid-tables">
        {TOP_TABLES.map((table) => {
          const result = tops[table.dimension];
          return (
            <TopTable
              key={table.dimension}
              title={table.title}
              keyLabel={table.keyLabel}
              testId={table.testId}
              rows={result.data}
              loading={result.loading}
              error={result.error}
              onRetry={result.reload}
              displayKey={DISPLAY_KEY[table.dimension]}
              onExport={() => result.data && exportTop(table.dimension, result.data)}
            />
          );
        })}
      </section>

      <footer className="footer">
        <span data-testid="health">
          {health.data
            ? `api ${health.data.status} / db ${health.data.db}`
            : health.error
              ? 'api unreachable'
              : 'checking...'}
        </span>
        <span>All times UTC</span>
      </footer>
    </Shell>
  );
}

// Page frame. Defined at module level so React keeps its children mounted across renders.
function Shell({ siteId, toolbar, children }: { siteId: number | null; toolbar?: ReactNode; children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">analytics-dashboard</span>
        </div>
        {siteId !== null && <LiveIndicator siteId={siteId} />}
      </header>
      {toolbar}
      <main className="content">{children}</main>
    </div>
  );
}
