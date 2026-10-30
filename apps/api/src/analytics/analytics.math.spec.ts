import {
  bounceRate,
  bucketCount,
  buildFunnel,
  fillSeries,
  isBounce,
  percentChange,
  previousRange,
  summarizeSessions,
} from './analytics.math.js';

describe('percentChange', () => {
  it('is the relative change against the previous value', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(75, 100)).toBe(-25);
  });

  it('is 0 when nothing changed, including from zero to zero', () => {
    expect(percentChange(100, 100)).toBe(0);
    expect(percentChange(0, 0)).toBe(0);
  });

  it('is null when growing from zero, because the change is unbounded', () => {
    expect(percentChange(12, 0)).toBeNull();
  });

  it('goes to -100 when the current value drops to zero', () => {
    expect(percentChange(0, 40)).toBe(-100);
  });
});

describe('bounce rate', () => {
  it('counts only sessions with exactly one event that is a pageview', () => {
    expect(isBounce({ events: 1, pageviews: 1 })).toBe(true);
    expect(isBounce({ events: 2, pageviews: 1 })).toBe(false);
    expect(isBounce({ events: 1, pageviews: 0 })).toBe(false);
  });

  it('is the bounced share of sessions', () => {
    const sessions = [
      { events: 1, pageviews: 1 },
      { events: 1, pageviews: 1 },
      { events: 3, pageviews: 2 },
      { events: 2, pageviews: 1 },
    ];
    expect(bounceRate(sessions)).toBe(0.5);
  });

  it('is 0 with no sessions instead of NaN', () => {
    expect(bounceRate([])).toBe(0);
  });
});

describe('summarizeSessions', () => {
  it('derives visitors, pageviews, sessions, bounce rate and revenue from session rows', () => {
    const totals = summarizeSessions([
      { visitorId: 'a', events: 1, pageviews: 1, revenueCents: 0 },
      { visitorId: 'a', events: 3, pageviews: 2, revenueCents: 1500 },
      { visitorId: 'b', events: 1, pageviews: 1, revenueCents: 0 },
    ]);
    expect(totals).toEqual({
      visitors: 2,
      pageviews: 4,
      sessions: 3,
      bounceRate: 2 / 3,
      revenueCents: 1500,
    });
  });
});

describe('previousRange', () => {
  it('is the equal-length window directly before the range', () => {
    const range = { from: new Date('2026-10-20T00:00:00Z'), to: new Date('2026-10-27T00:00:00Z') };
    expect(previousRange(range)).toEqual({
      from: new Date('2026-10-13T00:00:00Z'),
      to: new Date('2026-10-20T00:00:00Z'),
    });
  });
});

describe('buildFunnel', () => {
  it('reports each step against the first step and the step before it', () => {
    const steps = buildFunnel([
      { key: 'pageview', visitors: 200 },
      { key: 'signup', visitors: 50 },
      { key: 'purchase', visitors: 10 },
    ]);
    expect(steps).toEqual([
      { key: 'pageview', visitors: 200, fromStart: 1, fromPrevious: null },
      { key: 'signup', visitors: 50, fromStart: 0.25, fromPrevious: 0.25 },
      { key: 'purchase', visitors: 10, fromStart: 0.05, fromPrevious: 0.2 },
    ]);
  });

  it('is all zeros when nobody reached the first step', () => {
    const steps = buildFunnel([
      { key: 'pageview', visitors: 0 },
      { key: 'signup', visitors: 0 },
    ]);
    expect(steps.map((s) => [s.fromStart, s.fromPrevious])).toEqual([
      [0, null],
      [0, 0],
    ]);
  });

  it('does not divide by zero when an intermediate step is empty', () => {
    const steps = buildFunnel([
      { key: 'pageview', visitors: 40 },
      { key: 'signup', visitors: 0 },
      { key: 'purchase', visitors: 0 },
    ]);
    expect(steps[2]).toMatchObject({ fromStart: 0, fromPrevious: 0 });
  });
});

describe('fillSeries', () => {
  it('returns one UTC day bucket per day and zeros for empty days', () => {
    const range = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-04T00:00:00Z') };
    const series = fillSeries(range, 'day', [
      { bucket: new Date('2026-10-02T00:00:00Z'), visitors: 5, pageviews: 9 },
    ]);
    expect(series).toEqual([
      { bucket: '2026-10-01T00:00:00.000Z', visitors: 0, pageviews: 0 },
      { bucket: '2026-10-02T00:00:00.000Z', visitors: 5, pageviews: 9 },
      { bucket: '2026-10-03T00:00:00.000Z', visitors: 0, pageviews: 0 },
    ]);
  });

  it('uses hour buckets aligned to the UTC hour, including the partial first hour', () => {
    const range = { from: new Date('2026-10-01T10:30:00Z'), to: new Date('2026-10-01T13:00:00Z') };
    const series = fillSeries(range, 'hour', []);
    expect(series.map((p) => p.bucket)).toEqual([
      '2026-10-01T10:00:00.000Z',
      '2026-10-01T11:00:00.000Z',
      '2026-10-01T12:00:00.000Z',
    ]);
  });

  it('counts the buckets a range needs', () => {
    const range = { from: new Date('2026-10-01T10:30:00Z'), to: new Date('2026-10-01T13:00:00Z') };
    expect(bucketCount(range, 'hour')).toBe(3);
    expect(bucketCount({ from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-08T00:00:00Z') }, 'day')).toBe(7);
  });
});
