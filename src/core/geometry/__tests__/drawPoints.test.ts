import { describe, expect, it } from 'vitest';
import type { LngLat } from '@/core/geometry/interpolate';
import {
  appendDistinctPolylineDrawPoint,
  areDrawPointsNear,
  normalizePolylineDrawPoints,
} from '../drawPoints';

const A: LngLat = [0, 0];
const NEAR_A: LngLat = [0.000001, 0];
const B: LngLat = [0.00001, 0];

describe('draw point near-duplicate handling', () => {
  it('treats sub-meter consecutive points as near duplicates', () => {
    expect(areDrawPointsNear(A, NEAR_A)).toBe(true);
    expect(areDrawPointsNear(A, B)).toBe(false);
  });

  it('does not append a near-duplicate polyline point', () => {
    expect(appendDistinctPolylineDrawPoint([A], NEAR_A)).toEqual([A]);
  });

  it('keeps distinct polyline points', () => {
    expect(appendDistinctPolylineDrawPoint([A], B)).toEqual([A, B]);
  });

  it('normalizes only polyline-style draw states', () => {
    expect(normalizePolylineDrawPoints('drawPolyline', [A, NEAR_A, B])).toEqual([A, B]);
    expect(normalizePolylineDrawPoints('drawCatmullRom', [A, NEAR_A, B])).toEqual([A, B]);
    expect(normalizePolylineDrawPoints('drawArc', [A, NEAR_A, B])).toEqual([A, NEAR_A, B]);
  });
});
