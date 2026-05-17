/**
 * Overlap pipeline — RegionOverlapInfo 语义化 id 派生.
 *
 * 与 makeOverlapId 同构：参与者 id 按字典序拼接。slot 是「一对实体派生
 * 多个 region」的扩展位（默认 0 不显式带后缀；> 0 时附 `__<slot>` 段
 * 避开 underscore 歧义）。
 *
 * 格式：
 *   slot=0 → `region_<sortedIds.join('_')>`           例：region_CW_2_lane_3
 *   slot>0 → `region_<sortedIds.join('_')>__<slot>`   例：region_CW_2_lane_3__2
 *
 * 命名空间：`region_*` 与 `overlap_*` 互斥，便于一眼区分两类派生实体的引用.
 */

export function makeRegionId(participantIds: readonly string[], slot: number = 0): string {
  if (participantIds.length === 0) {
    throw new Error('[regionId] participantIds must be non-empty');
  }
  if (!Number.isInteger(slot) || slot < 0) {
    throw new Error('[regionId] slot must be a non-negative integer');
  }
  const sorted = Array.from(new Set(participantIds)).toSorted();
  const base = `region_${sorted.join('_')}`;
  return slot === 0 ? base : `${base}__${slot}`;
}

/** 判断 id 是否由 makeRegionId 派生. */
export function isDerivedRegionId(id: string): boolean {
  return id.startsWith('region_');
}
