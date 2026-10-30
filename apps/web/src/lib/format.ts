const number = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const regions = new Intl.DisplayNames(['en'], { type: 'region' });

export function formatCount(value: number): string {
  return number.format(value);
}

export function formatCompact(value: number): string {
  return compact.format(value);
}

export function formatRevenue(cents: number): string {
  return currency.format(cents / 100);
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

// Percent change with an explicit sign. Null means the previous period was zero.
export function formatChange(change: number | null): string {
  if (change === null) return 'new';
  if (Math.abs(change) < 0.05) return '0.0%';
  return `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`;
}

export function countryName(code: string): string {
  if (code === '(unknown)' || code === '') return code;
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

const utcHour = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
const utcDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function formatBucket(iso: string, interval: 'hour' | 'day'): string {
  const date = new Date(iso);
  return interval === 'hour' ? utcHour.format(date) : utcDay.format(date);
}
