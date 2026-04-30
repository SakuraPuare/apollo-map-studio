/// <reference lib="webworker" />
/**
 * Overlap full-mode reconcile worker.
 *
 * 抓手：导入完成 / 用户手动 "Recompute overlaps" / 导出前的全量重建走 worker，
 * 主线程不被 5w 量纲下 ~450ms 的 reconcile 阻塞。增量编辑路径仍然走主线程
 * （单次 < 6ms，worker 通信开销不划算）。
 *
 * 协议：单一 request/response 对，不复用 spatial.worker 的 protocol —— overlap
 * 与空间索引的责任分离，避免一个 worker 文件背两个职责。
 */
import type { MapEntity } from '@/types/entities';
import { reconcileOverlaps } from '@/core/elements/overlap/reconcile';
import { resetSharedSpatialIndex } from '@/core/elements/overlap/spatialIndex';
import { clearLaneArcLengthCache } from '@/core/elements/overlap/computeLaneS';

interface OverlapRequest {
  type: 'RECONCILE_FULL';
  requestId: string;
  entities: MapEntity[];
}

interface OverlapResponse {
  type: 'RECONCILE_RESULT';
  requestId: string;
  changes: Array<[string, MapEntity]>;
  removedOverlapIds: string[];
  stats: {
    pairsTested: number;
    pairsMatched: number;
    overlapsCreated: number;
    overlapsRemoved: number;
    durationMs: number;
  };
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<OverlapRequest>) => {
  const req = e.data;
  if (req.type !== 'RECONCILE_FULL') return;

  // worker 内部不复用主线程 singleton —— 它在另一个 V8 isolate
  resetSharedSpatialIndex();
  clearLaneArcLengthCache();

  const map = new Map<string, MapEntity>();
  for (const entity of req.entities) map.set(entity.id, entity);

  const patch = reconcileOverlaps(map, { mode: 'full' });
  const response: OverlapResponse = {
    type: 'RECONCILE_RESULT',
    requestId: req.requestId,
    changes: Array.from(patch.changes.entries()),
    removedOverlapIds: Array.from(patch.removedOverlapIds),
    stats: patch.stats,
  };
  self.postMessage(response);
};

export type { OverlapRequest, OverlapResponse };
