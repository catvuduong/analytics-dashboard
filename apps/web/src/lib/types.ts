// Mirrors the JSON returned by apps/api (see analytics.service.ts).

export interface Site {
  id: number;
  name: string;
  domain: string;
}

export interface Kpi {
  value: number;
  previous?: number;
  change?: number | null;
}

export interface Summary {
  kpis: {
    visitors: Kpi;
    pageviews: Kpi;
    sessions: Kpi;
    bounceRate: Kpi;
    revenueCents: Kpi;
  };
}

export interface SeriesPoint {
  bucket: string;
  visitors: number;
  pageviews: number;
}

export interface TopRow {
  key: string;
  visitors: number;
  pageviews: number;
  revenueCents: number;
}

export interface FunnelStep {
  key: string;
  visitors: number;
  fromStart: number;
  fromPrevious: number | null;
}

export interface Realtime {
  windowMinutes: number;
  visitors: number;
  pageviews: number;
  paths: { path: string; visitors: number }[];
}

export interface Health {
  status: string;
  db: string;
}
