import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import type { ApolloEntity } from '@/types/apollo';
import { getSource } from '@/types/apollo';
import type { DragPointType } from '@/types/editor';
import type { MapEntity } from '@/types/entities';
import { getDragCenter, toggleSmooth, toggleSmoothApollo } from '@/components/map/entityMutations';
import { pointToPolylineDistGeo } from '@/core/geometry/hitTest';
import { entityRenderCoords } from '@/core/geometry/compile';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isEntityTypeInteractive, useUIStore } from '@/store/uiStore';
import { hitBbox, pixelToRadius, toLngLat } from './hitTest';

export interface SelectedMouseDownResult {
  handled: boolean;
  centerGrabOffset?: [number, number] | null;
}

function canCenterDragFromHotLine(entity: MapEntity | null | undefined): boolean {
  if (!entity) return false;
  const source = getSource(entity);
  if (source?.drawTool === 'drawBezier' || source?.drawTool === 'drawArc') return false;
  return getDragCenter(entity) !== null;
}

function hitsSelectedLineGeometry(
  map: maplibregl.Map,
  entity: MapEntity,
  e: maplibregl.MapMouseEvent,
): boolean {
  const coords = entityRenderCoords(entity);
  if (coords.length < 2) return false;

  const point = toLngLat(e);
  const radius = pixelToRadius(map, useSettingsStore.getState().hitTestRadius);
  const cosLat = Math.max(Math.cos((point[1] * Math.PI) / 180), 1e-6);
  return pointToPolylineDistGeo(point, coords, cosLat) <= Math.abs(radius);
}

function hitsSelectedLine(
  map: maplibregl.Map,
  entity: MapEntity | null,
  e: maplibregl.MapMouseEvent,
): boolean {
  if (!entity || !canCenterDragFromHotLine(entity)) return false;
  const lineHits = map.queryRenderedFeatures(hitBbox(e.point), {
    layers: ['hot-line-hit', 'hot-line'],
  });
  return lineHits.length > 0 || hitsSelectedLineGeometry(map, entity, e);
}

function toggleEntitySmooth(entityId: string, idx: number) {
  const entity = useMapStore.getState().entities.get(entityId);
  if (!entity) return;

  if (entity.entityType === 'bezier') {
    useMapStore.getState().updateEntity(entityId, toggleSmooth(entity, idx));
    return;
  }

  const src = getSource(entity);
  if (src?.drawTool === 'drawBezier' && src.anchors) {
    useMapStore.getState().updateEntity(entityId, toggleSmoothApollo(entity as ApolloEntity, idx));
  }
}

export function handleSelectedMouseDown(
  map: maplibregl.Map,
  actorRef: ActorRefFrom<typeof editorMachine>,
  e: maplibregl.MapMouseEvent,
): SelectedMouseDownResult {
  const snap = actorRef.getSnapshot();
  if ((snap.value as string) !== 'selected') return { handled: false };
  if (useUIStore.getState().connectMode.active) return { handled: false };
  const selectedEntityId = snap.context.selectedEntityId;
  const selectedEntity = selectedEntityId
    ? (useMapStore.getState().entities.get(selectedEntityId) ?? null)
    : null;
  if (selectedEntityId) {
    if (
      selectedEntity &&
      !isEntityTypeInteractive(useUIStore.getState().layerStates, selectedEntity.entityType)
    ) {
      return { handled: false };
    }
  }

  const altKey = e.originalEvent.altKey;
  const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
  if (hotHits.length > 0) {
    const props = hotHits[0]!.properties;
    const idx = props?.index as number;
    const pType = (
      props?.role === 'handle' ? (props?.handleType as DragPointType) : 'vertex'
    ) as DragPointType;

    if (altKey && pType === 'vertex') {
      const entityId = snap.context.selectedEntityId;
      if (entityId) toggleEntitySmooth(entityId, idx);
      actorRef.send({ type: 'TOGGLE_SMOOTH', index: idx });
      return { handled: true };
    }

    map.dragPan.disable();
    e.preventDefault();
    actorRef.send({ type: 'START_DRAG', index: idx, pointType: pType, altKey });
    return { handled: true };
  }

  const bbox = hitBbox(e.point);
  const fillHits = map.queryRenderedFeatures(bbox, { layers: ['hot-fill'] });
  const lineHit = hitsSelectedLine(map, selectedEntity, e);
  if (fillHits.length === 0 && !lineHit) return { handled: false };

  let centerGrabOffset: [number, number] | null = null;
  if (selectedEntity) {
    const center = getDragCenter(selectedEntity);
    if (center) {
      const m = toLngLat(e);
      centerGrabOffset = [m[0] - center[0], m[1] - center[1]];
    }
  }

  map.dragPan.disable();
  e.preventDefault();
  actorRef.send({
    type: 'START_DRAG',
    index: -2,
    pointType: 'center' as DragPointType,
    altKey: false,
  });
  return { handled: true, centerGrabOffset };
}
