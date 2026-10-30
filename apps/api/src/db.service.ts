import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

// Add new tables here as extra statements; they are all created once, behind a lock.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, title TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())',
  'CREATE TABLE IF NOT EXISTS sites (id SERIAL PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL UNIQUE)',
  `CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    site_id INT NOT NULL REFERENCES sites (id),
    visitor_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('pageview', 'click', 'signup', 'purchase')),
    path TEXT NOT NULL,
    referrer TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL CHECK (device IN ('desktop', 'mobile', 'tablet')),
    revenue_cents INT NOT NULL DEFAULT 0,
    occurred_at TIMESTAMPTZ NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS events_site_occurred_at_idx ON events (site_id, occurred_at)',
];

export type QueryFn = <T = unknown>(sql: string, params?: unknown[]) => Promise<T[]>;

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
    : null;
  private ready: Promise<void> | null = null;

  get enabled(): boolean {
    return this.pool !== null;
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.pool) throw new Error('DATABASE_URL is not set');
    await this.ensureSchema();
    const res = await this.pool.query(sql, params);
    return res.rows as T[];
  }

  // Runs `fn` inside one transaction. The callback gets a query function bound to that transaction.
  async transaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('DATABASE_URL is not set');
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const query: QueryFn = async <R = unknown>(sql: string, params: unknown[] = []) =>
        (await client.query(sql, params)).rows as R[];
      const result = await fn(query);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  private ensureSchema(): Promise<void> {
    this.ready ??= (async () => {
      // Concurrent instances (serverless cold starts, parallel test files) race on CREATE TABLE IF NOT EXISTS,
      // so serialize schema setup behind a transaction-scoped advisory lock.
      const client = await this.pool!.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(727274)');
        for (const statement of SCHEMA) await client.query(statement);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        this.ready = null;
        throw err;
      } finally {
        client.release();
      }
    })();
    return this.ready;
  }
}
