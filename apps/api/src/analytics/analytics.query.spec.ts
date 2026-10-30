import {
  InvalidQueryError,
  MAX_BUCKETS,
  parseDimension,
  parseFlag,
  parseInterval,
  parseLimit,
  parseRange,
} from './analytics.query.js';

const now = new Date('2026-10-30T12:00:00Z');

describe('parseRange', () => {
  it('defaults to the last seven days ending now', () => {
    expect(parseRange({}, now)).toEqual({
      from: new Date('2026-10-23T12:00:00Z'),
      to: now,
    });
  });

  it('reads explicit ISO bounds', () => {
    expect(parseRange({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' }, now)).toEqual({
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-02T00:00:00Z'),
    });
  });

  it('rejects unparseable bounds, inverted ranges and ranges over 400 days', () => {
    expect(() => parseRange({ from: 'last week' }, now)).toThrow(InvalidQueryError);
    expect(() => parseRange({ from: '2026-10-02T00:00:00Z', to: '2026-10-01T00:00:00Z' }, now)).toThrow(
      'from must be before to',
    );
    expect(() => parseRange({ from: '2024-01-01T00:00:00Z' }, now)).toThrow('range must be 400 days or less');
  });
});

describe('parseInterval', () => {
  const week = { from: new Date('2026-10-23T00:00:00Z'), to: new Date('2026-10-30T00:00:00Z') };

  it('defaults to day and accepts hour', () => {
    expect(parseInterval(undefined, week)).toBe('day');
    expect(parseInterval('hour', week)).toBe('hour');
  });

  it('rejects unknown intervals and too many buckets', () => {
    expect(() => parseInterval('week', week)).toThrow('interval must be hour or day');
    const long = { from: new Date('2020-01-01T00:00:00Z'), to: new Date('2026-10-30T00:00:00Z') };
    expect(() => parseInterval('hour', long)).toThrow(`more than ${MAX_BUCKETS} hour buckets`);
  });
});

describe('parseFlag, parseDimension and parseLimit', () => {
  it('parses compare as a strict boolean', () => {
    expect(parseFlag(undefined)).toBe(false);
    expect(parseFlag('true')).toBe(true);
    expect(() => parseFlag('yes')).toThrow('compare must be true or false');
  });

  it('only accepts the four known dimensions', () => {
    expect(parseDimension('referrer')).toBe('referrer');
    expect(() => parseDimension('browser')).toThrow('dimension must be one of path, referrer, country, device');
  });

  it('defaults the limit to 10 and caps it at 50', () => {
    expect(parseLimit(undefined)).toBe(10);
    expect(parseLimit('50')).toBe(50);
    expect(() => parseLimit('51')).toThrow('limit must be between 1 and 50');
    expect(() => parseLimit('5.5')).toThrow('limit must be an integer');
  });
});
