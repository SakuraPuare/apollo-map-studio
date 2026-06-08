import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapEntity } from '@/types/entities';
import type { WorkerResponse } from '../protocol';
import { SpatialWorkerBridge } from '../spatialBridge';

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;

  constructor(
    public readonly url: URL,
    public readonly options?: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(data: WorkerResponse): void {
    this.onmessage?.({ data } as MessageEvent<WorkerResponse>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function installFakeWorker(): void {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
}

function worker(): FakeWorker {
  const instance = FakeWorker.instances.at(-1);
  if (!instance) throw new Error('expected SpatialWorkerBridge to create a Worker');
  return instance;
}

function entity(id: string): MapEntity {
  return { id, entityType: 'lane' } as MapEntity;
}

async function flushChunkedPosts(expectedCount: number): Promise<void> {
  for (let i = 0; i < 12 && worker().posted.length < expectedCount; i += 1) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);
  }
}

beforeEach(() => {
  installFakeWorker();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SpatialWorkerBridge', () => {
  it('posts requests with correlated ids and resolves out-of-order responses correctly', async () => {
    const bridge = new SpatialWorkerBridge();
    const first = bridge.send<Extract<WorkerResponse, { type: 'HIT_RESULT' }>>({
      type: 'HIT_TEST',
      point: [0, 0],
      radius: 1,
    });
    const second = bridge.send<Extract<WorkerResponse, { type: 'HIT_RESULT' }>>({
      type: 'HIT_TEST',
      point: [10, 10],
      radius: 2,
    });

    expect(worker().options).toEqual({ type: 'module' });
    expect(worker().posted).toEqual([
      { type: 'HIT_TEST', point: [0, 0], radius: 1, requestId: 'req_1' },
      { type: 'HIT_TEST', point: [10, 10], radius: 2, requestId: 'req_2' },
    ]);

    worker().respond({
      type: 'HIT_RESULT',
      requestId: 'req_2',
      hits: [{ id: 'second', entityType: 'lane', distance: 2 }],
    });
    worker().respond({
      type: 'HIT_RESULT',
      requestId: 'req_1',
      hits: [{ id: 'first', entityType: 'lane', distance: 1 }],
    });

    await expect(first).resolves.toMatchObject({ hits: [{ id: 'first' }] });
    await expect(second).resolves.toMatchObject({ hits: [{ id: 'second' }] });
  });

  it('rejects timed-out requests and ignores later responses for the expired id', async () => {
    vi.useFakeTimers();
    const bridge = new SpatialWorkerBridge();
    const pending = bridge.send({ type: 'HIT_TEST', point: [0, 0], radius: 1 }, 25);
    const rejected = expect(pending).rejects.toThrow('Worker request req_1 timed out after 25ms');

    await vi.advanceTimersByTimeAsync(25);
    await rejected;

    expect(() => {
      worker().respond({ type: 'HIT_RESULT', requestId: 'req_1', hits: [] });
    }).not.toThrow();
  });

  it('terminates the worker, rejects pending work, and rejects sends after dispose', async () => {
    const bridge = new SpatialWorkerBridge();
    const first = bridge.send({ type: 'HIT_TEST', point: [0, 0], radius: 1 });
    const second = bridge.send({ type: 'HIT_TEST', point: [1, 1], radius: 2 });
    const firstRejected = expect(first).rejects.toThrow('Worker terminated');
    const secondRejected = expect(second).rejects.toThrow('Worker terminated');

    bridge.dispose();

    await Promise.all([firstRejected, secondRejected]);
    expect(worker().terminated).toBe(true);
    expect(() => {
      worker().respond({ type: 'HIT_RESULT', requestId: 'req_1', hits: [] });
    }).not.toThrow();
    await expect(bridge.send({ type: 'HIT_TEST', point: [2, 2], radius: 3 })).rejects.toThrow(
      'Worker disposed',
    );
  });

  it('rejects all pending requests when the worker reports an error', async () => {
    const bridge = new SpatialWorkerBridge();
    const first = bridge.send({ type: 'HIT_TEST', point: [0, 0], radius: 1 });
    const second = bridge.send({ type: 'HIT_TEST', point: [1, 1], radius: 2 });
    const firstRejected = expect(first).rejects.toThrow('Worker error: boom');
    const secondRejected = expect(second).rejects.toThrow('Worker error: boom');

    worker().fail('boom');

    await Promise.all([firstRejected, secondRejected]);
    expect(() => {
      worker().respond({ type: 'HIT_RESULT', requestId: 'req_1', hits: [] });
    }).not.toThrow();
  });

  it('posts large SYNC requests as ordered chunks with a final finish message', async () => {
    vi.useFakeTimers();
    const bridge = new SpatialWorkerBridge();
    const entities = Array.from({ length: 4_001 }, (_, index) => entity(`lane_${index}`));
    const pending = bridge.send<Extract<WorkerResponse, { type: 'COLD_READY' }>>(
      { type: 'SYNC', entities, excludeId: 'lane_excluded' },
      1_000,
    );

    expect(worker().posted).toEqual([
      {
        type: 'SYNC_BEGIN',
        requestId: 'req_1',
        total: 4_001,
        excludeId: 'lane_excluded',
      },
    ]);

    await flushChunkedPosts(5);

    expect(worker().posted).toHaveLength(5);
    expect(worker().posted[1]).toMatchObject({
      type: 'SYNC_CHUNK',
      requestId: 'req_1',
      offset: 0,
      total: 4_001,
    });
    expect(worker().posted[2]).toMatchObject({
      type: 'SYNC_CHUNK',
      requestId: 'req_1',
      offset: 2_000,
      total: 4_001,
    });
    expect(worker().posted[3]).toMatchObject({
      type: 'SYNC_CHUNK',
      requestId: 'req_1',
      offset: 4_000,
      total: 4_001,
    });
    expect(worker().posted[4]).toEqual({ type: 'SYNC_FINISH', requestId: 'req_1' });
    expect((worker().posted[1] as { entities: MapEntity[] }).entities).toEqual(
      entities.slice(0, 2_000),
    );
    expect((worker().posted[2] as { entities: MapEntity[] }).entities).toEqual(
      entities.slice(2_000, 4_000),
    );
    expect((worker().posted[3] as { entities: MapEntity[] }).entities).toEqual(
      entities.slice(4_000),
    );

    worker().respond({ type: 'COLD_READY', requestId: 'req_1', groups: [] });
    await expect(pending).resolves.toMatchObject({ type: 'COLD_READY', groups: [] });
  });

  it('stops posting stale chunked SYNC messages after a newer state request', async () => {
    vi.useFakeTimers();
    const bridge = new SpatialWorkerBridge();
    const entities = Array.from({ length: 4_001 }, (_, index) => entity(`lane_${index}`));
    const stale = bridge.send<Extract<WorkerResponse, { type: 'COLD_READY' }>>(
      { type: 'SYNC', entities },
      1_000,
    );
    const staleRejected = expect(stale).rejects.toThrow('Worker request req_1 superseded');

    const current = bridge.send<Extract<WorkerResponse, { type: 'COLD_DELTA' }>>({
      type: 'INCREMENTAL',
      added: [],
      removed: [],
      updated: [entity('lane_new')],
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);

    expect(worker().posted).toHaveLength(2);
    expect(worker().posted[0]).toMatchObject({ type: 'SYNC_BEGIN', requestId: 'req_1' });
    expect(worker().posted[1]).toMatchObject({ type: 'INCREMENTAL', requestId: 'req_2' });
    expect(worker().posted).not.toContainEqual({ type: 'SYNC_FINISH', requestId: 'req_1' });
    await staleRejected;

    worker().respond({ type: 'COLD_DELTA', requestId: 'req_2', changed: [], removed: [] });
    await expect(current).resolves.toMatchObject({ type: 'COLD_DELTA' });
  });

  it('accumulates COLD_GROUPS_CHUNK messages and merges them into the final COLD_READY', async () => {
    const bridge = new SpatialWorkerBridge();
    const pending = bridge.send<Extract<WorkerResponse, { type: 'COLD_READY' }>>({
      type: 'SYNC',
      entities: [],
    });
    let settled = false;
    pending.then(() => {
      settled = true;
    });

    worker().respond({
      type: 'COLD_GROUPS_CHUNK',
      requestId: 'req_1',
      offset: 2,
      total: 3,
      groups: [{ id: 'lane_c', features: [] }],
    });
    worker().respond({
      type: 'COLD_GROUPS_CHUNK',
      requestId: 'req_1',
      offset: 0,
      total: 3,
      groups: [
        { id: 'lane_a', features: [] },
        { id: 'lane_b', features: [] },
      ],
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    worker().respond({
      type: 'COLD_READY',
      requestId: 'req_1',
      groups: [{ id: 'final_payload_replaced', features: [] }],
      featureCollection: { type: 'FeatureCollection', features: [] },
    });

    await expect(pending).resolves.toEqual({
      type: 'COLD_READY',
      requestId: 'req_1',
      groups: [
        { id: 'lane_a', features: [] },
        { id: 'lane_b', features: [] },
        { id: 'lane_c', features: [] },
      ],
      featureCollection: { type: 'FeatureCollection', features: [] },
    });
  });
});
