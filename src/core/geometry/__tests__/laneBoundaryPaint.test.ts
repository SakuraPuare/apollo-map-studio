import { describe, expect, it } from 'vitest';
import type { LaneEntity } from '@/types/apollo';
import { createApolloEntity, compileApolloFeatures } from '../apolloCompile';
import { applyLaneJunctions } from '../laneJunctions';
import {
  findLaneBoundaryPaintHit,
  paintLaneBoundaryTypeAtPoint,
  setLaneBoundaryType,
  setLaneBoundaryTypeAtS,
} from '../laneBoundaryPaint';

function makeLane(): LaneEntity {
  return {
    ...(createApolloEntity(
      'lane',
      'drawPolyline',
      [
        [116, 30],
        [116.001, 30],
      ],
      [],
      { laneHalfWidth: 3 },
    ) as LaneEntity),
    id: 'laneA',
    length: 96.406,
    leftBoundary: {
      curve: { segments: [] },
      length: 96.406,
      boundaryType: [{ s: 0, types: ['SOLID_WHITE'] }],
    },
    rightBoundary: {
      curve: { segments: [] },
      length: 96.406,
      boundaryType: [{ s: 0, types: ['SOLID_YELLOW'] }],
    },
  };
}

function curve(points: Array<[number, number]>): LaneEntity['centralCurve'] {
  return {
    segments: [
      {
        lineSegment: { points: points.map(([x, y]) => ({ x, y })) },
        s: 0,
        startPosition: { x: points[0]?.[0] ?? 0, y: points[0]?.[1] ?? 0 },
        heading: 0,
        length: 0,
      },
    ],
  };
}

function leftDecorTypes(lane: LaneEntity): unknown[] {
  const features = applyLaneJunctions(compileApolloFeatures(lane), [lane]);
  return features
    .filter(
      (feature) =>
        feature.properties?.role === 'laneBoundaryDecor' &&
        feature.properties.boundarySide === 'left',
    )
    .map((feature) => feature.properties?.boundaryType);
}

describe('lane boundary paint', () => {
  it('preserves imported s-segment boundary entries when setting by s', () => {
    const lane = setLaneBoundaryTypeAtS(makeLane(), 'left', 24, 'DOTTED_WHITE');
    const next = setLaneBoundaryTypeAtS(lane, 'left', 48, 'CURB');

    expect(next.leftBoundary.boundaryType).toEqual([
      { s: 0, types: ['SOLID_WHITE'] },
      { s: 24, types: ['DOTTED_WHITE'] },
      { s: 48, types: ['CURB'] },
    ]);
    expect(next.rightBoundary.boundaryType).toEqual([{ s: 0, types: ['SOLID_YELLOW'] }]);
  });

  it('sets one boundary type for the whole lane side for editor brush edits', () => {
    const lane = setLaneBoundaryType(
      setLaneBoundaryTypeAtS(makeLane(), 'left', 24, 'DOTTED_WHITE'),
      'left',
      'CURB',
    );

    expect(lane.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['CURB'] }]);
    expect(lane.rightBoundary.boundaryType).toEqual([{ s: 0, types: ['SOLID_YELLOW'] }]);
  });

  it('finds the nearest left/right boundary and converts click position to s', () => {
    const lane = makeLane();
    const hit = findLaneBoundaryPaintHit([lane], [116.0005, 30.000027]);

    expect(hit?.laneId).toBe('laneA');
    expect(hit?.side).toBe('left');
    expect(hit?.s).toBeGreaterThan(40);
    expect(hit?.s).toBeLessThan(60);
  });

  it('paints at the nearest clicked boundary point', () => {
    const result = paintLaneBoundaryTypeAtPoint(makeLane(), [116.0005, 30.000027], 'CURB');

    expect(result).not.toBeNull();
    expect(result!.hit.side).toBe('left');
    expect(result!.lane.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['CURB'] }]);
  });

  it('paints the right boundary without changing the left boundary', () => {
    const result = paintLaneBoundaryTypeAtPoint(makeLane(), [116.0005, 29.999973], 'DOUBLE_YELLOW');

    expect(result).not.toBeNull();
    expect(result!.hit.side).toBe('right');
    expect(result!.lane.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['SOLID_WHITE'] }]);
    expect(result!.lane.rightBoundary.boundaryType).toEqual([{ s: 0, types: ['DOUBLE_YELLOW'] }]);
  });

  it('renders one decor line per boundary type segment', () => {
    const lane = setLaneBoundaryTypeAtS(
      setLaneBoundaryTypeAtS(makeLane(), 'left', 24, 'DOTTED_WHITE'),
      'left',
      48,
      'CURB',
    );

    expect(leftDecorTypes(lane)).toEqual(['SOLID_WHITE', 'DOTTED_WHITE', 'CURB']);
  });

  it('uses explicit imported boundary curves before synthetic offsets', () => {
    const lane: LaneEntity = {
      ...makeLane(),
      leftBoundary: {
        ...makeLane().leftBoundary,
        curve: curve([
          [116, 30.0001],
          [116.001, 30.0001],
        ]),
      },
      rightBoundary: {
        ...makeLane().rightBoundary,
        curve: curve([
          [116, 29.9999],
          [116.001, 29.9999],
        ]),
      },
      leftSamples: [{ s: 0, width: 100 }],
      rightSamples: [{ s: 0, width: 100 }],
    };

    const hit = findLaneBoundaryPaintHit([lane], [116.0005, 29.9999], {
      maxDistanceMeters: 2,
    });

    expect(hit).toMatchObject({ laneId: 'laneA', side: 'right' });
    expect(hit!.distanceMeters).toBeLessThan(0.01);
  });

  it('falls back to the centerline when lane width samples are zero', () => {
    const lane: LaneEntity = {
      ...makeLane(),
      leftSamples: [{ s: 0, width: 0 }],
      rightSamples: [{ s: 0, width: 0 }],
    };

    const hit = findLaneBoundaryPaintHit([lane], [116.0005, 30], { maxDistanceMeters: 1 });

    expect(hit).toMatchObject({ laneId: 'laneA', side: 'left' });
    expect(hit!.distanceMeters).toBeLessThan(0.01);
  });

  it('returns null for lanes without drawable boundary geometry or distant clicks', () => {
    const lane: LaneEntity = {
      ...makeLane(),
      centralCurve: curve([[116, 30]]),
      leftBoundary: { ...makeLane().leftBoundary, curve: { segments: [] } },
      rightBoundary: { ...makeLane().rightBoundary, curve: { segments: [] } },
    };

    expect(findLaneBoundaryPaintHit([lane], [116, 30])).toBeNull();
    expect(findLaneBoundaryPaintHit([makeLane()], [117, 31], { maxDistanceMeters: 1 })).toBeNull();
    expect(
      paintLaneBoundaryTypeAtPoint(makeLane(), [117, 31], 'CURB', { maxDistanceMeters: 1 }),
    ).toBeNull();
  });

  it('normalizes empty, duplicate, exact, start, and clamped boundary type entries', () => {
    const empty = setLaneBoundaryTypeAtS(
      { ...makeLane(), leftBoundary: { ...makeLane().leftBoundary, boundaryType: [] } },
      'left',
      12,
      'CURB',
    );
    expect(empty.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['CURB'] }]);

    const duplicate = setLaneBoundaryTypeAtS(
      {
        ...makeLane(),
        leftBoundary: {
          ...makeLane().leftBoundary,
          boundaryType: [
            { s: 0, types: ['SOLID_WHITE'] },
            { s: 0.00001, types: ['DOTTED_WHITE'] },
            { s: 500, types: ['CURB'] },
          ],
        },
      },
      'left',
      0,
      'DOUBLE_YELLOW',
    );
    expect(duplicate.leftBoundary.boundaryType).toEqual([
      { s: 0, types: ['DOUBLE_YELLOW'] },
      { s: 96.406, types: ['CURB'] },
    ]);

    const exact = setLaneBoundaryTypeAtS(
      setLaneBoundaryTypeAtS(makeLane(), 'left', 24, 'DOTTED_WHITE'),
      'left',
      24,
      'CURB',
    );
    expect(exact.leftBoundary.boundaryType).toEqual([
      { s: 0, types: ['SOLID_WHITE'] },
      { s: 24, types: ['CURB'] },
    ]);
  });

  it('uses lane length when boundary length is absent and clamps inserted offsets', () => {
    const lane: LaneEntity = {
      ...makeLane(),
      length: 30,
      rightBoundary: {
        ...makeLane().rightBoundary,
        length: undefined,
        boundaryType: [{ types: ['SOLID_YELLOW'] }],
      },
    };

    const next = setLaneBoundaryTypeAtS(lane, 'right', 999, 'CURB');

    expect(next.rightBoundary.boundaryType).toEqual([
      { s: 0, types: ['SOLID_YELLOW'] },
      { s: 30, types: ['CURB'] },
    ]);
    expect(next.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['SOLID_WHITE'] }]);
  });

  it('collapses adjacent boundary entries that resolve to the same type', () => {
    const lane: LaneEntity = {
      ...makeLane(),
      rightBoundary: {
        ...makeLane().rightBoundary,
        boundaryType: [
          { s: 0, types: ['SOLID_YELLOW'] },
          { s: 20, types: ['DOTTED_YELLOW'] },
        ],
      },
    };

    const next = setLaneBoundaryTypeAtS(lane, 'right', 20, 'SOLID_YELLOW');

    expect(next.rightBoundary.boundaryType).toEqual([{ s: 0, types: ['SOLID_YELLOW'] }]);
    expect(next.leftBoundary.boundaryType).toEqual([{ s: 0, types: ['SOLID_WHITE'] }]);
  });
});
