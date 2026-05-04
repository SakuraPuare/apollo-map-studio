import { bench, describe } from 'vitest';
import { buildFeatureCollection, featureGroupsForState } from '../spatialFeatures';
import { createSpatialState, syncEntities } from '../spatialState';
import { handleRequest } from '../spatialRequests';
import type { WorkerResponse } from '../protocol';
import { buildPerfEntities, makePerfLane } from '@/test/fixtures/perfEntities';

describe('spatial worker cold pipeline', () => {
  for (const scale of [
    { label: '1k', count: 1_000 },
    { label: '5k', count: 5_000 },
  ]) {
    const entities = buildPerfEntities(scale.count, 8);
    const syncedState = createSpatialState();
    syncEntities(syncedState, entities);
    buildFeatureCollection(syncedState);

    bench(`spatial ${scale.label} — syncEntities`, () => {
      const state = createSpatialState();
      syncEntities(state, entities);
    });

    bench(`spatial ${scale.label} — buildFeatureCollection full`, () => {
      buildFeatureCollection(syncedState);
    });

    bench(`spatial ${scale.label} — buildFeatureCollection incremental 1 lane`, () => {
      buildFeatureCollection(syncedState, null, new Set(['lane_0']));
    });

    bench(`spatial ${scale.label} — featureGroupsForState`, () => {
      featureGroupsForState(syncedState);
    });

    bench(`spatial ${scale.label} — HIT_TEST dense query`, () => {
      handleRequest(
        syncedState,
        { type: 'HIT_TEST', requestId: 'hit', point: [116.4002, 39.90001], radius: 0.01 },
        () => {},
      );
    });

    const updatedLane = makePerfLane('lane_0', 0, 8);
    bench(`spatial ${scale.label} — INCREMENTAL request 1 dirty lane`, () => {
      let response: WorkerResponse | null = null;
      handleRequest(
        syncedState,
        {
          type: 'INCREMENTAL',
          requestId: 'inc',
          added: [],
          updated: [updatedLane],
          removed: [],
        },
        (msg) => {
          response = msg;
        },
      );
      void response;
    });
  }
});
