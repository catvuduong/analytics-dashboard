import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import {
  InvalidQueryError,
  parseDimension,
  parseFlag,
  parseInterval,
  parseLimit,
  parseRange,
} from './analytics.query.js';
import type { RangeQuery } from './analytics.query.js';

// Maps pure query-parsing failures to HTTP 400. Anything else propagates as a 500.
function badRequestOnInvalid<T>(parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    if (err instanceof InvalidQueryError) throw new BadRequestException(err.message);
    throw err;
  }
}

@Controller('sites')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  listSites() {
    return this.analytics.listSites();
  }

  @Get(':id/summary')
  summary(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    const now = new Date();
    const range = badRequestOnInvalid(() => parseRange(query, now));
    const compare = badRequestOnInvalid(() => parseFlag(query.compare));
    return this.analytics.summary(id, range, compare);
  }

  @Get(':id/timeseries')
  timeseries(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    const range = badRequestOnInvalid(() => parseRange(query, new Date()));
    const interval = badRequestOnInvalid(() => parseInterval(query.interval, range));
    return this.analytics.timeseries(id, range, interval);
  }

  @Get(':id/top')
  top(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    const range = badRequestOnInvalid(() => parseRange(query, new Date()));
    const dimension = badRequestOnInvalid(() => parseDimension(query.dimension));
    const limit = badRequestOnInvalid(() => parseLimit(query.limit));
    return this.analytics.top(id, range, dimension, limit);
  }

  @Get(':id/funnel')
  funnel(@Param('id', ParseIntPipe) id: number, @Query() query: RangeQuery) {
    const range = badRequestOnInvalid(() => parseRange(query, new Date()));
    return this.analytics.funnel(id, range);
  }

  @Get(':id/realtime')
  realtime(@Param('id', ParseIntPipe) id: number) {
    return this.analytics.realtime(id, new Date());
  }
}
