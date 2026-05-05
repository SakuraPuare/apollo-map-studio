import {
  duplicateEntity,
  canDuplicateEntity,
  DEFAULT_DUPLICATE_OFFSET_METERS,
} from '@/lib/entityOps';
import type { MapEntity } from '@/types/entities';

let clipboardEntity: MapEntity | null = null;
let pasteCount = 0;

export function clearSelectionClipboard(): void {
  clipboardEntity = null;
  pasteCount = 0;
}

export function hasSelectionClipboard(): boolean {
  return clipboardEntity !== null;
}

export function copySelectionToClipboard(entity: MapEntity | null): boolean {
  if (!entity || !canDuplicateEntity(entity)) return false;
  clipboardEntity = structuredClone(entity) as MapEntity;
  pasteCount = 0;
  return true;
}

export function pasteSelectionFromClipboard(
  entities: ReadonlyMap<string, MapEntity>,
): MapEntity | null {
  if (!clipboardEntity) return null;
  const offsetMeters = DEFAULT_DUPLICATE_OFFSET_METERS * (pasteCount + 1);
  const pasted = duplicateEntity(clipboardEntity, entities, { offsetMeters });
  if (!pasted) return null;
  pasteCount++;
  return pasted;
}
