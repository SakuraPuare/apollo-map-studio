import { useRef, useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';

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
      const currentState = snapshot.value as string;
      const shouldDisable = snapshot.context.isDraggingHandle
        || currentState === 'editingPoint'
        || currentState === 'drawBezier';

      if (shouldDisable === dragPanDisabledRef.current) return;
      dragPanDisabledRef.current = shouldDisable;
      shouldDisable ? map.dragPan.disable() : map.dragPan.enable();
    };

    syncDragPan();
    const subscription = actorRef.subscribe(syncDragPan);

    return () => {
      subscription.unsubscribe();
    };
  }, [actorRef]);
}
