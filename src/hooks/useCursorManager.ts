import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';

export function useCursorManager(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;

    const applyCursor = () => {
      const currentState = actorRef.getSnapshot().value as string;
      if (currentState === 'editingPoint') {
        canvas.style.cursor = 'grabbing';
      } else if (isDrawingState(currentState)) {
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = '';
      }
    };

    applyCursor();
    const subscription = actorRef.subscribe(applyCursor);

    return () => {
      subscription.unsubscribe();
    };
  }, [actorRef]);
}
