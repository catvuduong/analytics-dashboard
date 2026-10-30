import { formatCount, formatPercent } from '@/lib/format';
import { FunnelStep } from '@/lib/types';
import { Panel, PanelState } from './panel';

const LABELS: Record<string, string> = {
  pageview: 'Viewed a page',
  signup: 'Signed up',
  purchase: 'Purchased',
};

// Centred bars so the stack reads as a funnel. Width is the share of the first step; a floor keeps tiny
// steps visible.
export function Funnel({
  steps,
  loading,
  error,
  onRetry,
}: {
  steps: FunnelStep[] | undefined;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const first = steps?.[0]?.visitors ?? 0;
  return (
    <Panel title="Conversion funnel" subtitle="Visitors who reached each step, in order" testId="funnel">
      <PanelState loading={loading} error={error} empty={!steps || first === 0} onRetry={onRetry}>
        <ol className="funnel">
          {steps?.map((step, index) => (
            <li key={step.key} className="funnel-step">
              <div className="funnel-meta">
                <span className="funnel-label">{LABELS[step.key] ?? step.key}</span>
                <span className="funnel-count">{formatCount(step.visitors)}</span>
              </div>
              <div className="funnel-track">
                <div
                  className="funnel-bar"
                  style={{ width: `${Math.max(step.fromStart * 100, 8)}%`, opacity: 1 - index * 0.18 }}
                />
              </div>
              <div className="funnel-rates">
                <span>{formatPercent(step.fromStart)} of visitors</span>
                {step.fromPrevious !== null && <span>{formatPercent(step.fromPrevious)} from previous step</span>}
              </div>
            </li>
          ))}
        </ol>
      </PanelState>
    </Panel>
  );
}
