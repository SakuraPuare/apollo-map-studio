import { describe, expect, it } from 'vitest';
import type { LaneEntity } from '@/types/apollo';
import { createApolloEntity, compileApolloFeatures } from '../apolloCompile';
import { applyLaneJunctions } from '../laneJunctions';
import {
  findLaneBoundaryPaintHit,
  paintLaneBoundaryTypeAtPoint,
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
  it('sets the boundary type from a clicked s-position without flattening existing segments', () => {
    const lane = setLaneBoundaryTypeAtS(makeLane(), 'left', 24, 'DOTTED_WHITE');
    const next = setLaneBoundaryTypeAtS(lane, 'left', 48, 'CURB');

    expect(next.leftBoundary.boundaryType).toEqual([
      { s: 0, types: ['SOLID_WHITE'] },
      { s: 24, types: ['DOTTED_WHITE'] },
      { s: 48, types: ['CURB'] },
    ]);
    expect(next.rightBoundary.boundaryType).toEqual([{ s: 0, types: ['SOLID_YELLOW'] }]);
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
    expect(result!.lane.leftBoundary.boundaryType).toHaveLength(2);
    expect(result!.lane.leftBoundary.boundaryType[1]!.types).toEqual(['CURB']);
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
});
