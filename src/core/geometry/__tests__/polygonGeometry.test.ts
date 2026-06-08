import { describe, expect, it } from 'vitest';
import {
  polygonGeometry,
  polylineSelfIntersects,
  polylinesIntersect,
  unionPolygonGeometry,
} from '../polygonGeometry';
import type { LngLat } from '../interpolate';

function circleRing(count: number, radius = 10): LngLat[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

function subdivideRing(vertices: readonly LngLat[], segmentsPerEdge: number): LngLat[] {
  const ring: LngLat[] = [];
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index]!;
    const end = vertices[(index + 1) % vertices.length]!;
    for (let step = 0; step < segmentsPerEdge; step++) {
      const t = step / segmentsPerEdge;
      ring.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
    }
  }
  return ring;
}

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

  it('does not duplicate an already closed ring', () => {
    const closed: LngLat[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];

    const geometry = polygonGeometry(closed);

    expect(geometry.type).toBe('Polygon');
    expect((geometry as GeoJSON.Polygon).coordinates[0]).toEqual(closed);
  });

  it('returns a best-effort polygon for short or empty rings', () => {
    expect((polygonGeometry([]) as GeoJSON.Polygon).coordinates).toEqual([[]]);
    expect((polygonGeometry([[1, 2]]) as GeoJSON.Polygon).coordinates).toEqual([[[1, 2]]]);
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

  it('keeps large simple rings stable through the indexed normalization path', () => {
    const ring = circleRing(80);

    const geometry = polygonGeometry(ring);

    expect(geometry.type).toBe('Polygon');
    const outer = (geometry as GeoJSON.Polygon).coordinates[0]!;
    expect(outer).toHaveLength(81);
    expect(outer[0]).toEqual(outer.at(-1));
  });

  it('keeps repeated adjacent points as a closed best-effort polygon', () => {
    const ring: LngLat[] = [
      [0, 0],
      [0, 0],
      [2, 0],
      [0, 2],
    ];

    const geometry = polygonGeometry(ring);

    expect(geometry.type).toBe('Polygon');
    expect((geometry as GeoJSON.Polygon).coordinates[0]).toEqual([
      [0, 0],
      [0, 0],
      [2, 0],
      [0, 2],
      [0, 0],
    ]);
  });

  it('normalizes non-adjacent segment touches, not only crossings', () => {
    const touchingRing: LngLat[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [1, 0],
      [0, 2],
    ];

    const geometry = polygonGeometry(touchingRing);

    expect(geometry.type).toBe('MultiPolygon');
    expect((geometry as GeoJSON.MultiPolygon).coordinates).toHaveLength(2);
  });

  it('normalizes large self-intersecting rings through the indexed path', () => {
    const ring = subdivideRing(
      [
        [0, 0],
        [3, 3],
        [2, 0],
        [0, 2],
      ],
      17,
    );

    const geometry = polygonGeometry(ring);

    expect(geometry.type).toBe('MultiPolygon');
    expect((geometry as GeoJSON.MultiPolygon).coordinates.length).toBeGreaterThan(1);
  });

  it('falls back to the closed ring when normalization cannot clip a degenerate ring', () => {
    const ring: LngLat[] = [
      [0, 0],
      [3, 3],
      [2, 0],
      [0, 2],
      [Number.NaN, 1],
    ];

    const geometry = polygonGeometry(ring);
    const outer = (geometry as GeoJSON.Polygon).coordinates[0]!;

    expect(geometry.type).toBe('Polygon');
    expect(outer[0]).toEqual(outer.at(-1));
    expect(Number.isNaN(outer[4]![0]!)).toBe(true);
  });
});

describe('unionPolygonGeometry', () => {
  it('returns null when every ring is too short for polygon clipping', () => {
    expect(
      unionPolygonGeometry([
        [],
        [[0, 0]],
        [
          [0, 0],
          [1, 0],
        ],
      ]),
    ).toBeNull();
  });

  it('unions overlapping rings into a polygon', () => {
    const geometry = unionPolygonGeometry([
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
      ],
    ]);

    expect(geometry).not.toBeNull();
    expect(geometry!.type).toBe('Polygon');
    expect((geometry as GeoJSON.Polygon).coordinates[0]![0]).toEqual(
      (geometry as GeoJSON.Polygon).coordinates[0]!.at(-1),
    );
  });

  it('keeps disjoint rings as a MultiPolygon', () => {
    const geometry = unionPolygonGeometry([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      [
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 11],
      ],
    ]);

    expect(geometry?.type).toBe('MultiPolygon');
    expect((geometry as GeoJSON.MultiPolygon).coordinates).toHaveLength(2);
  });

  it('returns null when clipping collapses degenerate collinear rings', () => {
    expect(
      unionPolygonGeometry([
        [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
      ]),
    ).toBeNull();
  });
});

describe('polylineSelfIntersects', () => {
  it('returns false for short lines and adjacent segment touches', () => {
    expect(polylineSelfIntersects([])).toBe(false);
    expect(
      polylineSelfIntersects([
        [0, 0],
        [1, 1],
        [2, 2],
      ]),
    ).toBe(false);
    expect(
      polylineSelfIntersects([
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
      ]),
    ).toBe(false);
  });

  it('detects non-adjacent open segment crossings', () => {
    expect(
      polylineSelfIntersects([
        [0, 0],
        [2, 2],
        [0, 2],
        [2, 0],
      ]),
    ).toBe(true);
  });

  it('detects non-adjacent endpoint touches', () => {
    expect(
      polylineSelfIntersects([
        [0, 0],
        [2, 0],
        [2, 2],
        [1, 0],
      ]),
    ).toBe(true);
  });

  it('ignores repeated points that collapse too many open segments', () => {
    expect(
      polylineSelfIntersects([
        [0, 0],
        [0, 0],
        [1, 0],
        [1, 0],
      ]),
    ).toBe(false);
  });

  it('uses the indexed path for long open polylines', () => {
    const longLine = Array.from({ length: 71 }, (_, index) => [index, 0] as LngLat);

    expect(polylineSelfIntersects(longLine)).toBe(false);
    expect(polylineSelfIntersects([...longLine, [35, -1], [35, 1]])).toBe(true);
  });
});

describe('polylinesIntersect', () => {
  it('returns false for degenerate inputs', () => {
    expect(
      polylinesIntersect(
        [],
        [
          [0, 0],
          [1, 1],
        ],
      ),
    ).toBe(false);
    expect(
      polylinesIntersect(
        [
          [0, 0],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 2],
        ],
      ),
    ).toBe(false);
  });

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

  it('ignores candidates whose bounds overlap but segments do not touch', () => {
    expect(
      polylinesIntersect(
        [
          [0, 0],
          [2, 2],
        ],
        [
          [0, 1],
          [2, 3],
        ],
      ),
    ).toBe(false);
  });

  it('detects endpoint touches and collinear overlaps', () => {
    expect(
      polylinesIntersect(
        [
          [0, 0],
          [1, 1],
        ],
        [
          [1, 1],
          [2, 1],
        ],
      ),
    ).toBe(true);
    expect(
      polylinesIntersect(
        [
          [0, 0],
          [2, 0],
        ],
        [
          [1, 0],
          [3, 0],
        ],
      ),
    ).toBe(true);
  });
});
