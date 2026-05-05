import { isEntityTypeInteractive, isEntityTypeVisible, type LayerStates } from '@/store/uiStore';

interface LayerBackedEntity {
  id: string;
  entityType: string;
}

export function filterVisibleEntities<T extends LayerBackedEntity>(
  entities: ReadonlyMap<string, T>,
  layerStates: LayerStates,
): Map<string, T> {
  const visible = new Map<string, T>();
  for (const [id, entity] of entities) {
    if (isEntityTypeVisible(layerStates, entity.entityType)) visible.set(id, entity);
  }
  return visible;
}

export function selectedInteractiveEntityId<T extends LayerBackedEntity>(
  selectedEntityId: string | null,
  entities: ReadonlyMap<string, T>,
  layerStates: LayerStates,
): string | null {
  if (!selectedEntityId) return null;
  const entity = entities.get(selectedEntityId);
  if (!entity) return null;
  return isEntityTypeInteractive(layerStates, entity.entityType) ? selectedEntityId : null;
}
