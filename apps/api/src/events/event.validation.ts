export const EVENT_TYPES = ['pageview', 'click', 'signup', 'purchase'] as const;
export const DEVICES = ['desktop', 'mobile', 'tablet'] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type Device = (typeof DEVICES)[number];

export interface CollectedEvent {
  siteId: number;
  type: EventType;
  visitorId: string;
  sessionId: string;
  path: string;
  referrer: string;
  country: string;
  device: Device;
  revenueCents: number;
  occurredAt: Date;
}

export type ValidationResult = { ok: true; event: CollectedEvent } | { ok: false; errors: string[] };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const MAX_PATH_LENGTH = 2048;
const MAX_REFERRER_LENGTH = 255;
const MAX_REVENUE_CENTS = 100_000_000;
// Clients may be a little ahead of the server clock, but not by more than this.
const FUTURE_TOLERANCE_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

// Validates one raw collect payload and normalises it. Pure: `now` is passed in so tests control the clock.
export function validateEvent(body: unknown, now: Date): ValidationResult {
  if (!isRecord(body)) return { ok: false, errors: ['body must be a JSON object'] };

  const errors: string[] = [];
  const { siteId, type, visitorId, sessionId, path, referrer, country, device, revenueCents, occurredAt } = body;

  if (!Number.isInteger(siteId) || (siteId as number) < 1) errors.push('siteId must be a positive integer');
  if (!isOneOf(EVENT_TYPES, type)) errors.push(`type must be one of ${EVENT_TYPES.join(', ')}`);
  if (typeof visitorId !== 'string' || !ID_PATTERN.test(visitorId)) {
    errors.push('visitorId must be 1-64 letters, digits, "-" or "_"');
  }
  if (typeof sessionId !== 'string' || !ID_PATTERN.test(sessionId)) {
    errors.push('sessionId must be 1-64 letters, digits, "-" or "_"');
  }
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > MAX_PATH_LENGTH) {
    errors.push(`path must start with "/" and be at most ${MAX_PATH_LENGTH} characters`);
  }
  if (referrer !== undefined && (typeof referrer !== 'string' || referrer.length > MAX_REFERRER_LENGTH)) {
    errors.push(`referrer must be a string of at most ${MAX_REFERRER_LENGTH} characters`);
  }
  if (country !== undefined && (typeof country !== 'string' || !COUNTRY_PATTERN.test(country))) {
    errors.push('country must be an uppercase ISO 3166-1 alpha-2 code');
  }
  if (!isOneOf(DEVICES, device)) errors.push(`device must be one of ${DEVICES.join(', ')}`);

  const revenue = revenueCents ?? 0;
  if (!Number.isInteger(revenue) || (revenue as number) < 0 || (revenue as number) > MAX_REVENUE_CENTS) {
    errors.push(`revenueCents must be an integer between 0 and ${MAX_REVENUE_CENTS}`);
  } else if (revenue !== 0 && type !== 'purchase') {
    errors.push('revenueCents is only allowed on purchase events');
  }

  let time = now;
  if (occurredAt !== undefined) {
    const parsed = typeof occurredAt === 'string' ? Date.parse(occurredAt) : Number.NaN;
    if (Number.isNaN(parsed)) {
      errors.push('occurredAt must be an ISO 8601 timestamp');
    } else if (parsed > now.getTime() + FUTURE_TOLERANCE_MS) {
      errors.push('occurredAt must not be in the future');
    } else {
      time = new Date(parsed);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    event: {
      siteId: siteId as number,
      type: type as EventType,
      visitorId: visitorId as string,
      sessionId: sessionId as string,
      path: path as string,
      referrer: (referrer as string | undefined) ?? '',
      country: (country as string | undefined) ?? '',
      device: device as Device,
      revenueCents: revenue as number,
      occurredAt: time,
    },
  };
}
