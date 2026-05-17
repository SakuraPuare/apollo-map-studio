/**
 * Overlap pipeline — public API.
 *
 * 编辑器侧只对外暴露 reconcileOverlaps + 类型；内部 spatialIndex /
 * pairTable / intersect 等都是实现细节，不被外部依赖锁定。
 */
export { reconcileOverlaps, invalidateLaneCaches } from './reconcile';
export { bboxForEntity, getSharedSpatialIndex, resetSharedSpatialIndex } from './spatialIndex';
