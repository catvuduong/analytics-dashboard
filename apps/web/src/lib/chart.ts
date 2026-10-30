export interface Point {
  x: number;
  y: number;
}

// Smooth curve through the points (Catmull-Rom converted to cubic Béziers). Control-point y values are
// clamped to [minY, maxY] so the curve never dips under the baseline between two zero readings.
export function smoothPath(points: Point[], minY: number, maxY: number): string {
  if (points.length === 0) return '';
  const clamp = (y: number) => Math.min(maxY, Math.max(minY, y));
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

// Rounds a maximum up to a 1/2/5 x 10^n value so axis ticks land on round numbers.
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}
