/**
 * Overlap worker — 主线程 bridge.
 *
 * 用法：
 *   const bridge = new OverlapWorkerBridge();
 *   const patch = await bridge.reconcileFull(entitiesMap);
 *   for (const id of patch.removedOverlapIds) entities.delete(id);
 *   for (const [id, e] of patch.changes) entities.set(id, e);
 *   bridge.dispose();
 *
 * 主线程负责把 patch apply 到 store（保持 zundo 单事务语义）。worker 只负责
 * 计算，不持有 store 引用。
 */
import type { MapEntity } from '@/types/entities';
import type { ReconcilePatch } from '@/core/elements/overlap/types';
import type { OverlapRequest, OverlapResponse } from './overlap.worker';

const DEFAULT_TIMEOUT_MS = 30_000;

interface PendingEntry {
  resolve: (patch: ReconcilePatch) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type OverlapStats = OverlapResponse['stats'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOverlapStats(value: unknown): value is OverlapStats {
  if (!isRecord(value)) return false;
  return (
    typeof value.pairsTested === 'number' &&
    typeof value.pairsMatched === 'number' &&
    typeof value.overlapsCreated === 'number' &&
    typeof value.overlapsRemoved === 'number' &&
    typeof value.durationMs === 'number'
  );
}

function isMapEntityLike(value: unknown): value is MapEntity {
  return isRecord(value) && typeof value.id === 'string' && typeof value.entityType === 'string';
}

function isChangeEntry(value: unknown): value is [string, MapEntity] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    isMapEntityLike(value[1])
  );
}

function isOverlapResponse(value: unknown): value is OverlapResponse {
  if (!isRecord(value)) return false;
  const changes = value.changes;
  const removedOverlapIds = value.removedOverlapIds;
  return (
    value.type === 'RECONCILE_RESULT' &&
    typeof value.requestId === 'string' &&
    Array.isArray(changes) &&
    changes.every(isChangeEntry) &&
    Array.isArray(removedOverlapIds) &&
    removedOverlapIds.every((id) => typeof id === 'string') &&
    isOverlapStats(value.stats)
  );
}

export class OverlapWorkerBridge {
  private worker: Worker;
  private pending = new Map<string, PendingEntry>();
  private counter = 0;
  private disposed = false;

  constructor() {
    this.worker = new Worker(new URL('./overlap.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (e: MessageEvent<OverlapResponse>) => {
      const msg = e.data;
      if (!isOverlapResponse(msg)) return;
      const entry = this.pending.get(msg.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(msg.requestId);
      entry.resolve({
        changes: new Map(msg.changes),
        removedOverlapIds: new Set(msg.removedOverlapIds),
        stats: msg.stats,
      });
    };
    this.worker.onerror = (e) => {
      const err = new Error(`Overlap worker error: ${e.message}`);
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(err);
      }
      this.pending.clear();
    };
  }

  reconcileFull(
    entities: ReadonlyMap<string, MapEntity>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<ReconcilePatch> {
    if (this.disposed) return Promise.reject(new Error('Bridge disposed'));
    const requestId = `overlap_${++this.counter}`;
    return new Promise<ReconcilePatch>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Overlap reconcile timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      const req: OverlapRequest = {
        type: 'RECONCILE_FULL',
        requestId,
        entities: Array.from(entities.values()),
      };
      this.worker.postMessage(req);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('Bridge disposed'));
    }
    this.pending.clear();
    this.worker.terminate();
  }
}
