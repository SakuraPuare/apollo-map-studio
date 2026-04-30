/**
 * Overlap reconcile pipeline — internal types.
 *
 * 设计语境：
 *   - reconcile 是纯函数：(entities, mode) → patch
 *   - patch 由 store 一次性 apply，落到 zundo 单事务
 *   - mode = 'incremental' 走 dirty 闭包；'full' 全量重建（导入/导出/手动重算）
 */
import type { MapEntity } from '@/types/entities';
import type { OverlapEntity } from '@/types/apollo';

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
  | { mode: 'incremental'; dirtyIds: ReadonlySet<string> }
  | { mode: 'full' };

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

/** 一次几何相交命中（pair scanner → overlap entity 的中间产物） */
export interface PairHit {
  /** 排序后的稳定 id 列表（用于 dedup + overlapId 派生） */
  participantIds: readonly string[];
  /** 主实体（lane）的 id，用于 lane.start_s / end_s 计算 */
  primaryId: string;
  primaryType: 'lane';
  /** 次实体（junction/signal/...） */
  secondaryId: string;
  secondaryType: MapEntity['entityType'];
  /** 在 lane centerline 上的累计弧长区间（米）；非 lane×Other 配对为 null */
  laneInterval: { startS: number; endS: number } | null;
  /** lane×lane 时填充：是否合流端点 */
  isMerge: boolean;
  /** 来自 pairTable 的 emitter，便于生成 ObjectOverlapInfo[] */
  emitterId: string;
}

/** OverlapEntity 派生工具的最终产物 */
export interface ResolvedOverlap {
  entity: OverlapEntity;
  /** 涉及的实体 id（用于回写 entity.overlapIds） */
  participantIds: readonly string[];
}
