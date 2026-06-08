import { describe, expect, it, vi } from 'vitest';
import { createApolloEntity } from '@/core/geometry/apolloCompile';
import type { LngLat } from '@/core/geometry/interpolate';
import type { LaneEntity } from '@/types/apollo';
import type { WorkerResponse } from '../protocol';
import { handleRequest } from '../spatialRequests';
import { createSpatialState } from '../spatialState';

function makeLane(id: string, points: LngLat[]): LaneEntity {
  return {
    ...(createApolloEntity('lane', 'drawPolyline', points, []) as LaneEntity),
    id,
  };
}

function collectResponses() {
  const responses: WorkerResponse[] = [];
  return {
    responses,
    respond: vi.fn((response: WorkerResponse) => responses.push(response)),
  };
}

describe('spatialRequests handleRequest', () => {
  it('assembles chunked sync requests and responds on finish', () => {
    const state = createSpatialState();
    const { responses, respond } = collectResponses();
    const a = makeLane('a', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);
    const b = makeLane('b', [
      [116.001, 30.0],
      [116.002, 30.0],
    ]);

    handleRequest(state, { type: 'SYNC_BEGIN', requestId: 'sync_1', total: 2 }, respond);
    expect(respond).not.toHaveBeenCalled();
    expect(state.pendingSyncs.has('sync_1')).toBe(true);

    handleRequest(
      state,
      { type: 'SYNC_CHUNK', requestId: 'sync_1', entities: [a], offset: 0, total: 2 },
      respond,
    );
    handleRequest(
      state,
      { type: 'SYNC_CHUNK', requestId: 'sync_1', entities: [b], offset: 1, total: 2 },
      respond,
    );
    handleRequest(state, { type: 'SYNC_FINISH', requestId: 'sync_1' }, respond);

    expect(state.pendingSyncs.has('sync_1')).toBe(false);
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ type: 'COLD_READY', requestId: 'sync_1' });
    if (responses[0]?.type !== 'COLD_READY') throw new Error('expected COLD_READY');
    expect(responses[0].groups.map((group) => group.id)).toEqual(['a', 'b']);
  });

  it('keeps chunked sync excludeId and filters the ready groups', () => {
    const state = createSpatialState();
    const { responses, respond } = collectResponses();
    const keep = makeLane('keep', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);
    const drop = makeLane('drop', [
      [116.002, 30.0],
      [116.003, 30.0],
    ]);

    handleRequest(
      state,
      { type: 'SYNC_BEGIN', requestId: 'sync_2', total: 2, excludeId: 'drop' },
      respond,
    );
    handleRequest(
      state,
      { type: 'SYNC_CHUNK', requestId: 'sync_2', entities: [keep, drop], offset: 0, total: 2 },
      respond,
    );
    handleRequest(state, { type: 'SYNC_FINISH', requestId: 'sync_2' }, respond);

    if (responses[0]?.type !== 'COLD_READY') throw new Error('expected COLD_READY');
    expect(responses[0].groups.map((group) => group.id)).toEqual(['keep']);
  });

  it('does not let a superseded chunked sync overwrite newer worker state', () => {
    const state = createSpatialState();
    const { responses, respond } = collectResponses();
    const stale = makeLane('stale', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);
    const current = makeLane('current', [
      [116.01, 30.01],
      [116.011, 30.01],
    ]);

    handleRequest(state, { type: 'SYNC_BEGIN', requestId: 'old_sync', total: 1 }, respond);
    handleRequest(
      state,
      { type: 'SYNC_CHUNK', requestId: 'old_sync', entities: [stale], offset: 0, total: 1 },
      respond,
    );
    handleRequest(state, { type: 'SYNC', requestId: 'new_sync', entities: [current] }, respond);
    handleRequest(state, { type: 'SYNC_FINISH', requestId: 'old_sync' }, respond);

    expect(state.entityMap.has('current')).toBe(true);
    expect(state.entityMap.has('stale')).toBe(false);
    expect(responses.map((response) => response.requestId)).toEqual(['new_sync', 'old_sync']);
    expect(responses[1]).toMatchObject({ type: 'COLD_READY', requestId: 'old_sync' });
  });

  it('throws for unknown chunk and finish request ids', () => {
    const state = createSpatialState();
    const { respond } = collectResponses();

    expect(() =>
      handleRequest(
        state,
        { type: 'SYNC_CHUNK', requestId: 'missing', entities: [], offset: 0, total: 0 },
        respond,
      ),
    ).toThrow('Unknown spatial SYNC request missing');
    expect(() =>
      handleRequest(state, { type: 'SYNC_FINISH', requestId: 'missing' }, respond),
    ).toThrow('Unknown spatial SYNC request missing');
  });

  it('throws when chunked sync finishes with a mismatched entity count', () => {
    const state = createSpatialState();
    const { respond } = collectResponses();
    const lane = makeLane('a', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);

    handleRequest(state, { type: 'SYNC_BEGIN', requestId: 'sync_3', total: 2 }, respond);
    handleRequest(
      state,
      { type: 'SYNC_CHUNK', requestId: 'sync_3', entities: [lane], offset: 0, total: 2 },
      respond,
    );

    expect(() =>
      handleRequest(state, { type: 'SYNC_FINISH', requestId: 'sync_3' }, respond),
    ).toThrow('Spatial SYNC received 1 entities; expected 2.');
  });

  it('returns hit-test responses through the direct request dispatcher', () => {
    const state = createSpatialState();
    const { responses, respond } = collectResponses();
    const lane = makeLane('hit', [
      [116.0, 30.0],
      [116.001, 30.0],
    ]);

    handleRequest(state, { type: 'SYNC', requestId: 'sync_4', entities: [lane] }, respond);
    handleRequest(
      state,
      { type: 'HIT_TEST', requestId: 'hit_1', point: [116.0005, 30.0], radius: 0.01 },
      respond,
    );

    const response = responses.at(-1);
    expect(response).toMatchObject({ type: 'HIT_RESULT', requestId: 'hit_1' });
    if (response?.type !== 'HIT_RESULT') throw new Error('expected HIT_RESULT');
    expect(response.hits[0]!.id).toBe('hit');
  });
});
