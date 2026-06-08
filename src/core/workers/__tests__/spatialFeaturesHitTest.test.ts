import { describe, expect, it } from 'vitest';
import { createApolloEntity } from '@/core/geometry/apolloCompile';
import type { LngLat } from '@/core/geometry/interpolate';
import type { AreaEntity, LaneEntity, SignalEntity } from '@/types/apollo';
import type { MapEntity } from '@/types/entities';
import { createSpatialState, type SpatialState } from '../spatialState';
import { groupFeaturesByEntity, featureGroupsForState } from '../spatialFeatures';
import { hitTest } from '../spatialHitTest';

function lineFeature(
  id: string | number | undefined,
  entityId: unknown,
  fallbackIndex: number,
): GeoJSON.Feature {
  return {
    type: 'Feature',
    id,
    properties: { id: entityId, role: 'shape', fallbackIndex },
    geometry: {
      type: 'LineString',
      coordinates: [
        [fallbackIndex, 0],
        [fallbackIndex + 1, 0],
      ],
    },
  };
}

function makeArea(id: string): AreaEntity {
  return {
    ...(createApolloEntity(
      'area',
      'drawPolygon',
      [
        [116.0, 30.0],
        [116.002, 30.0],
        [116.002, 30.002],
        [116.0, 30.002],
      ],
      [],
    ) as AreaEntity),
    id,
  };
}

function makeLane(id: string, points: LngLat[]): LaneEntity {
  return {
    ...(createApolloEntity('lane', 'drawPolyline', points, []) as LaneEntity),
    id,
  };
}

function makeSignal(id: string, points: LngLat[]): SignalEntity {
  return {
    ...(createApolloEntity('signal', 'drawPolyline', points, []) as SignalEntity),
    id,
  };
}

function hitState(entities: MapEntity[]): SpatialState {
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const state = createSpatialState();
  state.entityMap = entityMap;
  Object.assign(state.tree, {
    search: () =>
      entities.map((entity) => ({
        id: entity.id,
        entityType: entity.entityType,
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
      })),
  });
  return state;
}

function hitStateWithSearchResults(
  entities: MapEntity[],
  results: Array<{
    id: string;
    entityType: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>,
): SpatialState {
  const state = createSpatialState();
  state.entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  Object.assign(state.tree, {
    search: () => results,
  });
  return state;
}

function featureOnlyState(
  featureCache: SpatialState['featureCache'],
  decorationCache: SpatialState['decorationCache'],
): SpatialState {
  const state = createSpatialState();
  state.featureCache = featureCache;
  state.decorationCache = decorationCache;
  return state;
}

describe('spatialFeatures helpers', () => {
  it('groups unkeyed features and rewrites duplicate feature ids within each group', () => {
    const features = [
      lineFeature('duplicate', 'lane_a', 0),
      lineFeature('duplicate', 'lane_a', 1),
      lineFeature(undefined, null, 2),
      lineFeature(undefined, undefined, 3),
    ];

    const groups = groupFeaturesByEntity(features);

    expect(groups.map((group) => group.id)).toEqual(['lane_a', '__unkeyed']);
    expect(groups[0]!.features.map((feature) => feature.id)).toEqual(['duplicate', 'duplicate:1']);
    expect(groups[1]!.features.map((feature) => feature.id)).toEqual([
      'feature:feature:0',
      'feature:feature:1',
    ]);
  });

  it('keeps cached lane decorations with feature groups and honors excludeId', () => {
    const base = lineFeature('lane_a:shape', 'lane_a', 0);
    const decoration = lineFeature('lane_a:left', 'lane_a', 1);
    const excluded = lineFeature('lane_b:shape', 'lane_b', 2);
    const state = featureOnlyState(
      new Map([
        ['lane_a', [base]],
        ['lane_b', [excluded]],
      ]),
      new Map([['lane_a', [decoration]]]),
    );

    const groups = featureGroupsForState(state, 'lane_b');

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 'lane_a' });
    expect(groups[0]!.features).toEqual([base, decoration]);
  });
});

describe('spatialHitTest', () => {
  it('orders hits by worker pick tier before distance', () => {
    const area = makeArea('area_1');
    const lane = makeLane('lane_1', [
      [116.0005, 30.001],
      [116.0015, 30.001],
    ]);
    const signal = makeSignal('signal_1', [
      [116.0005, 30.001],
      [116.0015, 30.001],
    ]);

    const hits = hitTest(hitState([area, lane, signal]), [116.001, 30.001], 0.01);

    expect(hits.map((hit) => hit.id)).toEqual(['signal_1', 'lane_1', 'area_1']);
    expect(hits.find((hit) => hit.id === 'area_1')!.distance).toBe(0);
  });

  it('uses absolute radius values and skips tree candidates missing from entityMap', () => {
    const lane = makeLane('lane_1', [
      [116.0005, 30.0],
      [116.0015, 30.0],
    ]);
    const state = hitStateWithSearchResults(
      [lane],
      [
        { id: 'missing', entityType: 'lane', minX: 0, minY: 0, maxX: 0, maxY: 0 },
        { id: 'lane_1', entityType: 'lane', minX: 0, minY: 0, maxX: 0, maxY: 0 },
      ],
    );

    const hits = hitTest(state, [116.001, 30.0], -0.001);

    expect(hits).toEqual([{ id: 'lane_1', entityType: 'lane', distance: 0 }]);
  });
});
