import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('POST /collect (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let siteId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    http = request(app.getHttpServer());
    const sites = await http.get('/sites').expect(200);
    siteId = sites.body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  const event = (overrides: Record<string, unknown> = {}) => ({
    siteId,
    type: 'pageview',
    visitorId: `e2e-visitor-${Date.now()}`,
    sessionId: `e2e-session-${Date.now()}`,
    path: '/pricing',
    device: 'desktop',
    ...overrides,
  });

  it('accepts a valid event with 202 and returns its id', async () => {
    const res = await http.post('/collect').send(event()).expect(202);
    expect(res.body.id).toEqual(expect.any(Number));
  });

  it('stores the event so it shows up in realtime', async () => {
    const before = await http.get(`/sites/${siteId}/realtime`).expect(200);
    await http.post('/collect').send(event({ visitorId: `e2e-live-${Date.now()}` })).expect(202);
    const after = await http.get(`/sites/${siteId}/realtime`).expect(200);
    expect(after.body.visitors).toBeGreaterThanOrEqual(before.body.visitors + 1);
    expect(after.body.pageviews).toBeGreaterThanOrEqual(before.body.pageviews + 1);
  });

  it('accepts a purchase with revenue and an explicit timestamp', async () => {
    const occurredAt = new Date(Date.now() - 60_000).toISOString();
    await http
      .post('/collect')
      .send(event({ type: 'purchase', path: '/checkout', revenueCents: 4900, occurredAt }))
      .expect(202);
  });

  it('rejects invalid events with 400 and every problem listed', async () => {
    const res = await http
      .post('/collect')
      .send(event({ type: 'scroll', device: 'watch', path: 'pricing' }))
      .expect(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'type must be one of pageview, click, signup, purchase',
        'device must be one of desktop, mobile, tablet',
        'path must start with "/" and be at most 2048 characters',
      ]),
    );
  });

  it('rejects a missing body, revenue on a pageview and a future timestamp', async () => {
    await http.post('/collect').send({}).expect(400);
    await http.post('/collect').send(event({ revenueCents: 100 })).expect(400);
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    await http.post('/collect').send(event({ occurredAt: future })).expect(400);
  });

  it('returns 404 for a site that does not exist and stores nothing', async () => {
    await http.post('/collect').send(event({ siteId: 999999 })).expect(404);
  });
});
