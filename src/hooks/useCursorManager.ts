import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';

export function useCursorManager(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const isDrawing = isDrawingState(currentState);
  const isEditingPoint = currentState === 'editingPoint';

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    if (isEditingPoint) {
      canvas.style.cursor = 'grabbing';
    } else if (isDrawing) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }, [isDrawing, isEditingPoint]);
}
