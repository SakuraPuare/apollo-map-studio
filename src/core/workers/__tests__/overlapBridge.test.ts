import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapEntity } from '@/types/entities';
import type { OverlapResponse } from '../overlap.worker';
import { OverlapWorkerBridge } from '../overlapBridge';

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<OverlapResponse>) => void) | null = null;
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

  respond(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<OverlapResponse>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const stats = {
  pairsTested: 4,
  pairsMatched: 2,
  overlapsCreated: 1,
  overlapsRemoved: 1,
  durationMs: 8,
};

function installFakeWorker(): void {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
}

function worker(): FakeWorker {
  const instance = FakeWorker.instances.at(-1);
  if (!instance) throw new Error('expected OverlapWorkerBridge to create a Worker');
  return instance;
}

function lane(id: string): MapEntity {
  return { id, entityType: 'lane' } as MapEntity;
}

beforeEach(() => {
  installFakeWorker();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OverlapWorkerBridge', () => {
  it('posts full reconcile requests and resolves worker responses into map/set patches', async () => {
    const bridge = new OverlapWorkerBridge();
    const entity = lane('lane_1');
    const promise = bridge.reconcileFull(new Map([[entity.id, entity]]));

    expect(worker().options).toEqual({ type: 'module' });
    expect(worker().posted).toEqual([
      {
        type: 'RECONCILE_FULL',
        requestId: 'overlap_1',
        entities: [entity],
      },
    ]);

    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: [[entity.id, entity]],
      removedOverlapIds: ['overlap_old'],
      stats,
    });

    const patch = await promise;
    expect(patch.changes).toBeInstanceOf(Map);
    expect(patch.changes.get(entity.id)).toBe(entity);
    expect(patch.removedOverlapIds).toEqual(new Set(['overlap_old']));
    expect(patch.stats).toEqual(stats);
  });

  it('rejects all pending reconciles when the worker reports an error', async () => {
    const bridge = new OverlapWorkerBridge();
    const first = bridge.reconcileFull(new Map());
    const second = bridge.reconcileFull(new Map());
    const firstRejected = expect(first).rejects.toThrow('Overlap worker error: boom');
    const secondRejected = expect(second).rejects.toThrow('Overlap worker error: boom');

    worker().fail('boom');

    await Promise.all([firstRejected, secondRejected]);
  });

  it('rejects timed-out reconciles and ignores later responses for the expired request', async () => {
    vi.useFakeTimers();
    const bridge = new OverlapWorkerBridge();
    const promise = bridge.reconcileFull(new Map(), 25);
    const rejected = expect(promise).rejects.toThrow('Overlap reconcile timed out after 25ms');

    await vi.advanceTimersByTimeAsync(25);
    await rejected;

    expect(() => {
      worker().respond({
        type: 'RECONCILE_RESULT',
        requestId: 'overlap_1',
        changes: [],
        removedOverlapIds: [],
        stats,
      });
    }).not.toThrow();
  });

  it('ignores malformed messages without resolving the pending request', async () => {
    vi.useFakeTimers();
    const bridge = new OverlapWorkerBridge();
    const promise = bridge.reconcileFull(new Map(), 100);

    worker().respond(null);
    worker().respond({ type: 'RECONCILE_RESULT', requestId: 'overlap_1' });
    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: [[123, lane('bad')]],
      removedOverlapIds: [],
      stats,
    });
    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'unknown',
      changes: [],
      removedOverlapIds: [],
      stats,
    });

    await vi.advanceTimersByTimeAsync(50);

    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: [],
      removedOverlapIds: ['overlap_removed'],
      stats,
    });

    const patch = await promise;
    expect(patch.removedOverlapIds).toEqual(new Set(['overlap_removed']));
  });

  it('ignores responses with malformed change containers, removed ids, or stats', async () => {
    vi.useFakeTimers();
    const bridge = new OverlapWorkerBridge();
    const promise = bridge.reconcileFull(new Map(), 100);

    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: 'not changes',
      removedOverlapIds: [],
      stats,
    });
    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: [],
      removedOverlapIds: [123],
      stats,
    });
    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: [],
      removedOverlapIds: [],
      stats: { ...stats, durationMs: 'slow' },
    });

    await vi.advanceTimersByTimeAsync(50);

    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: [],
      removedOverlapIds: ['overlap_removed'],
      stats,
    });

    const patch = await promise;
    expect(patch.removedOverlapIds).toEqual(new Set(['overlap_removed']));
  });

  it('ignores change entries that omit the cloned MapEntity payload', async () => {
    vi.useFakeTimers();
    const bridge = new OverlapWorkerBridge();
    const promise = bridge.reconcileFull(new Map(), 100);

    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: [['overlap_missing_payload']],
      removedOverlapIds: [],
      stats,
    });

    await vi.advanceTimersByTimeAsync(50);

    worker().respond({
      type: 'RECONCILE_RESULT',
      requestId: 'overlap_1',
      changes: [],
      removedOverlapIds: ['overlap_removed'],
      stats,
    });

    const patch = await promise;
    expect(patch.changes.has('overlap_missing_payload')).toBe(false);
    expect(patch.removedOverlapIds).toEqual(new Set(['overlap_removed']));
  });

  it('terminates the worker, rejects pending requests, and rejects future requests after dispose', async () => {
    const bridge = new OverlapWorkerBridge();
    const pending = bridge.reconcileFull(new Map());
    const rejected = expect(pending).rejects.toThrow('Bridge disposed');

    bridge.dispose();

    await rejected;
    expect(worker().terminated).toBe(true);
    await expect(bridge.reconcileFull(new Map())).rejects.toThrow('Bridge disposed');
  });

  it('does not terminate more than once when dispose is repeated', () => {
    const bridge = new OverlapWorkerBridge();
    const terminate = vi.spyOn(worker(), 'terminate');

    bridge.dispose();
    bridge.dispose();

    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
