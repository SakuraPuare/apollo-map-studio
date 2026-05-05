import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { deleteVertex } from '@/components/map/entityMutations';
import { useMapStore } from '@/store/mapStore';
import { isEntityTypeLocked, useUIStore } from '@/store/uiStore';

export function handleMapKeyDown(
  actorRef: ActorRefFrom<typeof editorMachine>,
  e: KeyboardEvent,
  clearCenterGrabOffset: () => void,
) {
  if (e.key === 'Escape') {
    clearCenterGrabOffset();
    if (useUIStore.getState().connectMode.active) {
      useUIStore.getState().exitConnectMode();
    }
    actorRef.send({ type: 'CANCEL' });
  }

  if (e.key === 'Enter') actorRef.send({ type: 'CONFIRM' });
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;

  const snap = actorRef.getSnapshot();
  if (snap.value !== 'selected' || !snap.context.selectedEntityId) return;

  const id = snap.context.selectedEntityId;
  const store = useMapStore.getState();
  const entity = store.entities.get(id);
  if (!entity) return;
  if (isEntityTypeLocked(useUIStore.getState().layerStates, entity.entityType)) return;

  const idx = snap.context.dragPointIndex;
  const pType = snap.context.dragPointType;

  if (pType === 'vertex' && idx >= 0) {
    const result = deleteVertex(entity, idx);
    if (result) {
      store.updateEntity(id, result);
      actorRef.send({ type: 'SELECT_ENTITY', id });
      return;
    }
  }

  actorRef.send({ type: 'DELETE_ENTITY' });
  store.removeEntity(id);
}
