import { describe, expect, it } from 'vitest';
import type { LaneEntity } from '@/types/apollo';
import type { LngLat } from '@/core/geometry/interpolate';
import { createApolloEntity, compileApolloFeatures } from '../apolloCompile';
import { applyLaneJunctions } from '../laneJunctions';

const DEG_TO_M = 111320;
const LAT = 30;
const cosLat = Math.cos((LAT * Math.PI) / 180);
const mPerLng = cosLat * DEG_TO_M;
const mPerLat = DEG_TO_M;
const WIDTH = 3.5;

const pt = (x: number, y: number) => ({ x, y });

function toM(coord: LngLat | { x: number; y: number }) {
  const x = Array.isArray(coord) ? coord[0] : coord.x;
  const y = Array.isArray(coord) ? coord[1] : coord.y;
  return [x * mPerLng, y * mPerLat] as const;
}

function distFrom(a: LngLat | { x: number; y: number }, b: LngLat | { x: number; y: number }) {
  const [ax, ay] = toM(a);
  const [bx, by] = toM(b);
  return Math.hypot(ax - bx, ay - by);
}

function offsetFrom(
  coord: LngLat | { x: number; y: number },
  origin: LngLat | { x: number; y: number },
) {
  const [x, y] = toM(coord);
  const [ox, oy] = toM(origin);
  return [x - ox, y - oy] as const;
}

function makeLane(
  id: string,
  coords: LngLat[],
  widths: { left?: number; right?: number } = {},
): LaneEntity {
  const lane = createApolloEntity('lane', 'drawPolyline', coords, [], {
    laneHalfWidth: WIDTH,
  }) as LaneEntity;
  return {
    ...lane,
    id,
    leftSamples: [{ s: 0, width: widths.left ?? WIDTH }],
    rightSamples: [{ s: 0, width: widths.right ?? WIDTH }],
  };
}

function stitch(lanes: LaneEntity[], excludeId?: string | null) {
  const features = lanes.flatMap((lane) => compileApolloFeatures(lane));
  return applyLaneJunctions(features, lanes, excludeId);
}

function laneLine(
  features: GeoJSON.Feature[],
  id: string,
  role: 'laneEdgeLeft' | 'laneEdgeRight',
): GeoJSON.Feature<GeoJSON.LineString> {
  const feature = features.find(
    (item) => item.properties?.id === id && item.properties?.role === role,
  );
  expect(feature?.geometry.type).toBe('LineString');
  return feature as GeoJSON.Feature<GeoJSON.LineString>;
}

function lanePolygon(features: GeoJSON.Feature[], id: string): GeoJSON.Feature<GeoJSON.Polygon> {
  const feature = features.find(
    (item) => item.properties?.id === id && item.geometry.type === 'Polygon',
  );
  expect(feature?.geometry.type).toBe('Polygon');
  return feature as GeoJSON.Feature<GeoJSON.Polygon>;
}

function laneDecorLines(
  features: GeoJSON.Feature[],
  id: string,
  side: 'left' | 'right',
): GeoJSON.Feature<GeoJSON.LineString>[] {
  return features.filter(
    (item) =>
      item.properties?.id === id &&
      item.properties?.role === 'laneBoundaryDecor' &&
      item.properties?.boundarySide === side &&
      item.geometry.type === 'LineString',
  ) as GeoJSON.Feature<GeoJSON.LineString>[];
}

function polygonEndpoint(
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
  left: GeoJSON.Feature<GeoJSON.LineString>,
  right: GeoJSON.Feature<GeoJSON.LineString>,
  side: 'left' | 'right',
  isStart: boolean,
): LngLat {
  const ring = polygon.geometry.coordinates[0]!;
  const logicalLen = ring.length - 1;
  const leftLen = left.geometry.coordinates.length;
  const rightLen = right.geometry.coordinates.length;
  expect(logicalLen).toBe(leftLen + rightLen);

  const index =
    side === 'left' ? (isStart ? 0 : leftLen - 1) : isStart ? leftLen + rightLen - 1 : leftLen;
  return ring[index] as LngLat;
}

describe('applyLaneJunctions', () => {
  it('90° 右转时，内侧右边界收短到西南交点，且 polygon 同步更新', () => {
    const junction = pt(116.001, LAT);
    const laneA = makeLane('laneA', [
      [116.001 - 100 / mPerLng, LAT],
      [junction.x, junction.y],
    ]);
    const laneB = makeLane('laneB', [
      [junction.x, junction.y],
      [junction.x, LAT - 100 / mPerLat],
    ]);

    const features = stitch([laneA, laneB]);
    const rightA = laneLine(features, 'laneA', 'laneEdgeRight');
    const rightB = laneLine(features, 'laneB', 'laneEdgeRight');
    const joinA = rightA.geometry.coordinates[rightA.geometry.coordinates.length - 1] as LngLat;
    const joinB = rightB.geometry.coordinates[0] as LngLat;

    expect(joinA[0]).toBeCloseTo(joinB[0], 10);
    expect(joinA[1]).toBeCloseTo(joinB[1], 10);
    expect(joinA[0]).toBeLessThan(junction.x);
    expect(joinA[1]).toBeLessThan(junction.y);

    const polyA = lanePolygon(features, 'laneA');
    const polyB = lanePolygon(features, 'laneB');
    expect(
      polygonEndpoint(
        polyA,
        laneLine(features, 'laneA', 'laneEdgeLeft'),
        rightA,
        'right',
        false,
      )[0],
    ).toBeCloseTo(joinA[0], 10);
    expect(
      polygonEndpoint(
        polyA,
        laneLine(features, 'laneA', 'laneEdgeLeft'),
        rightA,
        'right',
        false,
      )[1],
    ).toBeCloseTo(joinA[1], 10);
    expect(
      polygonEndpoint(polyB, laneLine(features, 'laneB', 'laneEdgeLeft'), rightB, 'right', true)[0],
    ).toBeCloseTo(joinA[0], 10);
    expect(
      polygonEndpoint(polyB, laneLine(features, 'laneB', 'laneEdgeLeft'), rightB, 'right', true)[1],
    ).toBeCloseTo(joinA[1], 10);
  });

  it('尖锐 V 形连续转向时，内侧 join 保持精确交点，不被 3w 截断', () => {
    const segLen = 100;
    const alpha = (150 * Math.PI) / 180;
    const junction = pt(116.001, LAT);
    const laneA = makeLane('laneA', [
      [junction.x - segLen / mPerLng, LAT],
      [junction.x, junction.y],
    ]);
    const laneB = makeLane('laneB', [
      [junction.x, junction.y],
      [
        junction.x + (segLen * Math.cos(alpha)) / mPerLng,
        junction.y + (segLen * Math.sin(alpha)) / mPerLat,
      ],
    ]);

    const features = stitch([laneA, laneB]);
    const rightA = laneLine(features, 'laneA', 'laneEdgeRight');
    const rightB = laneLine(features, 'laneB', 'laneEdgeRight');
    const leftA = laneLine(features, 'laneA', 'laneEdgeLeft');
    const joinInner = rightA.geometry.coordinates[rightA.geometry.coordinates.length - 1] as LngLat;
    const joinInnerB = rightB.geometry.coordinates[0] as LngLat;
    const joinOuter = leftA.geometry.coordinates[leftA.geometry.coordinates.length - 1] as LngLat;

    expect(joinInner[0]).toBeCloseTo(joinInnerB[0], 10);
    expect(joinInner[1]).toBeCloseTo(joinInnerB[1], 10);
    expect(distFrom(joinInner, junction)).toBeGreaterThan(3 * WIDTH);
    expect(distFrom(joinOuter, junction)).toBeLessThanOrEqual(3 * WIDTH + 0.25);

    const polyA = lanePolygon(features, 'laneA');
    const polyB = lanePolygon(features, 'laneB');
    expect(
      distFrom(polygonEndpoint(polyA, leftA, rightA, 'right', false), junction),
    ).toBeGreaterThan(3 * WIDTH);
    expect(
      distFrom(
        polygonEndpoint(polyB, laneLine(features, 'laneB', 'laneEdgeLeft'), rightB, 'right', true),
        junction,
      ),
    ).toBeGreaterThan(3 * WIDTH);
  });

  it('不同左右宽度时，左右 join 使用各自边界宽度', () => {
    const junction = pt(116.001, LAT);
    const laneA = makeLane(
      'laneA',
      [
        [116.001 - 100 / mPerLng, LAT],
        [junction.x, junction.y],
      ],
      { left: 2, right: 3 },
    );
    const laneB = makeLane(
      'laneB',
      [
        [junction.x, junction.y],
        [junction.x, LAT + 100 / mPerLat],
      ],
      { left: 4, right: 5 },
    );

    const features = stitch([laneA, laneB]);
    const leftJoin = laneLine(features, 'laneA', 'laneEdgeLeft').geometry.coordinates.at(
      -1,
    ) as LngLat;
    const rightJoin = laneLine(features, 'laneA', 'laneEdgeRight').geometry.coordinates.at(
      -1,
    ) as LngLat;
    const [leftDx, leftDy] = offsetFrom(leftJoin, junction);
    const [rightDx, rightDy] = offsetFrom(rightJoin, junction);

    expect(leftDx).toBeCloseTo(-4, 3);
    expect(leftDy).toBeCloseTo(2, 3);
    expect(rightDx).toBeCloseTo(5, 3);
    expect(rightDy).toBeCloseTo(-3, 3);
  });

  it('excludeId 对应的 lane 不参与剩余 feature 的 junction 修正', () => {
    const junction = pt(116.001, LAT);
    const laneA = makeLane('laneA', [
      [116.001 - 100 / mPerLng, LAT],
      [junction.x, junction.y],
    ]);
    const laneB = makeLane('laneB', [
      [junction.x, junction.y],
      [junction.x, LAT + 100 / mPerLat],
    ]);

    const original = compileApolloFeatures(laneA);
    const originalLeft = laneLine(original, 'laneA', 'laneEdgeLeft').geometry.coordinates.at(
      -1,
    ) as LngLat;
    const originalRight = laneLine(original, 'laneA', 'laneEdgeRight').geometry.coordinates.at(
      -1,
    ) as LngLat;
    const features = applyLaneJunctions([...original], [laneA, laneB], laneB.id);
    const leftAfter = laneLine(features, 'laneA', 'laneEdgeLeft').geometry.coordinates.at(
      -1,
    ) as LngLat;
    const rightAfter = laneLine(features, 'laneA', 'laneEdgeRight').geometry.coordinates.at(
      -1,
    ) as LngLat;

    expect(leftAfter[0]).toBeCloseTo(originalLeft[0], 10);
    expect(leftAfter[1]).toBeCloseTo(originalLeft[1], 10);
    expect(rightAfter[0]).toBeCloseTo(originalRight[0], 10);
    expect(rightAfter[1]).toBeCloseTo(originalRight[1], 10);
  });

  it('左右边界按各自 boundaryType 渲染，不再共用同一种样式', () => {
    const lane = makeLane('laneA', [
      [116.0, LAT],
      [116.001, LAT],
    ]);
    lane.leftBoundary.boundaryType = [{ s: 0, types: ['DOUBLE_YELLOW'] }];
    lane.rightBoundary.boundaryType = [{ s: 0, types: ['DOTTED_WHITE'] }];

    const features = stitch([lane]);
    const leftDecor = laneDecorLines(features, lane.id, 'left');
    const rightDecor = laneDecorLines(features, lane.id, 'right');

    expect(leftDecor).toHaveLength(2);
    expect(leftDecor.every((feature) => feature.properties?.boundaryType === 'DOUBLE_YELLOW')).toBe(
      true,
    );
    expect(leftDecor.every((feature) => feature.properties?.color === '#f3d046')).toBe(true);

    expect(rightDecor).toHaveLength(1);
    expect(rightDecor[0]!.properties?.boundaryType).toBe('DOTTED_WHITE');
    expect(rightDecor[0]!.properties?.color).toBe('#ffffff');
    expect(rightDecor[0]!.properties?.dashed).toBe(true);
    expect(rightDecor[0]!.properties?.dotted).toBe(true);
  });

  it('同一侧 boundaryType 按 s 分段渲染', () => {
    const lane = makeLane('laneA', [
      [116.0, LAT],
      [116.0 + 120 / mPerLng, LAT],
    ]);
    lane.leftBoundary.boundaryType = [
      { s: 0, types: ['SOLID_YELLOW'] },
      { s: 60, types: ['DOTTED_YELLOW'] },
    ];

    const features = stitch([lane]);
    const leftDecor = laneDecorLines(features, lane.id, 'left');

    expect(leftDecor).toHaveLength(2);
    expect(leftDecor[0]!.properties?.boundaryType).toBe('SOLID_YELLOW');
    expect(leftDecor[0]!.properties?.dashed).toBeUndefined();
    expect(leftDecor[1]!.properties?.boundaryType).toBe('DOTTED_YELLOW');
    expect(leftDecor[1]!.properties?.dashed).toBe(true);
    expect(leftDecor[1]!.properties?.dotted).toBe(true);
  });
});

describe('applyLaneJunctions — decorateOnly (incremental cache support)', () => {
  function makeLanePair(): { laneA: LaneEntity; laneB: LaneEntity } {
    const junction = pt(116.001, LAT);
    const laneA = makeLane('laneA', [
      [116.001 - 100 / mPerLng, LAT],
      [junction.x, junction.y],
    ]);
    const laneB = makeLane('laneB', [
      [junction.x, junction.y],
      [junction.x, LAT - 100 / mPerLat],
    ]);
    laneA.leftBoundary.boundaryType = [{ s: 0, types: ['SOLID_YELLOW'] }];
    laneA.rightBoundary.boundaryType = [{ s: 0, types: ['SOLID_WHITE'] }];
    laneB.leftBoundary.boundaryType = [{ s: 0, types: ['SOLID_YELLOW'] }];
    laneB.rightBoundary.boundaryType = [{ s: 0, types: ['SOLID_WHITE'] }];
    return { laneA, laneB };
  }

  it('decorateOnly=undefined decorates every lane (back-compat)', () => {
    const { laneA, laneB } = makeLanePair();
    const features = stitch([laneA, laneB]);
    expect(laneDecorLines(features, 'laneA', 'left').length).toBeGreaterThan(0);
    expect(laneDecorLines(features, 'laneB', 'left').length).toBeGreaterThan(0);
  });

  it('decorateOnly={laneA} decorates only laneA, leaving laneB undecorated', () => {
    const { laneA, laneB } = makeLanePair();
    const input = [laneA, laneB].flatMap((lane) => compileApolloFeatures(lane));
    const result = applyLaneJunctions([...input], [laneA, laneB], null, new Set(['laneA']));
    expect(laneDecorLines(result, 'laneA', 'left').length).toBeGreaterThan(0);
    expect(laneDecorLines(result, 'laneA', 'right').length).toBeGreaterThan(0);
    expect(laneDecorLines(result, 'laneB', 'left').length).toBe(0);
    expect(laneDecorLines(result, 'laneB', 'right').length).toBe(0);
  });

  it('decorateOnly=empty set produces zero new decoration', () => {
    const { laneA, laneB } = makeLanePair();
    const input = [laneA, laneB].flatMap((lane) => compileApolloFeatures(lane));
    const result = applyLaneJunctions([...input], [laneA, laneB], null, new Set());
    expect(laneDecorLines(result, 'laneA', 'left').length).toBe(0);
    expect(laneDecorLines(result, 'laneB', 'left').length).toBe(0);
  });

  it('decorateOnly does not affect junction stitching — both edges still join', () => {
    const { laneA, laneB } = makeLanePair();
    const input = [laneA, laneB].flatMap((lane) => compileApolloFeatures(lane));
    const result = applyLaneJunctions([...input], [laneA, laneB], null, new Set(['laneA']));
    const rightA = laneLine(result, 'laneA', 'laneEdgeRight');
    const rightB = laneLine(result, 'laneB', 'laneEdgeRight');
    const joinA = rightA.geometry.coordinates[rightA.geometry.coordinates.length - 1] as LngLat;
    const joinB = rightB.geometry.coordinates[0] as LngLat;
    // Junction stitching is global — laneB's edge is still pulled to the join.
    expect(joinA[0]).toBeCloseTo(joinB[0], 10);
    expect(joinA[1]).toBeCloseTo(joinB[1], 10);
  });
});

// ─── Snap-connected lane boundary regression ──────────────
//
// Bug context: at near-180° head-to-head turns the analytic miter
// intersection blew up (40m+) because the inner branch of
// `sideJoinOffset` returned `exact` without a magnitude cap. Fix:
// universal cap-by-midpoint when |exact| > MAX_OUTER_MITER * width.
//
// This block sweeps practical turn angles 30°…160° to pin geometric
// invariants. The U-turn region (|angle| ≥ 165°) is excluded — those
// connections require a junction entity, not a continuous lane link;
// see the design note in `sideJoinOffset`.

describe('Snap-connected lane boundaries (regression sweep)', () => {
  function segmentsCross(a1: LngLat, a2: LngLat, b1: LngLat, b2: LngLat): boolean {
    const A1 = toM(a1);
    const A2 = toM(a2);
    const B1 = toM(b1);
    const B2 = toM(b2);
    const d1x = A2[0] - A1[0];
    const d1y = A2[1] - A1[1];
    const d2x = B2[0] - B1[0];
    const d2y = B2[1] - B1[1];
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-12) return false;
    const dx = B1[0] - A1[0];
    const dy = B1[1] - A1[1];
    const t = (dx * d2y - dy * d2x) / denom;
    const u = (dx * d1y - dy * d1x) / denom;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
  }
  function selfCrosses(coords: LngLat[]): boolean {
    for (let i = 0; i < coords.length - 1; i++) {
      for (let j = i + 2; j < coords.length - 1; j++) {
        if (segmentsCross(coords[i]!, coords[i + 1]!, coords[j]!, coords[j + 1]!)) return true;
      }
    }
    return false;
  }
  function pairCrosses(a: LngLat[], b: LngLat[]): boolean {
    for (let i = 0; i < a.length - 1; i++) {
      for (let j = 0; j < b.length - 1; j++) {
        if (segmentsCross(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) return true;
      }
    }
    return false;
  }

  const STEP_M = 30;
  const stepLng = STEP_M / mPerLng;
  const stepLat = STEP_M / mPerLat;

  for (const turnDeg of [30, 60, 90, 120, 140, 160, -30, -60, -90, -120, -140, -160]) {
    it(`turn ${turnDeg}° produces non-crossing boundary geometry`, () => {
      const rad = (turnDeg * Math.PI) / 180;
      const a = makeLane('A', [
        [-stepLng * 2, LAT],
        [-stepLng, LAT],
        [0, LAT],
      ]);
      const dirX = Math.cos(rad);
      const dirY = Math.sin(rad);
      const b = makeLane('B', [
        [0, LAT],
        [stepLng * dirX, LAT + stepLat * dirY],
        [stepLng * 2 * dirX, LAT + stepLat * 2 * dirY],
      ]);

      const features = stitch([a, b]);
      const aLeft = laneLine(features, 'A', 'laneEdgeLeft').geometry.coordinates as LngLat[];
      const aRight = laneLine(features, 'A', 'laneEdgeRight').geometry.coordinates as LngLat[];
      const bLeft = laneLine(features, 'B', 'laneEdgeLeft').geometry.coordinates as LngLat[];
      const bRight = laneLine(features, 'B', 'laneEdgeRight').geometry.coordinates as LngLat[];

      const failures: string[] = [];
      if (selfCrosses(aLeft)) failures.push('A.left self');
      if (selfCrosses(aRight)) failures.push('A.right self');
      if (selfCrosses(bLeft)) failures.push('B.left self');
      if (selfCrosses(bRight)) failures.push('B.right self');
      if (pairCrosses(aLeft, bLeft)) failures.push('A.left × B.left');
      if (pairCrosses(aRight, bRight)) failures.push('A.right × B.right');
      expect(failures).toEqual([]);
    });
  }
});
