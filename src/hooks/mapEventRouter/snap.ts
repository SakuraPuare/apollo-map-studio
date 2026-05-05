import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import type { LngLat } from '@/core/geometry/interpolate';
import {
  collectCandidates,
  collectSnapGuidePoints,
  findSnapMatchFromCandidates,
  findSnapTarget,
  pixelsToMeters,
  type SnapTarget,
} from '@/core/geometry/snap';
import { useMapStore } from '@/store/mapStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isEntityTypeVisible, useUIStore, type LayerStates } from '@/store/uiStore';
import type { MapEntity } from '@/types/entities';
import { getEditPoints } from '@/lib/entityOps';

function isSnapApplicable(state: string): boolean {
  return state === 'editingPoint' || isDrawingState(state);
}

function* visibleSnapEntities(
  entities: Iterable<MapEntity>,
  layerStates: LayerStates,
): Iterable<MapEntity> {
  for (const entity of entities) {
    if (isEntityTypeVisible(layerStates, entity.entityType)) yield entity;
  }
}

function getEntityCenter(entity: MapEntity): LngLat | null {
  const points = getEditPoints(entity);
  if (points.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }
  return [sumX / points.length, sumY / points.length];
}

function offsetDistanceMeters(dx: number, dy: number, lat: number): number {
  const metersPerLng = Math.cos((lat * Math.PI) / 180) * 111320;
  const metersPerLat = 111320;
  return Math.hypot(dx * metersPerLng, dy * metersPerLat);
}

interface MoveSnapResult {
  point: LngLat;
  target: SnapTarget;
  distanceMeters: number;
}

function findMoveSnapTarget(
  entity: MapEntity,
  desiredCenter: LngLat,
  candidates: ReturnType<typeof collectCandidates>,
  radiusMeters: number,
): MoveSnapResult | null {
  const entityCenter = getEntityCenter(entity);
  if (!entityCenter) return null;

  const dx = desiredCenter[0] - entityCenter[0];
  const dy = desiredCenter[1] - entityCenter[1];
  const guidePoints = collectSnapGuidePoints(entity);
  if (guidePoints.length === 0) return null;

  let best: MoveSnapResult | null = null;
  for (const guide of guidePoints) {
    const movedGuide = { x: guide.x + dx, y: guide.y + dy };
    const match = findSnapMatchFromCandidates(movedGuide, candidates, radiusMeters);
    if (!match) continue;

    const snappedPoint: LngLat = [
      desiredCenter[0] + (match.target.point.x - movedGuide.x),
      desiredCenter[1] + (match.target.point.y - movedGuide.y),
    ];
    const snappedDx = snappedPoint[0] - desiredCenter[0];
    const snappedDy = snappedPoint[1] - desiredCenter[1];
    const distanceMeters = offsetDistanceMeters(snappedDx, snappedDy, desiredCenter[1]);

    if (distanceMeters > radiusMeters) continue;
    if (!best || distanceMeters < best.distanceMeters) {
      best = {
        point: snappedPoint,
        target: match.target,
        distanceMeters,
      };
    }
  }

  return best;
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
    visibleSnapEntities(entities.values(), ui.layerStates),
    radiusM,
    excludeId,
  );
  ui.setSnapTarget(target);
  if (!target) return lngLat;
  return [target.point.x, target.point.y];
}

export function applyMoveSnap(
  map: maplibregl.Map,
  actorRef: ActorRefFrom<typeof editorMachine>,
  desiredCenter: LngLat,
  entityId: string | null,
): LngLat {
  const ui = useUIStore.getState();
  const state = actorRef.getSnapshot().value as string;
  if (!ui.snapEnabled || state !== 'editingPoint' || !entityId) {
    if (ui.currentSnapTarget) ui.setSnapTarget(null);
    return desiredCenter;
  }

  const entity = useMapStore.getState().entities.get(entityId);
  if (!entity) {
    if (ui.currentSnapTarget) ui.setSnapTarget(null);
    return desiredCenter;
  }

  const zoom = map.getZoom();
  const radiusM = pixelsToMeters(useSettingsStore.getState().snapRadius, desiredCenter[1], zoom);
  const candidates = collectCandidates(
    visibleSnapEntities(useMapStore.getState().entities.values(), ui.layerStates),
    entityId,
  );
  const target = findMoveSnapTarget(entity, desiredCenter, candidates, radiusM);
  ui.setSnapTarget(target?.target ?? null);
  return target?.point ?? desiredCenter;
}
