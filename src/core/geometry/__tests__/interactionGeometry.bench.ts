import { bench, describe } from 'vitest';
import { pointToPolygonDistGeo, pointToPolylineDistGeo } from '../hitTest';
import { findSnapTarget } from '../snap';
import { polygonSelfIntersects, wouldSelfIntersect } from '../validation';
import type { LngLat } from '../interpolate';
import { buildPerfEntities } from '@/test/fixtures/perfEntities';

function longPolyline(count: number): LngLat[] {
  return Array.from({ length: count }, (_, i) => [
    116.4 + i * 0.00001,
    39.9 + Math.sin(i * 0.11) * 0.00002,
  ]);
}

function ring(count: number): LngLat[] {
  const cx = 116.4;
  const cy = 39.9;
  const r = 0.01;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

describe('snap mousemove scan', () => {
  for (const scale of [
    { label: '1k', count: 1_000 },
    { label: '5k', count: 5_000 },
    { label: '10k', count: 10_000 },
  ]) {
    const entities = buildPerfEntities(scale.count, 5);
    const target = { x: 116.40002, y: 39.90001 };

    bench(`snap ${scale.label} entities — find target`, () => {
      findSnapTarget(target, entities, 30);
    });
  }
});

describe('hit-test geometry primitives', () => {
  for (const count of [1_000, 5_000]) {
    const polyline = longPolyline(count);
    const query: LngLat = [116.407, 39.90001];
    bench(`hitTest polyline ${count} segments — distance`, () => {
      pointToPolylineDistGeo(query, polyline, 0.76);
    });
  }

  for (const count of [1_000, 5_000]) {
    const polygon = ring(count);
    const query: LngLat = [116.412, 39.9];
    bench(`hitTest polygon ${count} vertices — distance`, () => {
      pointToPolygonDistGeo(query, polygon, 0.76);
    });
  }
});

describe('polygon validation', () => {
  for (const count of [100, 500, 1_000]) {
    const polygon = ring(count);
    const nextPoint: LngLat = [116.39, 39.91];

    bench(`validation ${count} vertices — append edge`, () => {
      wouldSelfIntersect(polygon, nextPoint);
    });

    bench(`validation ${count} vertices — full self-intersection`, () => {
      polygonSelfIntersects(polygon);
    });
  }
});
