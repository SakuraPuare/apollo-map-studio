/**
 * Overlap reconcile pipeline — internal types.
 *
 * 设计语境：
 *   - reconcile 是纯函数：(entities, mode) → patch
 *   - patch 由 store 一次性 apply，落到 zundo 单事务
 *   - mode = 'incremental' 走 dirty 闭包；'full' 全量重建（导入/导出/手动重算）
 */
import type { MapEntity } from '@/types/entities';

/** 经纬度 + 米空间 bbox（含 cosLat 修正后的米半径，便于 R-tree 查询） */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** R-tree 节点（rbush 兼容） */
export interface IndexNode extends BBox {
  id: string;
  entityType: MapEntity['entityType'];
}

/** reconcile 输入 */
export type ReconcileMode =
  { mode: 'incremental'; dirtyIds: ReadonlySet<string> } | { mode: 'full' };

/** reconcile 输出（store 直接 apply） */
export interface ReconcilePatch {
  /** 新增/更新的实体（含 OverlapEntity 与受影响实体的 overlapIds 修正） */
  changes: Map<string, MapEntity>;
  /** 待删除的 OverlapEntity id */
  removedOverlapIds: Set<string>;
  /** 调试/观测用 */
  stats: {
    pairsTested: number;
    pairsMatched: number;
    overlapsCreated: number;
    overlapsRemoved: number;
    durationMs: number;
  };
}
