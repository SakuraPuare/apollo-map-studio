import { describe, expect, it } from 'vitest';
import { polygonGeometry, polylinesIntersect } from '../polygonGeometry';
import type { LngLat } from '../interpolate';

describe('polygonGeometry', () => {
  it('keeps simple polygons as Polygon geometry', () => {
    const square: LngLat[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];

    const geometry = polygonGeometry(square);

    expect(geometry.type).toBe('Polygon');
    expect((geometry as GeoJSON.Polygon).coordinates[0]).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ]);
  });

  it('normalizes self-intersecting rings into simple multipolygon pieces', () => {
    const bowtie: LngLat[] = [
      [0, 0],
      [3, 3],
      [2, 0],
      [0, 2],
    ];

    const geometry = polygonGeometry(bowtie);

    expect(geometry.type).toBe('MultiPolygon');
    const pieces = (geometry as GeoJSON.MultiPolygon).coordinates;
    expect(pieces).toHaveLength(2);
    for (const polygon of pieces) {
      const outer = polygon[0]!;
      expect(outer.length).toBeGreaterThanOrEqual(4);
      expect(outer[0]).toEqual(outer[outer.length - 1]);
    }
  });
});

describe('polylinesIntersect', () => {
  it('detects crossings between two open polylines', () => {
    expect(
      polylinesIntersect(
        [
          [0, 0],
          [2, 2],
        ],
        [
          [0, 2],
          [2, 0],
        ],
      ),
    ).toBe(true);
  });

  it('ignores separated open polylines', () => {
    expect(
      polylinesIntersect(
        [
          [0, 0],
          [2, 0],
        ],
        [
          [0, 1],
          [2, 1],
        ],
      ),
    ).toBe(false);
  });
});
