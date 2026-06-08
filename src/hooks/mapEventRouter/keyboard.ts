import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { deleteVertex } from '@/components/map/entityMutations';
import { useMapStore } from '@/store/mapStore';
import { isEntityTypeLocked, useUIStore } from '@/store/uiStore';
import { isTextEditingTarget } from '../textEditingTarget';

export function handleMapKeyDown(
  actorRef: ActorRefFrom<typeof editorMachine>,
  e: KeyboardEvent,
  clearCenterGrabOffset: () => void,
) {
  if (isTextEditingTarget(e.target)) return;

  if (e.key === 'Escape') {
    clearCenterGrabOffset();
    if (useUIStore.getState().connectMode.active) {
      useUIStore.getState().exitConnectMode();
    }
    actorRef.send({ type: 'CANCEL' });
  }

  if (e.key === 'Enter') actorRef.send({ type: 'CONFIRM' });
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;

  deleteSelectedEntity(actorRef);
}

export function deleteSelectedEntity(actorRef: ActorRefFrom<typeof editorMachine>): boolean {
  const snap = actorRef.getSnapshot();
  if (snap.value !== 'selected' || !snap.context.selectedEntityId) return false;

  const id = snap.context.selectedEntityId;
  const store = useMapStore.getState();
  const entity = store.entities.get(id);
  if (!entity) return false;
  if (isEntityTypeLocked(useUIStore.getState().layerStates, entity.entityType)) return false;

  const idx = snap.context.dragPointIndex;
  const pType = snap.context.dragPointType;

  if (pType === 'vertex' && idx >= 0) {
    const result = deleteVertex(entity, idx);
    if (result) {
      store.updateEntity(id, result);
      actorRef.send({ type: 'SELECT_ENTITY', id });
      return true;
    }
  }

  actorRef.send({ type: 'DELETE_ENTITY' });
  store.removeEntity(id);
  return true;
}
