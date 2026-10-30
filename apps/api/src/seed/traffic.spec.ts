import { bounceRate } from '../analytics/analytics.math.js';
import { DEMO_SITES } from './demo-sites.js';
import { createRandom, generateTraffic, GeneratedEvent } from './traffic.js';

const now = new Date('2026-10-30T15:20:00Z');

function sessionsOf(events: GeneratedEvent[]) {
  const bySession = new Map<string, { events: number; pageviews: number }>();
  for (const event of events) {
    const session = bySession.get(event.sessionId) ?? { events: 0, pageviews: 0 };
    session.events += 1;
    if (event.type === 'pageview') session.pageviews += 1;
    bySession.set(event.sessionId, session);
  }
  return [...bySession.values()];
}

describe('createRandom', () => {
  it('produces the same sequence for the same seed and values in [0, 1)', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const values = Array.from({ length: 5 }, () => a());
    expect(values).toEqual(Array.from({ length: 5 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('differs between seeds', () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });
});

describe('generateTraffic', () => {
  const shop = DEMO_SITES[0];

  it('is deterministic for a given profile and clock', () => {
    expect(generateTraffic(shop, now)).toEqual(generateTraffic(shop, now));
  });

  it('never produces events in the future and keeps timestamps inside the 30-day window', () => {
    const events = generateTraffic(shop, now);
    const earliest = Date.UTC(2026, 9, 1);
    for (const event of events) {
      expect(event.occurredAt.getTime()).toBeLessThan(now.getTime());
      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(earliest);
    }
  });

  it('only emits valid event types, devices and revenue on purchases', () => {
    const events = generateTraffic(shop, now);
    expect(new Set(events.map((e) => e.type))).toEqual(new Set(['pageview', 'click', 'signup', 'purchase']));
    expect(new Set(events.map((e) => e.device))).toEqual(new Set(['desktop', 'mobile', 'tablet']));
    for (const event of events) {
      if (event.type !== 'purchase') expect(event.revenueCents).toBe(0);
    }
  });

  it('gives every signup and purchase a pageview earlier in the same session, so the funnel is ordered', () => {
    const events = generateTraffic(shop, now);
    const bySession = new Map<string, GeneratedEvent[]>();
    for (const event of events) {
      bySession.set(event.sessionId, [...(bySession.get(event.sessionId) ?? []), event]);
    }
    for (const sessionEvents of bySession.values()) {
      const firstView = sessionEvents.find((e) => e.type === 'pageview');
      for (const event of sessionEvents.filter((e) => e.type === 'signup' || e.type === 'purchase')) {
        expect(firstView && firstView.occurredAt <= event.occurredAt).toBe(true);
      }
    }
  });

  it('shows a realistic bounce rate and a few thousand events per site', () => {
    for (const profile of DEMO_SITES) {
      const events = generateTraffic(profile, now);
      expect(events.length).toBeGreaterThan(1500);
      expect(events.length).toBeLessThan(8000);
      const rate = bounceRate(sessionsOf(events));
      expect(rate).toBeGreaterThan(0.25);
      expect(rate).toBeLessThan(0.7);
    }
  });
});
