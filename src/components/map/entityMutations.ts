import type { DragPointType } from '@/types/editor';
import type { ApolloEntity } from '@/types/apollo';
import type { BezierEntity, MapEntity } from '@/types/entities';
import type { LngLat } from '@/core/geometry/interpolate';
import { applyDerive } from '@/core/elements/derive';
import {
  applyApolloDrag,
  deleteApolloEntityVertex,
  getApolloDragCenter,
  toggleSmoothApollo,
} from './entityMutations/apollo';
import {
  applyDrawingDrag,
  deleteDrawingVertex,
  getDrawingDragCenter,
  isDrawingEntity,
  toggleSmooth,
} from './entityMutations/drawing';

export { toggleSmooth, toggleSmoothApollo };

/**
 * 获取实体的几何中心（lng/lat）。
 *
 * 用于 center 拖拽（拖动整个元素）：mousedown 时计算
 * `cursor - center` 偏移并锁定，整段拖拽都按这个偏移修正鼠标位置。
 */
export function getDragCenter(entity: MapEntity): LngLat | null {
  if (isDrawingEntity(entity)) return getDrawingDragCenter(entity);
  return getApolloDragCenter(entity as ApolloEntity);
}

/**
 * 删除实体的第 index 个顶点。
 * 返回新实体，如果删除后顶点不足最小数量则返回 null（表示应删除整个实体）。
 */
export function deleteVertex(entity: MapEntity, index: number): MapEntity | null {
  if (isDrawingEntity(entity)) return deleteDrawingVertex(entity, index);
  return deleteApolloEntityVertex(entity as ApolloEntity, index);
}

/**
 * 对实体应用拖拽偏移，返回新实体（不修改原实体）。
 *
 * 公开函数会再走一次 `applyDerive(editGeometry)`，覆盖那些不经
 * `entityOps` setter 直接构造 entity 的源信息分支，保证派生字段在拖动后同步。
 */
export function applyDrag(
  entity: MapEntity,
  index: number,
  pointType: DragPointType,
  newPoint: LngLat,
  altKey = false,
): MapEntity {
  const next = isDrawingEntity(entity)
    ? applyDrawingDrag(entity, index, pointType, newPoint, altKey)
    : applyApolloDrag(entity as ApolloEntity, index, pointType, newPoint, altKey);

  if (next === entity) return entity;
  return applyDerive(next, { cause: 'editGeometry', prev: entity });
}

export type { BezierEntity };
