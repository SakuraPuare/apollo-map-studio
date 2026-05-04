import type { ObjectOverlapInfo, OverlapEntity, RegionOverlapInfo } from '@/types/apollo';
import { REGION_OVERLAPS_OVERRIDE_PATH } from './overridePaths';

export function isRegionOverlapsPinned(e: OverlapEntity): boolean {
  const overrides = e._userOverrides;
  if (!overrides || overrides.length === 0) return false;
  return overrides.includes(REGION_OVERLAPS_OVERRIDE_PATH);
}

export function regionOverlapsEqual(
  a: readonly RegionOverlapInfo[],
  b: readonly RegionOverlapInfo[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.id !== y.id) return false;
    if (x.polygons.length !== y.polygons.length) return false;
    for (let j = 0; j < x.polygons.length; j++) {
      const px = x.polygons[j]!.points;
      const py = y.polygons[j]!.points;
      if (px.length !== py.length) return false;
      for (let k = 0; k < px.length; k++) {
        if (px[k]!.x !== py[k]!.x || px[k]!.y !== py[k]!.y) return false;
      }
    }
  }
  return true;
}

export function objectsExactlyEqual(a: ObjectOverlapInfo[], b: ObjectOverlapInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.objectType !== y.objectType) return false;
    if (x.objectId !== y.objectId) return false;
    if (x.objectType === 'lane' && y.objectType === 'lane') {
      const li = x.laneOverlapInfo;
      const lj = y.laneOverlapInfo;
      if (li.startS !== lj.startS) return false;
      if (li.endS !== lj.endS) return false;
      if ((li.isMerge ?? false) !== (lj.isMerge ?? false)) return false;
      if ((li.regionOverlapId ?? '') !== (lj.regionOverlapId ?? '')) return false;
    }
  }
  return true;
}
