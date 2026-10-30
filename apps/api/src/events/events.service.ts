import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db.service.js';
import { CollectedEvent } from './event.validation.js';

@Injectable()
export class EventsService {
  constructor(private readonly db: DbService) {}

  async record(event: CollectedEvent): Promise<{ id: number }> {
    // The site check happens in the same statement, so an unknown site inserts nothing.
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO events (site_id, visitor_id, session_id, type, path, referrer, country, device, revenue_cents, occurred_at)
       SELECT $1::int, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9::int, $10::timestamptz
        WHERE EXISTS (SELECT 1 FROM sites WHERE id = $1::int)
       RETURNING id`,
      [
        event.siteId,
        event.visitorId,
        event.sessionId,
        event.type,
        event.path,
        event.referrer,
        event.country,
        event.device,
        event.revenueCents,
        event.occurredAt,
      ],
    );
    if (rows.length === 0) throw new NotFoundException(`site ${event.siteId} not found`);
    return { id: Number(rows[0].id) };
  }
}
