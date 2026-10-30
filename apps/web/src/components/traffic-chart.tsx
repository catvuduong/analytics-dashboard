'use client';

import { PointerEvent, useState } from 'react';
import { formatBucket, formatCompact, formatCount } from '@/lib/format';
import { niceCeiling, Point, smoothPath } from '@/lib/chart';
import { SeriesPoint } from '@/lib/types';

// Fixed logical size; the SVG scales to its container width while text keeps its proportions.
const W = 960;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };
const TICKS = 4;
const X_LABELS = 6;

export function TrafficChart({ points, interval }: { points: SeriesPoint[]; interval: 'hour' | 'day' }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const yMax = niceCeiling(Math.max(1, ...points.flatMap((p) => [p.visitors, p.pageviews])));
  const total = points.reduce((sum, p) => sum + p.pageviews, 0);

  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH * (1 - value / yMax);

  const visitorPoints: Point[] = points.map((p, i) => ({ x: x(i), y: y(p.visitors) }));
  const pageviewPoints: Point[] = points.map((p, i) => ({ x: x(i), y: y(p.pageviews) }));
  const visitorLine = smoothPath(visitorPoints, PAD.top, base);
  const visitorArea = n > 0 ? `${visitorLine} L${x(n - 1)},${base} L${x(0)},${base} Z` : '';
  const pageviewLine = smoothPath(pageviewPoints, PAD.top, base);

  const ticks = Array.from({ length: TICKS + 1 }, (_, k) => (yMax * k) / TICKS);
  const labelIndexes = [...new Set(Array.from({ length: X_LABELS }, (_, k) => Math.round((k * (n - 1)) / (X_LABELS - 1))))];

  // The overlay spans exactly the plot area, so the pointer fraction maps straight onto the buckets.
  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    if (n === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(fraction * (n - 1)))));
  };

  const hovered = hover !== null && n > 0 ? points[hover] : null;

  return (
    <div className="chart" data-testid="traffic-chart" data-points={n} data-interval={interval}>
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Visitors and pageviews over time">
          <defs>
            <linearGradient id="visitors-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="stop-visitors" stopOpacity="0.38" />
              <stop offset="100%" className="stop-visitors" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
              <text className="axis-text" x={PAD.left - 10} y={y(tick) + 4} textAnchor="end">
                {formatCompact(tick)}
              </text>
            </g>
          ))}

          <g className="x-labels">
            {labelIndexes.map((i) => (
              <text key={i} className="axis-text" x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                {formatBucket(points[i].bucket, interval)}
              </text>
            ))}
          </g>

          {n > 0 && (
            <>
              <path className="area-visitors" d={visitorArea} fill="url(#visitors-fill)" />
              <path className="line-visitors" d={visitorLine} fill="none" strokeWidth="2" />
              <path className="line-pageviews" d={pageviewLine} fill="none" strokeWidth="2" />
            </>
          )}

          {hovered && hover !== null && (
            <g pointerEvents="none">
              <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={base} />
              <circle className="dot-visitors" cx={x(hover)} cy={y(hovered.visitors)} r="4.5" />
              <circle className="dot-pageviews" cx={x(hover)} cy={y(hovered.pageviews)} r="4.5" />
            </g>
          )}

          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>

        {hovered && hover !== null && (
          <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <div className="tooltip-title">{formatBucket(hovered.bucket, interval)}</div>
            <div className="tooltip-row">
              <span className="swatch swatch-visitors" /> Visitors <strong>{formatCount(hovered.visitors)}</strong>
            </div>
            <div className="tooltip-row">
              <span className="swatch swatch-pageviews" /> Pageviews <strong>{formatCount(hovered.pageviews)}</strong>
            </div>
          </div>
        )}

        {n > 0 && total === 0 && <div className="chart-empty">No traffic in this range</div>}
      </div>
    </div>
  );
}
