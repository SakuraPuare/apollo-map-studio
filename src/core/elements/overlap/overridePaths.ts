/**
 * Overlap pin-path 编码 —— inspector 与 reconcile 之间唯一合同源.
 *
 * 底层逻辑：`OverlapEntity._userOverrides: string[]` 里每一项是「保护」的字段路径，
 * 后续 reconcile 不再用几何派生值覆盖。两端必须写出 / 读取完全一致的字符串才能闭环，
 * 历史上分别在 reconcile.ts 和 InspectorForms/overlap.tsx 内联硬编码 ——
 * 任意一端改格式就静默断链。本模块把所有路径生成和解析收口到一处.
 */

/** Lane × lane / lane × secondary 的 isMerge 钉位路径（按 objects 数组下标） */
export function laneIsMergeOverridePath(objectIndex: number): string {
  return `objects.${objectIndex}.laneOverlapInfo.isMerge`;
}

/** RegionOverlaps 整体钉位路径（同时锁住 ObjectOverlapInfo.regionOverlapId 引用） */
export const REGION_OVERLAPS_OVERRIDE_PATH = 'regionOverlaps' as const;

/** 判断某条 override 是不是 isMerge 类，并提取 objectIndex */
export function parseLaneIsMergeOverride(path: string): number | null {
  const m = /^objects\.(\d+)\.laneOverlapInfo\.isMerge$/.exec(path);
  if (!m) return null;
  const idx = Number(m[1]);
  return Number.isFinite(idx) ? idx : null;
}
