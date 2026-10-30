import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db.service.js';
import {
  buildFunnel,
  fillSeries,
  FunnelStep,
  Interval,
  Kpi,
  percentChange,
  previousRange,
  Range,
  SeriesPoint,
  SessionActivity,
  summarizeSessions,
  Totals,
} from './analytics.math.js';
import { Dimension } from './analytics.query.js';

export interface Site {
  id: number;
  name: string;
  domain: string;
}

export interface SummaryResponse {
  siteId: number;
  from: string;
  to: string;
  compare: boolean;
  previousFrom: string | null;
  previousTo: string | null;
  kpis: Record<keyof Totals, Kpi>;
}

export interface TopRow {
  key: string;
  visitors: number;
  pageviews: number;
  revenueCents: number;
}

export interface RealtimeResponse {
  windowMinutes: number;
  visitors: number;
  pageviews: number;
  paths: { path: string; visitors: number }[];
}

export const REALTIME_WINDOW_MS = 5 * 60_000;

// Only these constants are interpolated into SQL; user input is always passed as a bound parameter.
const DIMENSION_SQL: Record<Dimension, string> = {
  path: 'path',
  referrer: "COALESCE(NULLIF(referrer, ''), '(direct)')",
  country: "COALESCE(NULLIF(country, ''), '(unknown)')",
  device: 'device',
};

const INTERVAL_SQL: Record<Interval, string> = { hour: 'hour', day: 'day' };

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DbService) {}

  listSites(): Promise<Site[]> {
    return this.db.query<Site>('SELECT id, name, domain FROM sites ORDER BY id');
  }

  async summary(siteId: number, range: Range, compare: boolean): Promise<SummaryResponse> {
    await this.requireSite(siteId);
    const previous = previousRange(range);
    const [current, prior] = await Promise.all([
      this.totals(siteId, range),
      compare ? this.totals(siteId, previous) : null,
    ]);
    const kpis = {} as SummaryResponse['kpis'];
    for (const key of Object.keys(current) as (keyof Totals)[]) {
      kpis[key] = prior
        ? { value: current[key], previous: prior[key], change: percentChange(current[key], prior[key]) }
        : { value: current[key] };
    }
    return {
      siteId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      compare,
      previousFrom: prior ? previous.from.toISOString() : null,
      previousTo: prior ? previous.to.toISOString() : null,
      kpis,
    };
  }

  async timeseries(siteId: number, range: Range, interval: Interval): Promise<SeriesPoint[]> {
    await this.requireSite(siteId);
    const rows = await this.db.query<{ bucket: Date; visitors: number; pageviews: number }>(
      `SELECT date_trunc('${INTERVAL_SQL[interval]}', occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS bucket,
              count(DISTINCT visitor_id)::int AS visitors,
              (count(*) FILTER (WHERE type = 'pageview'))::int AS pageviews
         FROM events
        WHERE site_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        GROUP BY 1
        ORDER BY 1`,
      [siteId, range.from, range.to],
    );
    return fillSeries(range, interval, rows);
  }

  async top(siteId: number, range: Range, dimension: Dimension, limit: number): Promise<TopRow[]> {
    await this.requireSite(siteId);
    return this.db.query<TopRow>(
      `SELECT ${DIMENSION_SQL[dimension]} AS key,
              count(DISTINCT visitor_id)::int AS visitors,
              (count(*) FILTER (WHERE type = 'pageview'))::int AS pageviews,
              COALESCE(sum(revenue_cents), 0)::int AS "revenueCents"
         FROM events
        WHERE site_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        GROUP BY 1
        ORDER BY pageviews DESC, visitors DESC, key
        LIMIT $4`,
      [siteId, range.from, range.to, limit],
    );
  }

  // Ordered funnel: a visitor counts for a step only if they reached the previous step first.
  async funnel(siteId: number, range: Range): Promise<FunnelStep[]> {
    await this.requireSite(siteId);
    const [row] = await this.db.query<{ pageview: number; signup: number; purchase: number }>(
      `WITH first_view AS (
         SELECT visitor_id, min(occurred_at) AS at
           FROM events
          WHERE site_id = $1 AND type = 'pageview' AND occurred_at >= $2 AND occurred_at < $3
          GROUP BY visitor_id
       ), signup AS (
         SELECT f.visitor_id, min(e.occurred_at) AS at
           FROM first_view f
           JOIN events e ON e.site_id = $1 AND e.visitor_id = f.visitor_id
                        AND e.type = 'signup' AND e.occurred_at >= f.at AND e.occurred_at < $3
          GROUP BY f.visitor_id
       ), purchase AS (
         SELECT s.visitor_id
           FROM signup s
           JOIN events e ON e.site_id = $1 AND e.visitor_id = s.visitor_id
                        AND e.type = 'purchase' AND e.occurred_at >= s.at AND e.occurred_at < $3
          GROUP BY s.visitor_id
       )
       SELECT (SELECT count(*) FROM first_view)::int AS pageview,
              (SELECT count(*) FROM signup)::int AS signup,
              (SELECT count(*) FROM purchase)::int AS purchase`,
      [siteId, range.from, range.to],
    );
    return buildFunnel([
      { key: 'pageview', visitors: row.pageview },
      { key: 'signup', visitors: row.signup },
      { key: 'purchase', visitors: row.purchase },
    ]);
  }

  async realtime(siteId: number, now: Date): Promise<RealtimeResponse> {
    await this.requireSite(siteId);
    const from = new Date(now.getTime() - REALTIME_WINDOW_MS);
    const [totals] = await this.db.query<{ visitors: number; pageviews: number }>(
      `SELECT count(DISTINCT visitor_id)::int AS visitors,
              (count(*) FILTER (WHERE type = 'pageview'))::int AS pageviews
         FROM events
        WHERE site_id = $1 AND occurred_at >= $2 AND occurred_at <= $3`,
      [siteId, from, now],
    );
    const paths = await this.db.query<{ path: string; visitors: number }>(
      `SELECT path, count(DISTINCT visitor_id)::int AS visitors
         FROM events
        WHERE site_id = $1 AND occurred_at >= $2 AND occurred_at <= $3
        GROUP BY path
        ORDER BY visitors DESC, path
        LIMIT 5`,
      [siteId, from, now],
    );
    return {
      windowMinutes: REALTIME_WINDOW_MS / 60_000,
      visitors: totals.visitors,
      pageviews: totals.pageviews,
      paths,
    };
  }

  private async totals(siteId: number, range: Range): Promise<Totals> {
    // One row per session keeps the bounce and visitor math in pure code (see analytics.math.ts).
    const sessions = await this.db.query<SessionActivity>(
      `SELECT min(visitor_id) AS "visitorId",
              count(*)::int AS events,
              (count(*) FILTER (WHERE type = 'pageview'))::int AS pageviews,
              COALESCE(sum(revenue_cents), 0)::int AS "revenueCents"
         FROM events
        WHERE site_id = $1 AND occurred_at >= $2 AND occurred_at < $3
        GROUP BY session_id`,
      [siteId, range.from, range.to],
    );
    return summarizeSessions(sessions);
  }

  private async requireSite(siteId: number): Promise<void> {
    const rows = await this.db.query('SELECT 1 FROM sites WHERE id = $1', [siteId]);
    if (rows.length === 0) throw new NotFoundException(`site ${siteId} not found`);
  }
}
