import { validateEvent } from './event.validation.js';

const now = new Date('2026-10-30T12:00:00Z');
const valid = {
  siteId: 1,
  type: 'pageview',
  visitorId: 'v-1',
  sessionId: 's_1',
  path: '/pricing',
  referrer: 'google.com',
  country: 'US',
  device: 'mobile',
};

function errorsFor(body: unknown): string[] {
  const result = validateEvent(body, now);
  if (result.ok) throw new Error('expected validation to fail');
  return result.errors;
}

describe('validateEvent', () => {
  it('accepts a minimal valid event and fills defaults', () => {
    const result = validateEvent({ ...valid, referrer: undefined, country: undefined }, now);
    expect(result).toEqual({
      ok: true,
      event: {
        siteId: 1,
        type: 'pageview',
        visitorId: 'v-1',
        sessionId: 's_1',
        path: '/pricing',
        referrer: '',
        country: '',
        device: 'mobile',
        revenueCents: 0,
        occurredAt: now,
      },
    });
  });

  it('accepts a purchase with revenue and a client timestamp a little ahead of the server', () => {
    const result = validateEvent(
      { ...valid, type: 'purchase', revenueCents: 4900, occurredAt: '2026-10-30T12:00:30Z' },
      now,
    );
    expect(result.ok && result.event.revenueCents).toBe(4900);
    expect(result.ok && result.event.occurredAt).toEqual(new Date('2026-10-30T12:00:30Z'));
  });

  it('rejects a body that is not an object', () => {
    expect(errorsFor(null)).toEqual(['body must be a JSON object']);
    expect(errorsFor(['pageview'])).toEqual(['body must be a JSON object']);
  });

  it('reports every bad field at once', () => {
    const errors = errorsFor({ siteId: 0, type: 'scroll', visitorId: '', sessionId: 'a b', path: 'pricing', device: 'tv' });
    expect(errors).toEqual([
      'siteId must be a positive integer',
      'type must be one of pageview, click, signup, purchase',
      'visitorId must be 1-64 letters, digits, "-" or "_"',
      'sessionId must be 1-64 letters, digits, "-" or "_"',
      'path must start with "/" and be at most 2048 characters',
      'device must be one of desktop, mobile, tablet',
    ]);
  });

  it('rejects non-integer and non-positive site ids', () => {
    expect(errorsFor({ ...valid, siteId: 1.5 })).toContain('siteId must be a positive integer');
    expect(errorsFor({ ...valid, siteId: '1' })).toContain('siteId must be a positive integer');
  });

  it('rejects overlong identifiers and paths', () => {
    expect(errorsFor({ ...valid, visitorId: 'x'.repeat(65) })).toHaveLength(1);
    expect(errorsFor({ ...valid, path: `/${'a'.repeat(2048)}` })).toHaveLength(1);
  });

  it('rejects a lowercase or malformed country code', () => {
    expect(errorsFor({ ...valid, country: 'us' })).toEqual([
      'country must be an uppercase ISO 3166-1 alpha-2 code',
    ]);
  });

  it('rejects revenue on non-purchase events and negative revenue', () => {
    expect(errorsFor({ ...valid, revenueCents: 100 })).toEqual([
      'revenueCents is only allowed on purchase events',
    ]);
    expect(errorsFor({ ...valid, type: 'purchase', revenueCents: -1 })).toEqual([
      'revenueCents must be an integer between 0 and 100000000',
    ]);
  });

  it('rejects an unparseable or far-future occurredAt', () => {
    expect(errorsFor({ ...valid, occurredAt: 'yesterday' })).toEqual([
      'occurredAt must be an ISO 8601 timestamp',
    ]);
    expect(errorsFor({ ...valid, occurredAt: '2026-10-30T13:00:00Z' })).toEqual([
      'occurredAt must not be in the future',
    ]);
  });
});
