import { bucketCount, DAY_MS, Interval, Range } from './analytics.math.js';

export const DIMENSIONS = ['path', 'referrer', 'country', 'device'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const MAX_RANGE_MS = 400 * DAY_MS;
export const MAX_BUCKETS = 1000;
const DEFAULT_RANGE_DAYS = 7;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export interface RangeQuery {
  from?: string;
  to?: string;
  compare?: string;
  interval?: string;
  dimension?: string;
  limit?: string;
}

export class InvalidQueryError extends Error {}

function parseInstant(value: string, name: string): Date {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new InvalidQueryError(`${name} must be an ISO 8601 timestamp`);
  return new Date(time);
}

// `to` defaults to now and `from` to seven days before `to`. Both are exclusive/inclusive as in SQL: [from, to).
export function parseRange(query: RangeQuery, now: Date): Range {
  const to = query.to ? parseInstant(query.to, 'to') : now;
  const from = query.from
    ? parseInstant(query.from, 'from')
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  if (from >= to) throw new InvalidQueryError('from must be before to');
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new InvalidQueryError('range must be 400 days or less');
  }
  return { from, to };
}

export function parseFlag(value: string | undefined): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new InvalidQueryError('compare must be true or false');
}

export function parseInterval(value: string | undefined, range: Range): Interval {
  const interval = value ?? 'day';
  if (interval !== 'hour' && interval !== 'day') {
    throw new InvalidQueryError('interval must be hour or day');
  }
  if (bucketCount(range, interval) > MAX_BUCKETS) {
    throw new InvalidQueryError(`range has more than ${MAX_BUCKETS} ${interval} buckets; narrow it`);
  }
  return interval;
}

export function parseDimension(value: string | undefined): Dimension {
  const found = DIMENSIONS.find((dimension) => dimension === value);
  if (!found) throw new InvalidQueryError(`dimension must be one of ${DIMENSIONS.join(', ')}`);
  return found;
}

export function parseLimit(value: string | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) throw new InvalidQueryError('limit must be an integer');
  const limit = Number(value);
  if (limit < 1 || limit > MAX_LIMIT) throw new InvalidQueryError(`limit must be between 1 and ${MAX_LIMIT}`);
  return limit;
}
