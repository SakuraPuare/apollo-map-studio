import { describe, expect, it } from 'vitest';
import type { LngLat } from '@/core/geometry/interpolate';
import { createDrawnEntity, hasDrawableGeometry } from '../mapEditingApi';

const A: LngLat = [0, 0];
const NEAR_A: LngLat = [0.000001, 0];
const B: LngLat = [0.00001, 0];
const FAR: LngLat = [0.001, 0];
const LANE_TAIL_CLUSTER: LngLat = [0.00103, 0];

describe('mapEditingApi draw point normalization', () => {
  it('treats near-duplicate polyline points as insufficient geometry', () => {
    expect(hasDrawableGeometry('drawPolyline', [A, NEAR_A], [])).toBe(false);
    expect(createDrawnEntity('drawPolyline', [A, NEAR_A], [], null)).toBeNull();
  });

  it('removes near-duplicate points from primitive polylines before commit', () => {
    const entity = createDrawnEntity('drawPolyline', [A, NEAR_A, B], [], null);

    expect(entity?.entityType).toBe('polyline');
    if (!entity || entity.entityType !== 'polyline') throw new Error('expected polyline');
    expect(entity.points).toEqual([
      { x: A[0], y: A[1] },
      { x: B[0], y: B[1] },
    ]);
  });

  it('removes near-duplicate points from Apollo line elements before commit', () => {
    const entity = createDrawnEntity('drawPolyline', [A, NEAR_A, B], [], 'lane');

    expect(entity?.entityType).toBe('lane');
    if (!entity || entity.entityType !== 'lane') throw new Error('expected lane');
    expect(entity.centralCurve.segments[0]?.lineSegment.points).toEqual([
      { x: A[0], y: A[1] },
      { x: B[0], y: B[1] },
    ]);
  });

  it('collapses lane tail clusters large enough to break offset geometry', () => {
    const entity = createDrawnEntity('drawPolyline', [A, FAR, LANE_TAIL_CLUSTER], [], 'lane');

    expect(entity?.entityType).toBe('lane');
    if (!entity || entity.entityType !== 'lane') throw new Error('expected lane');
    expect(entity.centralCurve.segments[0]?.lineSegment.points).toEqual([
      { x: A[0], y: A[1] },
      { x: FAR[0], y: FAR[1] },
    ]);
  });
});
