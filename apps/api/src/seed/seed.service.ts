import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DbService, QueryFn } from '../db.service.js';
import { DEMO_SITES } from './demo-sites.js';
import { GeneratedEvent, generateTraffic } from './traffic.js';

const BATCH_SIZE = 1000;
// Arbitrary key for the transaction-scoped lock, distinct from the schema lock in db.service.ts.
const SEED_LOCK_KEY = 727275;

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly db: DbService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.db.enabled || process.env.SEED_DEMO_DATA === 'false') return;
    try {
      const inserted = await this.seedDemoSites(new Date());
      if (inserted > 0) this.logger.log(`seeded ${inserted} demo events`);
    } catch (err) {
      // Seeding is a convenience. If it fails the API still starts and the dashboard shows its empty states.
      this.logger.error('demo data seeding failed', err instanceof Error ? err.stack : String(err));
    }
  }

  // Idempotent: a demo site is skipped when its domain already exists. Returns how many events were inserted.
  seedDemoSites(now: Date): Promise<number> {
    return this.db.transaction(async (query) => {
      await query('SELECT pg_advisory_xact_lock($1)', [SEED_LOCK_KEY]);
      let inserted = 0;
      for (const profile of DEMO_SITES) {
        const existing = await query('SELECT id FROM sites WHERE domain = $1', [profile.domain]);
        if (existing.length > 0) continue;
        const [site] = await query<{ id: number }>(
          'INSERT INTO sites (name, domain) VALUES ($1, $2) RETURNING id',
          [profile.name, profile.domain],
        );
        inserted += await insertEvents(query, site.id, generateTraffic(profile, now));
      }
      return inserted;
    });
  }
}

// One statement per batch: each column is passed as a single array parameter, which keeps large inserts fast.
async function insertEvents(query: QueryFn, siteId: number, events: GeneratedEvent[]): Promise<number> {
  for (let start = 0; start < events.length; start += BATCH_SIZE) {
    const batch = events.slice(start, start + BATCH_SIZE);
    await query(
      `INSERT INTO events (site_id, visitor_id, session_id, type, path, referrer, country, device, revenue_cents, occurred_at)
       SELECT $1::int, * FROM unnest(
         $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::int[], $10::timestamptz[]
       )`,
      [
        siteId,
        batch.map((e) => e.visitorId),
        batch.map((e) => e.sessionId),
        batch.map((e) => e.type),
        batch.map((e) => e.path),
        batch.map((e) => e.referrer),
        batch.map((e) => e.country),
        batch.map((e) => e.device),
        batch.map((e) => e.revenueCents),
        batch.map((e) => e.occurredAt.toISOString()),
      ],
    );
  }
  return events.length;
}
