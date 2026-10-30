// Pure analytics math. Everything here works in UTC and touches no database, so it is unit-tested directly.

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export type Interval = 'hour' | 'day';

export interface Range {
  from: Date;
  to: Date;
}

export interface SessionActivity {
  visitorId: string;
  events: number;
  pageviews: number;
  revenueCents: number;
}

export interface Totals {
  visitors: number;
  pageviews: number;
  sessions: number;
  bounceRate: number;
  revenueCents: number;
}

export interface Kpi {
  value: number;
  previous?: number;
  change?: number | null;
}

export interface FunnelStep {
  key: string;
  visitors: number;
  // Share of the first step that reached this step (0..1).
  fromStart: number;
  // Share of the previous step that reached this step (0..1). Null for the first step.
  fromPrevious: number | null;
}

export interface SeriesPoint {
  bucket: string;
  visitors: number;
  pageviews: number;
}

// Percent change against the previous period. Null when the previous value is 0 but the current one is not,
// because the change is unbounded and the UI shows it as "new" instead.
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// A bounce is a session that viewed exactly one page and did nothing else.
export function isBounce(session: Pick<SessionActivity, 'events' | 'pageviews'>): boolean {
  return session.events === 1 && session.pageviews === 1;
}

// Fraction of sessions that bounced (0..1). Zero when there are no sessions.
export function bounceRate(sessions: Pick<SessionActivity, 'events' | 'pageviews'>[]): number {
  if (sessions.length === 0) return 0;
  return sessions.filter(isBounce).length / sessions.length;
}

export function summarizeSessions(sessions: SessionActivity[]): Totals {
  let pageviews = 0;
  let revenueCents = 0;
  const visitors = new Set<string>();
  for (const session of sessions) {
    visitors.add(session.visitorId);
    pageviews += session.pageviews;
    revenueCents += session.revenueCents;
  }
  return {
    visitors: visitors.size,
    pageviews,
    sessions: sessions.length,
    bounceRate: bounceRate(sessions),
    revenueCents,
  };
}

// The equal-length window directly before `range`.
export function previousRange(range: Range): Range {
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: range.from };
}

// Ordered funnel: each step is the number of visitors who reached it. Shares are 0 when the denominator is 0.
export function buildFunnel(steps: { key: string; visitors: number }[]): FunnelStep[] {
  const first = steps[0]?.visitors ?? 0;
  return steps.map((step, index) => {
    const previous = index === 0 ? null : steps[index - 1].visitors;
    return {
      key: step.key,
      visitors: step.visitors,
      fromStart: first === 0 ? 0 : step.visitors / first,
      fromPrevious: previous === null ? null : previous === 0 ? 0 : step.visitors / previous,
    };
  });
}

export function bucketMs(interval: Interval): number {
  return interval === 'hour' ? HOUR_MS : DAY_MS;
}

// Start of the interval that contains `time`, in epoch ms. Hour and day buckets are UTC-aligned.
export function bucketStart(time: Date, interval: Interval): number {
  const step = bucketMs(interval);
  return Math.floor(time.getTime() / step) * step;
}

// Number of buckets needed to cover `range`.
export function bucketCount(range: Range, interval: Interval): number {
  const step = bucketMs(interval);
  return Math.ceil((range.to.getTime() - bucketStart(range.from, interval)) / step);
}

// One point per bucket across the range, with zeros where the database returned no rows.
export function fillSeries(
  range: Range,
  interval: Interval,
  rows: { bucket: Date; visitors: number; pageviews: number }[],
): SeriesPoint[] {
  const byBucket = new Map(rows.map((row) => [row.bucket.getTime(), row]));
  const step = bucketMs(interval);
  const points: SeriesPoint[] = [];
  for (let start = bucketStart(range.from, interval); start < range.to.getTime(); start += step) {
    const row = byBucket.get(start);
    points.push({
      bucket: new Date(start).toISOString(),
      visitors: row?.visitors ?? 0,
      pageviews: row?.pageviews ?? 0,
    });
  }
  return points;
}
