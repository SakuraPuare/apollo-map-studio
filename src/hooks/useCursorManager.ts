import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import { useUIStore } from '@/store/uiStore';

export function cursorForState(
  currentState: string,
  connectModeActive = false,
  boundaryBrushActive = false,
): string {
  if (boundaryBrushActive) return 'crosshair';
  // Connect-lanes mode wins over FSM-driven cursor: it's a non-FSM modal
  // overlay and the user needs an unambiguous "pick a lane" affordance.
  if (connectModeActive) return 'crosshair';
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
      canvas.style.cursor = cursorForState(
        actorRef.getSnapshot().value as string,
        useUIStore.getState().connectMode.active,
        useUIStore.getState().boundaryBrush.active,
      );
    };

    applyCursor();
    const subscription = actorRef.subscribe(applyCursor);
    const unsubUI = useUIStore.subscribe((s, prev) => {
      if (
        s.connectMode.active !== prev.connectMode.active ||
        s.boundaryBrush.active !== prev.boundaryBrush.active
      ) {
        applyCursor();
      }
    });

    return () => {
      subscription.unsubscribe();
      unsubUI();
    };
  }, [actorRef, mapRef]);
}
