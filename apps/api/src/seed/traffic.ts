// Deterministic synthetic traffic. The same profile, `now` and seed always produce the same events.
import { DAY_MS, HOUR_MS } from '../analytics/analytics.math.js';
import { Device, EventType } from '../events/event.validation.js';

export interface Weighted<T> {
  value: T;
  weight: number;
}

export interface SiteProfile {
  key: string;
  name: string;
  domain: string;
  seed: number;
  sessionsPerDay: number;
  // Relative traffic increase from the first to the last day of the window (0.4 = +40%).
  growth: number;
  campaign: { dayIndex: number; multiplier: number; referrer: string };
  referrers: Weighted<string>[];
  countries: Weighted<string>[];
  devices: Weighted<Device>[];
  landingPaths: Weighted<string>[];
  paths: Weighted<string>[];
  // Weight per UTC hour of day (24 entries).
  hourWeights: number[];
  bounceRate: number;
  clickRate: number;
  signupRate: number;
  purchaseRate: number;
  signupPath: string;
  checkoutPath: string;
  revenueCents: [number, number];
  liveSessions: number;
}

export interface GeneratedEvent {
  occurredAt: Date;
  type: EventType;
  visitorId: string;
  sessionId: string;
  path: string;
  referrer: string;
  country: string;
  device: Device;
  revenueCents: number;
}

const DAYS = 30;
const RETURNING_VISITOR_RATE = 0.35;
const LIVE_WINDOW_MS = 4 * 60_000;
// Traffic by weekday, starting Sunday (UTC).
const WEEKDAY_FACTOR = [0.72, 1, 1.1, 1.12, 1.08, 0.95, 0.7];

// mulberry32: small, fast, and good enough for demo data. Same seed gives the same sequence.
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(random: () => number, items: Weighted<T>[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let target = random() * total;
  for (const item of items) {
    target -= item.weight;
    if (target < 0) return item.value;
  }
  return items[items.length - 1].value;
}

function between(random: () => number, min: number, max: number): number {
  return Math.round(min + random() * (max - min));
}

// Traffic for the 30 UTC days ending on the day of `now`, plus a short burst in the last few minutes.
// Events at or after `now` are dropped, so nothing is ever in the future.
export function generateTraffic(profile: SiteProfile, now: Date): GeneratedEvent[] {
  const random = createRandom(profile.seed);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const firstDay = today - (DAYS - 1) * DAY_MS;
  const visitors: string[] = [];
  const events: GeneratedEvent[] = [];
  let sessionCount = 0;

  const newSession = (startedAt: number, campaignDay: boolean, live: boolean) => {
    sessionCount += 1;
    const sessionId = `${profile.key}-s${sessionCount}`;
    let visitorId: string;
    if (visitors.length > 0 && random() < RETURNING_VISITOR_RATE) {
      visitorId = visitors[Math.floor(random() * visitors.length)];
    } else {
      visitorId = `${profile.key}-v${visitors.length + 1}`;
      visitors.push(visitorId);
    }

    const campaignReferrer = campaignDay && random() < 0.4;
    const referrer = campaignReferrer ? profile.campaign.referrer : pickWeighted(random, profile.referrers);
    const country = pickWeighted(random, profile.countries);
    const device = pickWeighted(random, profile.devices);
    const base = { visitorId, sessionId, referrer, country, device };

    const pageviews = live || random() < profile.bounceRate ? 1 : between(random, 2, 5);
    let cursor = startedAt;
    for (let i = 0; i < pageviews; i++) {
      const path = i === 0 ? pickWeighted(random, profile.landingPaths) : pickWeighted(random, profile.paths);
      events.push({ ...base, occurredAt: new Date(cursor), type: 'pageview', path, revenueCents: 0 });
      if (random() < profile.clickRate) {
        events.push({ ...base, occurredAt: new Date(cursor + between(random, 4, 12) * 1000), type: 'click', path, revenueCents: 0 });
      }
      cursor += between(random, 20, 110) * 1000;
    }

    if (pageviews >= 2 && random() < profile.signupRate) {
      events.push({ ...base, occurredAt: new Date(cursor), type: 'signup', path: profile.signupPath, revenueCents: 0 });
      cursor += between(random, 30, 120) * 1000;
      if (random() < profile.purchaseRate) {
        const revenueCents = between(random, profile.revenueCents[0], profile.revenueCents[1]);
        events.push({ ...base, occurredAt: new Date(cursor), type: 'purchase', path: profile.checkoutPath, revenueCents });
      }
    }
  };

  for (let day = 0; day < DAYS; day++) {
    const dayStart = firstDay + day * DAY_MS;
    const trend = 1 + profile.growth * (day / (DAYS - 1));
    const campaignDay = day === profile.campaign.dayIndex;
    // The campaign spikes its day and tails off over the next one.
    const campaign =
      campaignDay ? profile.campaign.multiplier
      : day === profile.campaign.dayIndex + 1 ? 1 + (profile.campaign.multiplier - 1) / 3
      : 1;
    const noise = 0.88 + random() * 0.24;
    const weekday = WEEKDAY_FACTOR[new Date(dayStart).getUTCDay()];
    const count = Math.round(profile.sessionsPerDay * trend * weekday * campaign * noise);

    for (let i = 0; i < count; i++) {
      const hour = pickWeighted(
        random,
        profile.hourWeights.map((weight, value) => ({ value, weight })),
      );
      const startedAt = dayStart + hour * HOUR_MS + between(random, 0, 3599) * 1000;
      if (startedAt < now.getTime()) newSession(startedAt, campaignDay, false);
    }
  }

  for (let i = 0; i < profile.liveSessions; i++) {
    const startedAt = now.getTime() - Math.floor(random() * LIVE_WINDOW_MS);
    newSession(startedAt, false, true);
  }

  return events
    .filter((event) => event.occurredAt.getTime() < now.getTime())
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
