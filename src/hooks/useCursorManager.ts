import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';

export function cursorForState(currentState: string): string {
  if (currentState === 'editingPoint') return 'grabbing';
  if (isDrawingState(currentState)) return 'crosshair';
  return '';
}

export function useCursorManager(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;

    const applyCursor = () => {
      canvas.style.cursor = cursorForState(actorRef.getSnapshot().value as string);
    };

    applyCursor();
    const subscription = actorRef.subscribe(applyCursor);

    return () => {
      subscription.unsubscribe();
    };
    // mapRef is a ref — non-reactive by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorRef]);
}
