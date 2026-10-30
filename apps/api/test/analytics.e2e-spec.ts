import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

const DAY = 86_400_000;

// Fixed windows that end at today's UTC midnight, so they stay stable within one run.
function windowEndingToday(days: number) {
  const today = new Date();
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return { from: new Date(to.getTime() - days * DAY).toISOString(), to: to.toISOString() };
}

describe('Analytics API (e2e)', () => {
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

  it('GET /sites lists the two seeded demo sites', async () => {
    const res = await http.get('/sites').expect(200);
    expect(res.body.map((s: { domain: string }) => s.domain)).toEqual(
      expect.arrayContaining(['shop.northwind.example', 'journal.lumen.example']),
    );
    expect(res.body[0]).toEqual({ id: expect.any(Number), name: expect.any(String), domain: expect.any(String) });
  });

  it('seeding is idempotent: a second boot does not duplicate sites', async () => {
    const second = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const secondApp = second.createNestApplication();
    await secondApp.init();
    const res = await request(secondApp.getHttpServer()).get('/sites').expect(200);
    await secondApp.close();
    expect(res.body).toHaveLength(2);
  });

  describe('GET /sites/:id/summary', () => {
    it('returns KPIs without comparison by default', async () => {
      const { from, to } = windowEndingToday(7);
      const res = await http.get(`/sites/${siteId}/summary`).query({ from, to }).expect(200);
      expect(res.body.compare).toBe(false);
      expect(res.body.kpis.visitors.value).toBeGreaterThan(0);
      expect(res.body.kpis.visitors).not.toHaveProperty('change');
      expect(res.body.kpis.bounceRate.value).toBeGreaterThanOrEqual(0);
      expect(res.body.kpis.bounceRate.value).toBeLessThanOrEqual(1);
    });

    it('with compare=true adds the previous equal-length period and a percent change', async () => {
      const { from, to } = windowEndingToday(7);
      const res = await http.get(`/sites/${siteId}/summary`).query({ from, to, compare: 'true' }).expect(200);
      const { visitors } = res.body.kpis;
      expect(res.body.compare).toBe(true);
      expect(res.body.previousTo).toBe(from);
      expect(new Date(res.body.previousTo).getTime() - new Date(res.body.previousFrom).getTime()).toBe(7 * DAY);
      expect(visitors.previous).toEqual(expect.any(Number));
      expect(visitors.change === null || typeof visitors.change === 'number').toBe(true);
      if (visitors.previous > 0) {
        expect(visitors.change).toBeCloseTo(((visitors.value - visitors.previous) / visitors.previous) * 100, 6);
      }
    });

    it('returns 404 for an unknown site and 400 for bad input', async () => {
      await http.get('/sites/999999/summary').expect(404);
      await http.get(`/sites/${siteId}/summary`).query({ compare: 'maybe' }).expect(400);
      await http
        .get(`/sites/${siteId}/summary`)
        .query({ from: '2026-10-02T00:00:00Z', to: '2026-10-01T00:00:00Z' })
        .expect(400);
      await http.get('/sites/abc/summary').expect(400);
    });
  });

  describe('GET /sites/:id/timeseries', () => {
    it('returns one UTC day bucket per day over the range, with zeros filled in', async () => {
      const { from, to } = windowEndingToday(30);
      const res = await http.get(`/sites/${siteId}/timeseries`).query({ from, to, interval: 'day' }).expect(200);
      expect(res.body).toHaveLength(30);
      expect(res.body[0].bucket).toBe(from);
      expect(res.body[1].bucket).toBe(new Date(new Date(from).getTime() + DAY).toISOString());
    });

    it('supports hour buckets whose pageview total matches the summary for the same range', async () => {
      const { from, to } = windowEndingToday(2);
      const hourly = await http.get(`/sites/${siteId}/timeseries`).query({ from, to, interval: 'hour' }).expect(200);
      const summary = await http.get(`/sites/${siteId}/summary`).query({ from, to }).expect(200);
      expect(hourly.body).toHaveLength(48);
      const pageviews = hourly.body.reduce((sum: number, p: { pageviews: number }) => sum + p.pageviews, 0);
      expect(pageviews).toBe(summary.body.kpis.pageviews.value);
    });

    it('rejects an unknown interval and too many buckets', async () => {
      const { from, to } = windowEndingToday(7);
      await http.get(`/sites/${siteId}/timeseries`).query({ from, to, interval: 'week' }).expect(400);
      const long = windowEndingToday(365);
      await http.get(`/sites/${siteId}/timeseries`).query({ ...long, interval: 'hour' }).expect(400);
    });
  });

  describe('GET /sites/:id/top', () => {
    it('lists the top pages by pageviews, limited and sorted', async () => {
      const { from, to } = windowEndingToday(30);
      const res = await http.get(`/sites/${siteId}/top`).query({ from, to, dimension: 'path', limit: 3 }).expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.length).toBeLessThanOrEqual(3);
      const pageviews = res.body.map((row: { pageviews: number }) => row.pageviews);
      expect([...pageviews].sort((a, b) => b - a)).toEqual(pageviews);
      expect(res.body[0]).toEqual({
        key: expect.stringMatching(/^\//),
        visitors: expect.any(Number),
        pageviews: expect.any(Number),
        revenueCents: expect.any(Number),
      });
    });

    it('returns only known device names for the device dimension', async () => {
      const { from, to } = windowEndingToday(30);
      const res = await http.get(`/sites/${siteId}/top`).query({ from, to, dimension: 'device' }).expect(200);
      expect(res.body.length).toBeLessThanOrEqual(10);
      for (const row of res.body) expect(['desktop', 'mobile', 'tablet']).toContain(row.key);
    });

    it('labels missing referrers as (direct)', async () => {
      const { from, to } = windowEndingToday(30);
      const res = await http.get(`/sites/${siteId}/top`).query({ from, to, dimension: 'referrer' }).expect(200);
      expect(res.body.map((row: { key: string }) => row.key)).toContain('(direct)');
    });

    it('rejects an unknown dimension and an out-of-range limit', async () => {
      await http.get(`/sites/${siteId}/top`).query({ dimension: 'browser' }).expect(400);
      await http.get(`/sites/${siteId}/top`).query({ dimension: 'path', limit: 0 }).expect(400);
      await http.get(`/sites/${siteId}/top`).query({ dimension: 'path', limit: 51 }).expect(400);
    });
  });

  describe('GET /sites/:id/funnel', () => {
    it('narrows visitors from pageview to signup to purchase', async () => {
      const { from, to } = windowEndingToday(30);
      const res = await http.get(`/sites/${siteId}/funnel`).query({ from, to }).expect(200);
      const [pageview, signup, purchase] = res.body;
      expect(res.body.map((s: { key: string }) => s.key)).toEqual(['pageview', 'signup', 'purchase']);
      expect(pageview.visitors).toBeGreaterThan(signup.visitors);
      expect(signup.visitors).toBeGreaterThanOrEqual(purchase.visitors);
      expect(pageview.fromPrevious).toBeNull();
      expect(signup.fromStart).toBeCloseTo(signup.visitors / pageview.visitors, 10);
      expect(purchase.fromPrevious).toBeCloseTo(purchase.visitors / signup.visitors, 10);
    });
  });

  describe('GET /sites/:id/realtime', () => {
    it('reports the last five minutes of activity', async () => {
      const res = await http.get(`/sites/${siteId}/realtime`).expect(200);
      expect(res.body.windowMinutes).toBe(5);
      expect(res.body.visitors).toEqual(expect.any(Number));
      expect(res.body.paths.length).toBeLessThanOrEqual(5);
    });
  });
});
