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
      const { requestId } = e.data;
      const entry = this.pending.get(requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(requestId);
      entry.resolve({
        changes: new Map(e.data.changes),
        removedOverlapIds: new Set(e.data.removedOverlapIds),
        stats: e.data.stats,
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
