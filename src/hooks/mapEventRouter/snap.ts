import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import type { LngLat } from '@/core/geometry/interpolate';
import { findSnapTarget, pixelsToMeters, type SnapTarget } from '@/core/geometry/snap';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';

function isSnapApplicable(state: string): boolean {
  return state === 'editingPoint' || isDrawingState(state);
}

export function applySnap(
  map: maplibregl.Map,
  actorRef: ActorRefFrom<typeof editorMachine>,
  lngLat: LngLat,
  excludeId: string | null = null,
): LngLat {
  const ui = useUIStore.getState();
  const state = actorRef.getSnapshot().value as string;
  if (!ui.snapEnabled || !isSnapApplicable(state)) {
    if (ui.currentSnapTarget) ui.setSnapTarget(null);
    return lngLat;
  }
  const zoom = map.getZoom();
  const radiusM = pixelsToMeters(useSettingsStore.getState().snapRadius, lngLat[1], zoom);
  const entities = useMapStore.getState().entities;
  const target: SnapTarget | null = findSnapTarget(
    { x: lngLat[0], y: lngLat[1] },
    entities.values(),
    radiusM,
    excludeId,
  );
  ui.setSnapTarget(target);
  if (!target) return lngLat;
  return [target.point.x, target.point.y];
}
