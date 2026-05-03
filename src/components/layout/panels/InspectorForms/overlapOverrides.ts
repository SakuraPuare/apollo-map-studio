import type { OverlapEntity } from '@/types/apollo';
import { REGION_OVERLAPS_OVERRIDE_PATH } from '@/core/elements/overlap/overridePaths';

export { REGION_OVERLAPS_OVERRIDE_PATH };

export function withOverride(entity: OverlapEntity, path: string): OverlapEntity {
  const arr = entity._userOverrides ?? [];
  if (arr.includes(path)) return entity;
  return { ...entity, _userOverrides: [...arr, path] };
}

export function clearOverride(entity: OverlapEntity, path: string): OverlapEntity {
  const arr = entity._userOverrides;
  if (!arr || !arr.includes(path)) return entity;
  const next = arr.filter((p) => p !== path);
  return { ...entity, _userOverrides: next.length > 0 ? next : undefined };
}
