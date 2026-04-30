/**
 * Overlap pipeline — public API.
 *
 * 编辑器侧只对外暴露 reconcileOverlaps + 类型；内部 spatialIndex /
 * pairTable / intersect 等都是实现细节，不被外部依赖锁定。
 */
export { reconcileOverlaps, invalidateLaneCaches } from './reconcile';
export {
  SpatialIndex,
  bboxForEntity,
  getSharedSpatialIndex,
  resetSharedSpatialIndex,
} from './spatialIndex';
export { makeOverlapId, isDerivedOverlapId } from './overlapId';
export type { ReconcileMode, ReconcilePatch, BBox, IndexNode } from './types';
