/**
 * Overlap pipeline — Apollo 官方风格的语义化 id 派生.
 *
 * 底层逻辑：Apollo HD Map 真实数据里 overlap id 是参与实体 id 的拼接，
 * 例如 `overlap_signal_0_lane_35`。本编辑器派生 id 严格对齐这一约定，
 * 只是把参与者按字典序排序保证「同一组参与者 → 同一个 id」（顺序无关），
 * 给 reconcile set-diff 用。
 *
 * 格式：`overlap_<sortedIds.join('_')>`
 *   例：sorted([CW_2, lane_3]) → "overlap_CW_2_lane_3"
 *       sorted([lane_3, signal_0]) → "overlap_lane_3_signal_0"
 *
 * isDerivedOverlapId：所有 `overlap_*` 都视为派生（包括从 Apollo 导入的 ——
 * 它们本来就是同一种语义形式）。第一次 reconcile 会把 Apollo 数据的原始
 * id 顺序统一成本地的字典序顺序（破坏性重构，不保留旧 id 形式）。
 */

/** 计算 overlap id. participantIds 在内部排序 → 顺序无关. */
export function makeOverlapId(participantIds: readonly string[]): string {
  const sorted = [...participantIds].sort();
  return `overlap_${sorted.join('_')}`;
}

/** 判断 id 是否由本派生体系产出（任何 `overlap_*` 都算 derived）. */
export function isDerivedOverlapId(id: string): boolean {
  return id.startsWith('overlap_');
}
