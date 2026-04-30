import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import type { DragPointType } from '@/types/editor';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import {
  applyDrag,
  getDragCenter,
  toggleSmooth,
  toggleSmoothApollo,
  deleteVertex,
} from '@/components/map/entityMutations';
import type { ApolloEntity, SourceDrawInfo } from '@/types/apollo';
import { CLICK_THRESHOLD_PX } from '@/config/mapConstants';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import { applyLaneConnection, planConnection } from '@/core/geometry/connectLanes';
import type { LaneEntity } from '@/types/apollo';
import { createCursorScheduler } from './mapEventRouter/cursorScheduler';
import { hitBbox, toLngLat, workerHitTest } from './mapEventRouter/hitTest';
import { isDuplicateInput, sampleInput, type InputSample } from './mapEventRouter/inputDedup';
import { applySnap as applySnapToPoint } from './mapEventRouter/snap';

export { isDuplicateInput };

export function useMapEventRouter(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: React.RefObject<SpatialWorkerBridge | null>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let mouseDownScreenPos: { x: number; y: number } | null = null;
    // Center-drag: lng/lat offset between cursor at mousedown and entity
    // center. Locked at drag start so the grabbed point follows the cursor
    // instead of the center snapping under the pointer.
    let centerGrabOffset: [number, number] | null = null;
    let lastDrawInput: InputSample | null = null;
    const cursorScheduler = createCursorScheduler();
    const applySnap = (lngLat: [number, number], excludeId: string | null = null) =>
      applySnapToPoint(map, actorRef, lngLat, excludeId);
    const hitTest = (e: maplibregl.MapMouseEvent, filter?: (entityType: string) => boolean) =>
      workerHitTest(map, bridgeRef.current, e, filter);

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      mouseDownScreenPos = { x: e.point.x, y: e.point.y };
      const snap = actorRef.getSnapshot();
      const state = snap.value as string;
      const altKey = e.originalEvent.altKey;

      // Connect-lanes is a modal pick flow that lives ON TOP of FSM state.
      // We routinely SELECT_ENTITY the first picked lane so the user sees
      // it highlighted (without that, the click feels like a no-op, which
      // is the original "无法选中车道" report). That selection means a click
      // on the lane's hot-points/hot-fill on the second pick would otherwise
      // start a vertex/center drag here — short-circuit the drag branch
      // while connect mode is active so the click reaches the connect
      // handler in onClick instead.
      if (state === 'selected' && !useUIStore.getState().connectMode.active) {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        if (hotHits.length > 0) {
          const props = hotHits[0]!.properties;
          const idx = props?.index as number;
          const pType = (
            props?.role === 'handle' ? (props?.handleType as DragPointType) : 'vertex'
          ) as DragPointType;

          if (altKey && pType === 'vertex') {
            const entityId = snap.context.selectedEntityId;
            if (entityId) {
              const entity = useMapStore.getState().entities.get(entityId);
              if (entity) {
                if (entity.entityType === 'bezier') {
                  useMapStore.getState().updateEntity(entityId, toggleSmooth(entity, idx));
                } else {
                  // Apollo entity with bezier source
                  const src = (entity as unknown as Record<string, unknown>)._source as
                    | SourceDrawInfo
                    | undefined;
                  if (src?.drawTool === 'drawBezier' && src.anchors) {
                    useMapStore
                      .getState()
                      .updateEntity(entityId, toggleSmoothApollo(entity as ApolloEntity, idx));
                  }
                }
              }
            }
            actorRef.send({ type: 'TOGGLE_SMOOTH', index: idx });
            return;
          }

          map.dragPan.disable();
          actorRef.send({ type: 'START_DRAG', index: idx, pointType: pType, altKey });
          return;
        }

        const fillHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-fill'] });
        if (fillHits.length > 0) {
          map.dragPan.disable();
          const entityId = snap.context.selectedEntityId;
          centerGrabOffset = null;
          if (entityId) {
            const entity = useMapStore.getState().entities.get(entityId);
            if (entity) {
              const center = getDragCenter(entity);
              if (center) {
                const m = toLngLat(e);
                centerGrabOffset = [m[0] - center[0], m[1] - center[1]];
              }
            }
          }
          actorRef.send({
            type: 'START_DRAG',
            index: -2,
            pointType: 'center' as DragPointType,
            altKey: false,
          });
          return;
        }
      }

      if (state === 'editingPoint') return;

      if (state === 'drawBezier') {
        const sample = sampleInput(e);
        if (isDuplicateInput(lastDrawInput, sample)) {
          lastDrawInput = sample;
          return;
        }
        lastDrawInput = sample;
        actorRef.send({ type: 'MOUSE_DOWN', point: applySnap(toLngLat(e)) });
      }
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (mouseDownScreenPos) {
        const dx = e.point.x - mouseDownScreenPos.x;
        const dy = e.point.y - mouseDownScreenPos.y;
        if (Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) return;
      }

      // Connect-lanes mode intercepts every click — first picks the
      // source lane, second picks the target and commits the join.
      // Non-lane clicks are ignored (with a no-op visual reset).
      const ui = useUIStore.getState();
      if (ui.connectMode.active) {
        // Filter to lanes so an overlapping junction polygon (lanes routinely
        // pass through junctions) doesn't shadow the lane the user actually
        // clicked.
        hitTest(e, (t) => t === 'lane').then((hitId) => {
          const current = useUIStore.getState();
          if (!current.connectMode.active) return;
          if (!hitId) return;
          const entity = useMapStore.getState().entities.get(hitId);
          if (!entity || entity.entityType !== 'lane') return;
          if (!current.connectMode.firstLaneId) {
            useUIStore.getState().setConnectFirstLane(hitId);
            // Re-use the FSM selection highlight so the picked lane lights
            // up immediately. Without this the user gets zero visual
            // feedback that their first click landed and reports the mode
            // as broken ("无法选中车道"). The drag branch in onMouseDown is
            // gated on connectMode so a follow-up click on the same lane
            // doesn't start a vertex drag.
            actorRef.send({ type: 'SELECT_ENTITY', id: hitId });
            return;
          }
          if (current.connectMode.firstLaneId === hitId) return; // same lane
          const a = useMapStore.getState().entities.get(current.connectMode.firstLaneId);
          if (!a || a.entityType !== 'lane') {
            useUIStore.getState().exitConnectMode();
            return;
          }
          // Wrap the apply step in try/finally so a malformed source
          // record (missing anchor handle, etc.) can't strand the user
          // in connect mode — exitConnectMode + SELECT_ENTITY must run
          // regardless of whether applyDrag/updateEntity threw. The
          // reconcile inside updateEntity has already written pred/succ
          // for clean cases; thrown cases at least free the UI.
          try {
            const plan = planConnection(a as LaneEntity, entity as LaneEntity);
            if (plan) {
              // applyLaneConnection knows that `plan.indexToMove` is a
              // centerline-point index — translates it to first/last anchor
              // (bezier) or arcPoints[0|2] (arc) before re-sampling. The
              // old applyDrag('vertex') path indexed `_source.anchors`
              // directly with the centerline index and crashed on bezier
              // lanes ("无法选中车道" → drag undefined.x).
              const next = applyLaneConnection(a as LaneEntity, plan);
              useMapStore.getState().updateEntity(a.id, next);
              // reconcileLaneTopology runs inside updateEntity for lanes,
              // so pred/succ are written into the store before we exit.
            }
          } catch (err) {
            console.error('[connect] apply failed', err);
          } finally {
            useUIStore.getState().exitConnectMode();
            // Surface the joined lane so user can immediately see the
            // result in Inspector.
            actorRef.send({ type: 'SELECT_ENTITY', id: a.id });
          }
        });
        return;
      }

      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      if (state === 'editingPoint') return;

      if (state === 'selected') {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        if (hotHits.length > 0) return;

        hitTest(e).then((hitId) => {
          const current = actorRef.getSnapshot();
          if ((current.value as string) !== 'selected') return;
          if (hitId) {
            actorRef.send({ type: 'SELECT_ENTITY', id: hitId });
          } else {
            actorRef.send({ type: 'DESELECT' });
          }
        });
        return;
      }

      if (state === 'idle') {
        hitTest(e).then((hitId) => {
          const current = actorRef.getSnapshot();
          if ((current.value as string) !== 'idle') return;
          if (hitId) {
            actorRef.send({ type: 'SELECT_ENTITY', id: hitId });
          }
        });
        return;
      }

      if (state !== 'drawBezier') {
        const sample = sampleInput(e);
        if (isDuplicateInput(lastDrawInput, sample)) {
          lastDrawInput = sample;
          return;
        }
        lastDrawInput = sample;
        actorRef.send({ type: 'MOUSE_DOWN', point: applySnap(toLngLat(e)) });
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      // Update cursor position in UI store (RAF-coalesced, 60fps cap)
      cursorScheduler.schedule([e.lngLat.lng, e.lngLat.lat]);

      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      if (state === 'editingPoint') {
        // Don't snap to the entity being dragged.
        const excludeId = snap.context.selectedEntityId ?? null;
        let pt = applySnap(toLngLat(e), excludeId);
        if (snap.context.dragPointType === 'center' && centerGrabOffset) {
          pt = [pt[0] - centerGrabOffset[0], pt[1] - centerGrabOffset[1]];
        }
        actorRef.send({ type: 'DRAG_MOVE', point: pt });
        return;
      }

      if (state === 'selected') {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        map.getCanvas().style.cursor = hotHits.length > 0 ? 'grab' : '';
        // Clear any leftover indicator from a previous draw/edit.
        if (useUIStore.getState().currentSnapTarget) {
          useUIStore.getState().setSnapTarget(null);
        }
        return;
      }

      if (state === 'idle') {
        if (useUIStore.getState().currentSnapTarget) {
          useUIStore.getState().setSnapTarget(null);
        }
        return;
      }

      actorRef.send({ type: 'MOUSE_MOVE', point: applySnap(toLngLat(e)) });
    };

    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      if (state === 'editingPoint') {
        map.dragPan.enable();
        const entityId = snap.context.selectedEntityId;
        let pt = applySnap(toLngLat(e), entityId ?? null);
        const idx = snap.context.dragPointIndex;
        const pType = snap.context.dragPointType;
        const alt = snap.context.dragAltKey;
        if (pType === 'center' && centerGrabOffset) {
          pt = [pt[0] - centerGrabOffset[0], pt[1] - centerGrabOffset[1]];
        }
        if (entityId) {
          const entity = useMapStore.getState().entities.get(entityId);
          if (entity) {
            useMapStore.getState().updateEntity(entityId, applyDrag(entity, idx, pType, pt, alt));
          }
        }
        actorRef.send({ type: 'DRAG_END', point: pt });
        // Drag is over — clear indicator.
        useUIStore.getState().setSnapTarget(null);
        centerGrabOffset = null;
        return;
      }

      centerGrabOffset = null;
      actorRef.send({ type: 'MOUSE_UP', point: applySnap(toLngLat(e)) });
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      lastDrawInput = null;
      actorRef.send({ type: 'DOUBLE_CLICK', point: applySnap(toLngLat(e)) });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        centerGrabOffset = null;
        // ESC also cancels connect-mode so the user can bail without
        // committing a join.
        if (useUIStore.getState().connectMode.active) {
          useUIStore.getState().exitConnectMode();
        }
        actorRef.send({ type: 'CANCEL' });
      }
      if (e.key === 'Enter') actorRef.send({ type: 'CONFIRM' });
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const snap = actorRef.getSnapshot();
        if (snap.value !== 'selected' || !snap.context.selectedEntityId) return;
        const id = snap.context.selectedEntityId;
        const store = useMapStore.getState();
        const entity = store.entities.get(id);
        if (!entity) return;

        const idx = snap.context.dragPointIndex;
        const pType = snap.context.dragPointType;

        if (pType === 'vertex' && idx >= 0) {
          const result = deleteVertex(entity, idx);
          if (result) {
            store.updateEntity(id, result);
            actorRef.send({ type: 'SELECT_ENTITY', id });
            return;
          }
        }

        actorRef.send({ type: 'DELETE_ENTITY' });
        store.removeEntity(id);
      }
    };

    const onZoomEnd = () => {
      useUIStore.getState().setCurrentZoom(map.getZoom());
    };

    // Set initial zoom
    useUIStore.getState().setCurrentZoom(map.getZoom());

    map.on('mousedown', onMouseDown);
    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('dblclick', onDblClick);
    map.on('zoomend', onZoomEnd);
    window.addEventListener('keydown', onKeyDown);

    // Clear the snap indicator the instant the user toggles snap off
    // (otherwise the last ring lingers until the next mousemove).
    const unsubSnap = useUIStore.subscribe((s, prev) => {
      if (prev.snapEnabled && !s.snapEnabled && s.currentSnapTarget) {
        useUIStore.getState().setSnapTarget(null);
      }
    });

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('dblclick', onDblClick);
      map.off('zoomend', onZoomEnd);
      window.removeEventListener('keydown', onKeyDown);
      unsubSnap();
      cursorScheduler.dispose();
    };
    // mapRef / bridgeRef are refs — non-reactive by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorRef]);
}
