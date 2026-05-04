import type maplibregl from 'maplibre-gl';
import type { RefObject } from 'react';
import type { ActorRefFrom } from 'xstate';
import { applyDrag } from '@/components/map/entityMutations';
import { CLICK_THRESHOLD_PX } from '@/config/mapConstants';
import type { editorMachine } from '@/core/fsm/editorMachine';
import {
  findLaneBoundaryPaintHit,
  setLaneBoundaryTypeAtS,
} from '@/core/geometry/laneBoundaryPaint';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import type { LaneEntity } from '@/types/apollo';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import { createCursorScheduler } from './cursorScheduler';
import { hitBbox, toLngLat, workerHitTest } from './hitTest';
import { isDuplicateInput, sampleInput, type InputSample } from './inputDedup';
import { handleConnectModeClick } from './connectMode';
import { handleMapKeyDown } from './keyboard';
import { handleSelectedMouseDown } from './selectionDrag';
import { applySnap as applySnapToPoint } from './snap';

interface RouterMutableState {
  mouseDownScreenPos: { x: number; y: number } | null;
  centerGrabOffset: [number, number] | null;
  lastDrawInput: InputSample | null;
  boundaryBrushDragging: boolean;
  lastBoundaryBrushHit: string | null;
}

interface RouterContext {
  map: maplibregl.Map;
  actorRef: ActorRefFrom<typeof editorMachine>;
  bridgeRef: RefObject<SpatialWorkerBridge | null>;
  mutable: RouterMutableState;
  cursorScheduler: ReturnType<typeof createCursorScheduler>;
}

type HitTest = (
  e: maplibregl.MapMouseEvent,
  filter?: (entityType: string) => boolean,
) => Promise<string | null>;

function applySnap(ctx: RouterContext, lngLat: [number, number], excludeId: string | null = null) {
  return applySnapToPoint(ctx.map, ctx.actorRef, lngLat, excludeId);
}

function hitTest(ctx: RouterContext): HitTest {
  return (e, filter) => workerHitTest(ctx.map, ctx.bridgeRef.current, e, filter);
}

function handleDrawInput(ctx: RouterContext, e: maplibregl.MapMouseEvent): void {
  const sample = sampleInput(e);
  if (isDuplicateInput(ctx.mutable.lastDrawInput, sample)) {
    ctx.mutable.lastDrawInput = sample;
    return;
  }
  ctx.mutable.lastDrawInput = sample;
  ctx.actorRef.send({ type: 'MOUSE_DOWN', point: applySnap(ctx, toLngLat(e)) });
}

function isLaneEntity(entity: { entityType: string }): entity is LaneEntity {
  return entity.entityType === 'lane';
}

function handleBoundaryBrushInput(ctx: RouterContext, e: maplibregl.MapMouseEvent): boolean {
  const brush = useUIStore.getState().boundaryBrush;
  if (!brush.active) return false;

  const lanes = Array.from(useMapStore.getState().entities.values()).filter(isLaneEntity);
  const hit = findLaneBoundaryPaintHit(lanes, toLngLat(e));
  if (!hit) return true;
  const hitKey = `${hit.laneId}:${hit.side}:${Math.round(hit.s * 10) / 10}:${brush.type}`;
  if (ctx.mutable.lastBoundaryBrushHit === hitKey) return true;
  ctx.mutable.lastBoundaryBrushHit = hitKey;

  const lane = useMapStore.getState().entities.get(hit.laneId);
  if (!lane || !isLaneEntity(lane)) return true;
  const next = setLaneBoundaryTypeAtS(lane, hit.side, hit.s, brush.type);
  useMapStore.getState().updateEntity(lane.id, next);
  ctx.actorRef.send({ type: 'SELECT_ENTITY', id: lane.id });
  return true;
}

function handleSelectClick(ctx: RouterContext, e: maplibregl.MapMouseEvent): void {
  const hotHits = ctx.map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
  if (hotHits.length > 0) return;

  hitTest(ctx)(e).then((hitId) => {
    const current = ctx.actorRef.getSnapshot();
    if ((current.value as string) !== 'selected') return;
    if (hitId) ctx.actorRef.send({ type: 'SELECT_ENTITY', id: hitId });
    else ctx.actorRef.send({ type: 'DESELECT' });
  });
}

function handleIdleClick(ctx: RouterContext, e: maplibregl.MapMouseEvent): void {
  hitTest(ctx)(e).then((hitId) => {
    const current = ctx.actorRef.getSnapshot();
    if ((current.value as string) !== 'idle') return;
    if (hitId) ctx.actorRef.send({ type: 'SELECT_ENTITY', id: hitId });
  });
}

function isClickAfterDrag(ctx: RouterContext, e: maplibregl.MapMouseEvent): boolean {
  const start = ctx.mutable.mouseDownScreenPos;
  if (!start) return false;
  return Math.hypot(e.point.x - start.x, e.point.y - start.y) > CLICK_THRESHOLD_PX;
}

function clearSnapTargetIfAny(): void {
  if (useUIStore.getState().currentSnapTarget) {
    useUIStore.getState().setSnapTarget(null);
  }
}

function onMouseDown(ctx: RouterContext, e: maplibregl.MapMouseEvent): void {
  ctx.mutable.mouseDownScreenPos = { x: e.point.x, y: e.point.y };
  const state = ctx.actorRef.getSnapshot().value as string;

  if (useUIStore.getState().boundaryBrush.active) {
    ctx.mutable.boundaryBrushDragging = true;
    ctx.mutable.lastBoundaryBrushHit = null;
    ctx.map.dragPan.disable();
    handleBoundaryBrushInput(ctx, e);
    return;
  }

  const selectedDrag = handleSelectedMouseDown(ctx.map, ctx.actorRef, e);
  if (selectedDrag.handled) {
    if ('centerGrabOffset' in selectedDrag) {
      ctx.mutable.centerGrabOffset = selectedDrag.centerGrabOffset!;
    }
    return;
  }

  if (state === 'editingPoint') return;
  if (state === 'drawBezier') handleDrawInput(ctx, e);
}

function onClick(ctx: RouterContext, e: maplibregl.MapMouseEvent): void {
  if (isClickAfterDrag(ctx, e)) return;
  if (handleBoundaryBrushInput(ctx, e)) return;
  if (handleConnectModeClick(ctx.actorRef, hitTest(ctx), e)) return;

  const state = ctx.actorRef.getSnapshot().value as string;
  if (state === 'editingPoint') return;
  if (state === 'selected') return handleSelectClick(ctx, e);
  if (state === 'idle') return handleIdleClick(ctx, e);
  if (state !== 'drawBezier') handleDrawInput(ctx, e);
}

function onMouseMove(ctx: RouterContext, e: maplibregl.MapMouseEvent): void {
  ctx.cursorScheduler.schedule([e.lngLat.lng, e.lngLat.lat]);
  const snap = ctx.actorRef.getSnapshot();
  const state = snap.value as string;

  if (state === 'editingPoint') {
    const excludeId = snap.context.selectedEntityId ?? null;
    let pt = applySnap(ctx, toLngLat(e), excludeId);
    if (snap.context.dragPointType === 'center' && ctx.mutable.centerGrabOffset) {
      pt = [pt[0] - ctx.mutable.centerGrabOffset[0], pt[1] - ctx.mutable.centerGrabOffset[1]];
    }
    ctx.actorRef.send({ type: 'DRAG_MOVE', point: pt });
    return;
  }

  if (ctx.mutable.boundaryBrushDragging) {
    handleBoundaryBrushInput(ctx, e);
    return;
  }

  if (state === 'selected') {
    const hotHits = ctx.map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
    ctx.map.getCanvas().style.cursor = hotHits.length > 0 ? 'grab' : '';
    clearSnapTargetIfAny();
    return;
  }

  if (state === 'idle') {
    clearSnapTargetIfAny();
    return;
  }

  ctx.actorRef.send({ type: 'MOUSE_MOVE', point: applySnap(ctx, toLngLat(e)) });
}

function onMouseUp(ctx: RouterContext, e: maplibregl.MapMouseEvent): void {
  const snap = ctx.actorRef.getSnapshot();
  const state = snap.value as string;

  if (ctx.mutable.boundaryBrushDragging) {
    handleBoundaryBrushInput(ctx, e);
    ctx.mutable.boundaryBrushDragging = false;
    ctx.mutable.lastBoundaryBrushHit = null;
    ctx.map.dragPan.enable();
    return;
  }

  if (state === 'editingPoint') {
    handleEditingMouseUp(ctx, e, snap);
    return;
  }

  ctx.mutable.centerGrabOffset = null;
  ctx.actorRef.send({ type: 'MOUSE_UP', point: applySnap(ctx, toLngLat(e)) });
}

function handleEditingMouseUp(
  ctx: RouterContext,
  e: maplibregl.MapMouseEvent,
  snap: ReturnType<RouterContext['actorRef']['getSnapshot']>,
): void {
  ctx.map.dragPan.enable();
  const entityId = snap.context.selectedEntityId;
  let pt = applySnap(ctx, toLngLat(e), entityId ?? null);
  const idx = snap.context.dragPointIndex;
  const pType = snap.context.dragPointType;
  const alt = snap.context.dragAltKey;

  if (pType === 'center' && ctx.mutable.centerGrabOffset) {
    pt = [pt[0] - ctx.mutable.centerGrabOffset[0], pt[1] - ctx.mutable.centerGrabOffset[1]];
  }
  if (entityId) {
    const entity = useMapStore.getState().entities.get(entityId);
    if (entity) {
      useMapStore.getState().updateEntity(entityId, applyDrag(entity, idx, pType, pt, alt));
    }
  }

  ctx.actorRef.send({ type: 'DRAG_END', point: pt });
  useUIStore.getState().setSnapTarget(null);
  ctx.mutable.centerGrabOffset = null;
}

function onDblClick(ctx: RouterContext, e: maplibregl.MapMouseEvent): void {
  e.preventDefault();
  ctx.mutable.lastDrawInput = null;
  ctx.actorRef.send({ type: 'DOUBLE_CLICK', point: applySnap(ctx, toLngLat(e)) });
}

function onKeyDown(ctx: RouterContext, e: KeyboardEvent): void {
  handleMapKeyDown(ctx.actorRef, e, () => {
    ctx.mutable.centerGrabOffset = null;
  });
}

function onZoomEnd(ctx: RouterContext): void {
  useUIStore.getState().setCurrentZoom(ctx.map.getZoom());
}

export function createMapEventHandlers(ctx: RouterContext) {
  return {
    onMouseDown: (e: maplibregl.MapMouseEvent) => onMouseDown(ctx, e),
    onClick: (e: maplibregl.MapMouseEvent) => onClick(ctx, e),
    onMouseMove: (e: maplibregl.MapMouseEvent) => onMouseMove(ctx, e),
    onMouseUp: (e: maplibregl.MapMouseEvent) => onMouseUp(ctx, e),
    onDblClick: (e: maplibregl.MapMouseEvent) => onDblClick(ctx, e),
    onKeyDown: (e: KeyboardEvent) => onKeyDown(ctx, e),
    onZoomEnd: () => onZoomEnd(ctx),
  };
}

export function createRouterContext(
  map: maplibregl.Map,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: RefObject<SpatialWorkerBridge | null>,
): RouterContext {
  return {
    map,
    actorRef,
    bridgeRef,
    cursorScheduler: createCursorScheduler(),
    mutable: {
      mouseDownScreenPos: null,
      centerGrabOffset: null,
      lastDrawInput: null,
      boundaryBrushDragging: false,
      lastBoundaryBrushHit: null,
    },
  };
}
