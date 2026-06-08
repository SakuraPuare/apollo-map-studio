import { useRef, useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { getDragCenter } from '@/components/map/entityMutations';
import { isPolygonEditEntity } from '@/lib/entityOps';
import { useMapStore } from '@/store/mapStore';
import { isEntityTypeInteractive, useUIStore } from '@/store/uiStore';
import { getSource } from '@/types/apollo';

type EditorSnapshot = ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>;

export function shouldDisableDragPan(
  currentState: string,
  isDraggingHandle: boolean,
  boundaryBrushActive = false,
  selectedLineActive = false,
): boolean {
  return (
    boundaryBrushActive ||
    selectedLineActive ||
    isDraggingHandle ||
    currentState === 'editingPoint' ||
    currentState === 'drawBezier'
  );
}

function isSelectedLineDragActive(snapshot: EditorSnapshot): boolean {
  if ((snapshot.value as string) !== 'selected') return false;

  const selectedEntityId = snapshot.context.selectedEntityId;
  if (!selectedEntityId) return false;

  const entity = useMapStore.getState().entities.get(selectedEntityId);
  if (!entity) return false;
  if (!isEntityTypeInteractive(useUIStore.getState().layerStates, entity.entityType)) return false;

  const source = getSource(entity);
  if (source?.drawTool === 'drawBezier' || source?.drawTool === 'drawArc') return false;
  return !isPolygonEditEntity(entity) && getDragCenter(entity) !== null;
}

export function shouldDisableDragPanForSnapshot(snapshot: EditorSnapshot): boolean {
  return shouldDisableDragPan(
    snapshot.value as string,
    snapshot.context.isDraggingHandle,
    useUIStore.getState().boundaryBrush.active,
    isSelectedLineDragActive(snapshot),
  );
}

export function installDragPanSync(
  map: Pick<maplibregl.Map, 'dragPan'>,
  actorRef: ActorRefFrom<typeof editorMachine>,
  dragPanDisabledRef: { current: boolean },
): () => void {
  const syncDragPan = () => {
    const snapshot = actorRef.getSnapshot();
    const shouldDisable = shouldDisableDragPanForSnapshot(snapshot);

    if (shouldDisable === dragPanDisabledRef.current) return;
    dragPanDisabledRef.current = shouldDisable;
    if (shouldDisable) map.dragPan.disable();
    else map.dragPan.enable();
  };

  syncDragPan();
  const subscription = actorRef.subscribe(syncDragPan);
  const unsubUI = useUIStore.subscribe((state, prev) => {
    if (state.boundaryBrush.active !== prev.boundaryBrush.active) syncDragPan();
  });

  return () => {
    subscription.unsubscribe();
    unsubUI();
  };
}

export function useDragPan(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  const dragPanDisabledRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return installDragPanSync(map, actorRef, dragPanDisabledRef);
  }, [actorRef, mapRef]);
}
