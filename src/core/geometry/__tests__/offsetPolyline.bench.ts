/**
 * Benchmark for `offsetPolylineDeg` — the hot core of lane width rendering.
 * Regression guard target: offset of a 100-point polyline stays under 5ms p99.
 */
import { bench, describe } from 'vitest';
import { offsetPolylineDeg } from '@/core/geometry/apolloCompile';
import type { GeoPoint } from '@/types/entities';

function makePolyline(count: number): GeoPoint[] {
  // Gentle arc around (116, 30) with step ~0.0001 deg (~10m) to exercise
  // the projection-normalise and miter-limit branches.
  const pts: GeoPoint[] = [];
  const baseLng = 116;
  const baseLat = 30;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI;
    pts.push({ x: baseLng + Math.sin(t) * 0.02, y: baseLat + i * 0.0001 });
  }
  return pts;
}

describe('offsetPolylineDeg', () => {
  const short = makePolyline(10);
  const medium = makePolyline(100);
  const long = makePolyline(1000);

  bench('10-point polyline, 3.5m offset', () => {
    offsetPolylineDeg(short, 3.5, 'left');
  });

  bench('100-point polyline, 3.5m offset', () => {
    offsetPolylineDeg(medium, 3.5, 'left');
  });

  bench('1000-point polyline, 3.5m offset', () => {
    offsetPolylineDeg(long, 3.5, 'left');
  });
});
