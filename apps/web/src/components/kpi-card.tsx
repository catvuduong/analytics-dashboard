import { formatChange } from '@/lib/format';

// `goodWhenDown` flips the colour for metrics where a drop is an improvement (bounce rate).
export function DeltaBadge({
  change,
  goodWhenDown = false,
  testId,
}: {
  change: number | null | undefined;
  goodWhenDown?: boolean;
  testId?: string;
}) {
  if (change === undefined) return null;
  const up = change !== null && change > 0.05;
  const down = change !== null && change < -0.05;
  const good = goodWhenDown ? down : up;
  const tone = change === null || (!up && !down) ? 'flat' : good ? 'good' : 'bad';
  const arrow = up ? '▲' : down ? '▼' : change === null ? '★' : '◆';
  return (
    <span className={`delta delta-${tone}`} data-testid={testId} title="vs previous period">
      <span aria-hidden="true">{arrow}</span> {formatChange(change)}
    </span>
  );
}

interface KpiCardProps {
  label: string;
  value: string | null;
  change?: number | null;
  goodWhenDown?: boolean;
  valueTestId: string;
  deltaTestId: string;
  loading: boolean;
}

export function KpiCard({ label, value, change, goodWhenDown, valueTestId, deltaTestId, loading }: KpiCardProps) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      {loading || value === null ? (
        <div className="kpi-value kpi-placeholder" aria-busy={loading}>
          &mdash;
        </div>
      ) : (
        <div className="kpi-value" data-testid={valueTestId}>
          {value}
        </div>
      )}
      <div className="kpi-footer">
        {!loading && value !== null && (
          <DeltaBadge change={change} goodWhenDown={goodWhenDown} testId={deltaTestId} />
        )}
        <span className="kpi-hint">vs previous period</span>
      </div>
    </div>
  );
}
