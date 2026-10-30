'use client';

import { formatCount } from '@/lib/format';
import { TopRow } from '@/lib/types';
import { Panel, PanelState } from './panel';

interface TopTableProps {
  title: string;
  keyLabel: string;
  testId: string;
  rows: TopRow[] | undefined;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  displayKey?: (key: string) => string;
  onExport: () => void;
}

export function TopTable({ title, keyLabel, testId, rows, loading, error, onRetry, displayKey, onExport }: TopTableProps) {
  const max = Math.max(1, ...(rows ?? []).map((row) => row.pageviews));
  return (
    <Panel
      title={title}
      testId={testId}
      actions={
        <button type="button" className="ghost-button" onClick={onExport} disabled={!rows?.length}>
          Export CSV
        </button>
      }
    >
      <PanelState loading={loading} error={error} empty={!rows?.length} onRetry={onRetry}>
        <table className="top-table">
          <thead>
            <tr>
              <th scope="col">{keyLabel}</th>
              <th scope="col" className="num">
                Visitors
              </th>
              <th scope="col" className="num">
                Pageviews
              </th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((row) => (
              <tr key={row.key}>
                <td>
                  <div className="bar-cell">
                    <span className="bar" style={{ width: `${(row.pageviews / max) * 100}%` }} aria-hidden="true" />
                    <span className="bar-label" title={row.key}>
                      {displayKey ? displayKey(row.key) : row.key}
                    </span>
                  </div>
                </td>
                <td className="num">{formatCount(row.visitors)}</td>
                <td className="num">{formatCount(row.pageviews)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PanelState>
    </Panel>
  );
}

// Rows for CSV export, in the order of TOP_CSV_HEADERS. Revenue is in dollars, matching the on-screen currency.
export const TOP_CSV_HEADERS = ['key', 'visitors', 'pageviews', 'revenue_usd'];

export function topRowsToCsv(rows: TopRow[]): (string | number)[][] {
  return rows.map((row) => [row.key, row.visitors, row.pageviews, (row.revenueCents / 100).toFixed(2)]);
}
