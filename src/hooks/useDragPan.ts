import { useRef, useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';

export function useDragPan(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  const isDraggingHandle = useSelector(actorRef, (s) => s.context.isDraggingHandle);
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const isEditingPoint = currentState === 'editingPoint';

  const dragPanDisabledRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const shouldDisable = isDraggingHandle || isEditingPoint || currentState === 'drawBezier';
    if (shouldDisable === dragPanDisabledRef.current) return;
    dragPanDisabledRef.current = shouldDisable;
    shouldDisable ? map.dragPan.disable() : map.dragPan.enable();
  }, [isDraggingHandle, isEditingPoint, currentState]);
}
