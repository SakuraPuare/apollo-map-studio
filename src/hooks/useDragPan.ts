import { useRef, useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useUIStore } from '@/store/uiStore';

export function shouldDisableDragPan(
  currentState: string,
  isDraggingHandle: boolean,
  boundaryBrushActive = false,
): boolean {
  return (
    boundaryBrushActive ||
    isDraggingHandle ||
    currentState === 'editingPoint' ||
    currentState === 'drawBezier'
  );
}

export function useDragPan(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  const dragPanDisabledRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncDragPan = () => {
      const snapshot = actorRef.getSnapshot();
      const shouldDisable = shouldDisableDragPan(
        snapshot.value as string,
        snapshot.context.isDraggingHandle,
        useUIStore.getState().boundaryBrush.active,
      );

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
    // mapRef is a ref — non-reactive by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorRef]);
}
