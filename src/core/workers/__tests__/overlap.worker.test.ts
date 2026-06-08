import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReconcilePatch } from '@/core/elements/overlap/types';
import type { MapEntity } from '@/types/entities';
import type { OverlapRequest, OverlapResponse } from '../overlap.worker';

const mocks = vi.hoisted(() => ({
  clearLaneArcLengthCache: vi.fn(),
  reconcileOverlaps: vi.fn(),
  resetSharedSpatialIndex: vi.fn(),
}));

vi.mock('@/core/elements/overlap/reconcile', () => ({
  reconcileOverlaps: mocks.reconcileOverlaps,
}));

vi.mock('@/core/elements/overlap/spatialIndex', () => ({
  resetSharedSpatialIndex: mocks.resetSharedSpatialIndex,
}));

vi.mock('@/core/elements/overlap/computeLaneS', () => ({
  clearLaneArcLengthCache: mocks.clearLaneArcLengthCache,
}));

interface WorkerHandle {
  responses: OverlapResponse[];
  send(request: unknown): void;
}

const stats = {
  pairsTested: 3,
  pairsMatched: 1,
  overlapsCreated: 1,
  overlapsRemoved: 0,
  durationMs: 4,
};

async function loadWorker(): Promise<WorkerHandle> {
  vi.resetModules();
  const responses: OverlapResponse[] = [];
  const messageHandlers: Array<(e: MessageEvent<OverlapRequest>) => void> = [];
  const fakeSelf = {
    postMessage: vi.fn((response: OverlapResponse) => responses.push(response)),
    set onmessage(handler: (e: MessageEvent<OverlapRequest>) => void) {
      messageHandlers.push(handler);
    },
  };

  vi.stubGlobal('self', fakeSelf);
  await import('../overlap.worker');
  if (messageHandlers.length === 0) {
    throw new Error('overlap.worker did not register self.onmessage');
  }

  return {
    responses,
    send(request: unknown): void {
      messageHandlers[0]!(
        new MessageEvent('message', { data: request }) as MessageEvent<OverlapRequest>,
      );
    },
  };
}

function patchFor(entity: MapEntity): ReconcilePatch {
  return {
    changes: new Map([[entity.id, entity]]),
    removedOverlapIds: new Set(['overlap_removed']),
    stats,
  };
}

function lane(id: string): MapEntity {
  return { id, entityType: 'lane' } as MapEntity;
}

beforeEach(() => {
  mocks.clearLaneArcLengthCache.mockReset();
  mocks.reconcileOverlaps.mockReset();
  mocks.resetSharedSpatialIndex.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('overlap.worker', () => {
  it('ignores unsupported worker messages', async () => {
    const worker = await loadWorker();

    worker.send({
      type: 'IGNORED',
      requestId: 'ignored',
      entities: [],
    });

    expect(mocks.resetSharedSpatialIndex).not.toHaveBeenCalled();
    expect(mocks.clearLaneArcLengthCache).not.toHaveBeenCalled();
    expect(mocks.reconcileOverlaps).not.toHaveBeenCalled();
    expect(worker.responses).toEqual([]);
  });

  it('runs full reconcile with per-message cache resets and isolated entity maps', async () => {
    const worker = await loadWorker();
    const firstLane = lane('lane_1');
    const secondLane = lane('lane_2');
    const firstOverlap = { id: 'overlap_1', entityType: 'overlap' } as MapEntity;
    const secondOverlap = { id: 'overlap_2', entityType: 'overlap' } as MapEntity;

    mocks.reconcileOverlaps
      .mockReturnValueOnce(patchFor(firstOverlap))
      .mockReturnValueOnce(patchFor(secondOverlap));

    worker.send({ type: 'RECONCILE_FULL', requestId: 'r1', entities: [firstLane] });
    worker.send({ type: 'RECONCILE_FULL', requestId: 'r2', entities: [secondLane] });

    expect(mocks.resetSharedSpatialIndex).toHaveBeenCalledTimes(2);
    expect(mocks.clearLaneArcLengthCache).toHaveBeenCalledTimes(2);
    expect(mocks.reconcileOverlaps).toHaveBeenCalledTimes(2);

    const firstResetOrder = mocks.resetSharedSpatialIndex.mock.invocationCallOrder[0]!;
    const firstArcResetOrder = mocks.clearLaneArcLengthCache.mock.invocationCallOrder[0]!;
    const firstReconcileOrder = mocks.reconcileOverlaps.mock.invocationCallOrder[0]!;
    expect(firstResetOrder).toBeLessThan(firstArcResetOrder);
    expect(firstArcResetOrder).toBeLessThan(firstReconcileOrder);

    const firstMap = mocks.reconcileOverlaps.mock.calls[0]![0] as Map<string, MapEntity>;
    const secondMap = mocks.reconcileOverlaps.mock.calls[1]![0] as Map<string, MapEntity>;
    expect([...firstMap.keys()]).toEqual(['lane_1']);
    expect([...secondMap.keys()]).toEqual(['lane_2']);
    expect(mocks.reconcileOverlaps.mock.calls[0]![1]).toEqual({ mode: 'full' });
    expect(mocks.reconcileOverlaps.mock.calls[1]![1]).toEqual({ mode: 'full' });

    expect(worker.responses).toEqual([
      {
        type: 'RECONCILE_RESULT',
        requestId: 'r1',
        changes: [['overlap_1', firstOverlap]],
        removedOverlapIds: ['overlap_removed'],
        stats,
      },
      {
        type: 'RECONCILE_RESULT',
        requestId: 'r2',
        changes: [['overlap_2', secondOverlap]],
        removedOverlapIds: ['overlap_removed'],
        stats,
      },
    ]);
  });
});
