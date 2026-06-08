import { describe, expect, it, vi } from 'vitest';
import { createApolloEntity } from '@/core/geometry/apolloCompile';
import type { LngLat } from '@/core/geometry/interpolate';
import type { LaneEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity, PolylineEntity } from '@/types/entities';
import type { EntityFeatureGroup, WorkerResponse } from '../protocol';
import { handleRequest } from '../spatialRequests';
import { createSpatialState, type SpatialState } from '../spatialState';

function geoPoint([x, y]: LngLat): GeoPoint {
  return { x, y };
}

function makeLane(id: string, points: LngLat[]): LaneEntity {
  return {
    ...(createApolloEntity('lane', 'drawPolyline', points, []) as LaneEntity),
    id,
  };
}

function makePolyline(id: string, points: LngLat[]): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: points.map(geoPoint),
  };
}

function makeParkingLot(id: string): MapEntity {
  return {
    id,
    entityType: 'parkingLot',
    polygon: {
      points: [
        { x: 116.01, y: 30.01 },
        { x: 116.02, y: 30.01 },
        { x: 116.02, y: 30.02 },
      ],
    },
    overlapIds: [],
  } as MapEntity;
}

function collectResponses() {
  const responses: WorkerResponse[] = [];
  return {
    responses,
    respond: vi.fn((response: WorkerResponse) => responses.push(response)),
  };
}

function syncState(state: SpatialState, entities: MapEntity[]) {
  const { responses, respond } = collectResponses();
  handleRequest(state, { type: 'SYNC', requestId: 'sync', entities }, respond);
  expect(responses[0]).toMatchObject({ type: 'COLD_READY', requestId: 'sync' });
}

function expectColdDelta(
  response: WorkerResponse | undefined,
): Extract<WorkerResponse, { type: 'COLD_DELTA' }> {
  if (response?.type !== 'COLD_DELTA') throw new Error('expected COLD_DELTA');
  return response;
}

function changedIds(groups: EntityFeatureGroup[]): string[] {
  return groups.map((group) => group.id);
}

const lane = () =>
  makeLane('lane_1', [
    [116.0, 30.0],
    [116.001, 30.0],
  ]);

describe('spatialRequests incremental non-lane edges', () => {
  it('reports removed non-lane ids without changed feature groups', () => {
    const state = createSpatialState();
    const shape = makePolyline('shape_1', [
      [116.01, 30.01],
      [116.02, 30.01],
    ]);
    syncState(state, [lane(), shape]);
    const { responses, respond } = collectResponses();

    handleRequest(
      state,
      {
        type: 'INCREMENTAL',
        requestId: 'remove_shape',
        added: [],
        removed: [shape.id],
        updated: [],
      },
      respond,
    );

    const delta = expectColdDelta(responses[0]);
    expect(delta.changed).toEqual([]);
    expect(delta.removed).toEqual([shape.id]);
    expect(state.entityMap.has(shape.id)).toBe(false);
  });

  it('returns updated non-lane feature groups without pulling lanes into changed', () => {
    const state = createSpatialState();
    const original = makePolyline('shape_1', [
      [116.01, 30.01],
      [116.02, 30.01],
    ]);
    const updated = makePolyline('shape_1', [
      [116.02, 30.02],
      [116.03, 30.02],
    ]);
    syncState(state, [lane(), original]);
    const { responses, respond } = collectResponses();

    handleRequest(
      state,
      {
        type: 'INCREMENTAL',
        requestId: 'update_shape',
        added: [],
        removed: [],
        updated: [updated],
      },
      respond,
    );

    const delta = expectColdDelta(responses[0]);
    expect(changedIds(delta.changed)).toEqual([updated.id]);
    expect(delta.removed).toEqual([]);
    expect(delta.changed[0]!.features).toHaveLength(1);
    expect(delta.changed[0]!.features[0]).toMatchObject({
      properties: { id: updated.id, entityType: 'polyline' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [116.02, 30.02],
          [116.03, 30.02],
        ],
      },
    });
  });

  it('returns an empty changed group when an updated entity now renders no cold features', () => {
    const state = createSpatialState();
    const original = makePolyline('shape_1', [
      [116.01, 30.01],
      [116.02, 30.01],
    ]);
    const updated = makeParkingLot('shape_1');
    syncState(state, [lane(), original]);
    expect(state.featureCache.get(original.id)).toHaveLength(1);
    const { responses, respond } = collectResponses();

    handleRequest(
      state,
      {
        type: 'INCREMENTAL',
        requestId: 'update_shape_empty',
        added: [],
        removed: [],
        updated: [updated],
      },
      respond,
    );

    const delta = expectColdDelta(responses[0]);
    expect(delta.changed).toEqual([{ id: updated.id, features: [] }]);
    expect(delta.removed).toEqual([]);
    expect(state.featureCache.get(updated.id)).toEqual([]);
  });

  it('returns added non-lane feature groups without pulling lanes into changed', () => {
    const state = createSpatialState();
    const added = makePolyline('shape_1', [
      [116.01, 30.01],
      [116.02, 30.01],
    ]);
    syncState(state, [lane()]);
    const { responses, respond } = collectResponses();

    handleRequest(
      state,
      {
        type: 'INCREMENTAL',
        requestId: 'add_shape',
        added: [added],
        removed: [],
        updated: [],
      },
      respond,
    );

    const delta = expectColdDelta(responses[0]);
    expect(changedIds(delta.changed)).toEqual([added.id]);
    expect(delta.removed).toEqual([]);
    expect(delta.changed[0]!.features[0]).toMatchObject({
      properties: { id: added.id, entityType: 'polyline' },
    });
  });

  it('rebuilds lane decorations when an incremental request has no affected lanes', () => {
    const state = createSpatialState();
    const original = makePolyline('shape_1', [
      [116.01, 30.01],
      [116.02, 30.01],
    ]);
    const updated = makePolyline('shape_1', [
      [116.02, 30.02],
      [116.03, 30.02],
    ]);
    syncState(state, [lane(), original]);
    expect(state.decorationCache.get('lane_1')?.length).toBeGreaterThan(0);
    state.decorationCache.clear();
    const { responses, respond } = collectResponses();

    handleRequest(
      state,
      {
        type: 'INCREMENTAL',
        requestId: 'no_affected_lanes',
        added: [],
        removed: [],
        updated: [updated],
      },
      respond,
    );

    const delta = expectColdDelta(responses[0]);
    expect(changedIds(delta.changed)).toEqual([updated.id]);
    expect(state.decorationCache.get('lane_1')?.length).toBeGreaterThan(0);
  });
});
