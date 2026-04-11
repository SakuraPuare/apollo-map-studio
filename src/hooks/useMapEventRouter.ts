import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import type { DragPointType } from '@/types/editor';
import type { LngLat } from '@/core/geometry/interpolate';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import {
  applyDrag,
  toggleSmooth,
  toggleSmoothApollo,
  deleteVertex,
} from '@/components/map/entityMutations';
import type { ApolloEntity, SourceDrawInfo } from '@/types/apollo';
import { CLICK_THRESHOLD_PX, HIT_BBOX_PADDING_PX, HIT_TEST_RADIUS_PX } from '@/config/mapConstants';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';

// Browser fires two `click` events for a dblclick (one per mousedown), then a
// dblclick event. Without dedup, draw states see N+1 vertices and DOUBLE_CLICK's
// removeLastPoint can only undo one — leaving a duplicate at the dblclick spot.
// Tracked previous input is "shadowed" if the next input arrives at the same
// pixel within the dblclick window.
const DBLCLICK_PX_TOLERANCE = 4;
const DBLCLICK_MS_WINDOW = 350;

type InputSample = { x: number; y: number; ts: number };

export function isDuplicateInput(prev: InputSample | null, next: InputSample): boolean {
  if (!prev) return false;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return Math.hypot(dx, dy) < DBLCLICK_PX_TOLERANCE && next.ts - prev.ts < DBLCLICK_MS_WINDOW;
}

export function useMapEventRouter(
  mapRef: React.RefObject<maplibregl.Map | null>,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: React.RefObject<SpatialWorkerBridge | null>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const toLngLat = (e: maplibregl.MapMouseEvent): LngLat => [e.lngLat.lng, e.lngLat.lat];
    let mouseDownScreenPos: { x: number; y: number } | null = null;

    // Dblclick dedup: skip the 2nd click of a dblclick before it reaches the FSM.
    let lastDrawInput: InputSample | null = null;
    const sampleOf = (e: maplibregl.MapMouseEvent): InputSample => ({
      x: e.point.x,
      y: e.point.y,
      ts: e.originalEvent.timeStamp,
    });

    // P2d cursor throttle: coalesce cursorLngLat writes to one per animation
    // frame. Mousemove fires ~120Hz on modern trackpads — previously every
    // event triggered a Zustand update → StatusBar rerender. RAF-gating
    // caps to 60fps and aligns with repaint.
    let pendingCursorLngLat: LngLat | null = null;
    let cursorRafId: number | null = null;
    const flushCursor = () => {
      if (pendingCursorLngLat) {
        useUIStore.getState().setCursorLngLat(pendingCursorLngLat);
        pendingCursorLngLat = null;
      }
      cursorRafId = null;
    };
    const scheduleCursorUpdate = (point: LngLat) => {
      pendingCursorLngLat = point;
      if (cursorRafId === null) {
        cursorRafId = requestAnimationFrame(flushCursor);
      }
    };

    const hitBbox = (point: maplibregl.PointLike): [maplibregl.PointLike, maplibregl.PointLike] => {
      const p = point as maplibregl.Point;
      const pad = HIT_BBOX_PADDING_PX;
      return [
        [p.x - pad, p.y - pad],
        [p.x + pad, p.y + pad],
      ];
    };

    const pixelToRadius = (px: number): number => {
      const zoom = map.getZoom();
      return (px * 360) / (512 * Math.pow(2, zoom));
    };

    const workerHitTest = (e: maplibregl.MapMouseEvent): Promise<string | null> => {
      const bridge = bridgeRef.current;
      if (!bridge) return Promise.resolve(null);
      const pt = toLngLat(e);
      return bridge
        .send({ type: 'HIT_TEST', point: pt, radius: pixelToRadius(HIT_TEST_RADIUS_PX) })
        .then((result) => {
          if (result.type === 'HIT_RESULT' && result.hits.length > 0) {
            return result.hits[0].id;
          }
          return null;
        })
        .catch(() => null);
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      mouseDownScreenPos = { x: e.point.x, y: e.point.y };
      const snap = actorRef.getSnapshot();
      const state = snap.value as string;
      const altKey = e.originalEvent.altKey;

      if (state === 'selected') {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        if (hotHits.length > 0) {
          const props = hotHits[0].properties;
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
        const sample = sampleOf(e);
        if (isDuplicateInput(lastDrawInput, sample)) {
          lastDrawInput = sample;
          return;
        }
        lastDrawInput = sample;
        actorRef.send({ type: 'MOUSE_DOWN', point: toLngLat(e) });
      }
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (mouseDownScreenPos) {
        const dx = e.point.x - mouseDownScreenPos.x;
        const dy = e.point.y - mouseDownScreenPos.y;
        if (Math.hypot(dx, dy) > CLICK_THRESHOLD_PX) return;
      }

      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      if (state === 'editingPoint') return;

      if (state === 'selected') {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        if (hotHits.length > 0) return;

        workerHitTest(e).then((hitId) => {
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
        workerHitTest(e).then((hitId) => {
          const current = actorRef.getSnapshot();
          if ((current.value as string) !== 'idle') return;
          if (hitId) {
            actorRef.send({ type: 'SELECT_ENTITY', id: hitId });
          }
        });
        return;
      }

      if (state !== 'drawBezier') {
        const sample = sampleOf(e);
        if (isDuplicateInput(lastDrawInput, sample)) {
          lastDrawInput = sample;
          return;
        }
        lastDrawInput = sample;
        actorRef.send({ type: 'MOUSE_DOWN', point: toLngLat(e) });
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      // Update cursor position in UI store (RAF-coalesced, 60fps cap)
      scheduleCursorUpdate([e.lngLat.lng, e.lngLat.lat]);

      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      if (state === 'editingPoint') {
        actorRef.send({ type: 'DRAG_MOVE', point: toLngLat(e) });
        return;
      }

      if (state === 'selected') {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        map.getCanvas().style.cursor = hotHits.length > 0 ? 'grab' : '';
        return;
      }

      if (state === 'idle') return;

      actorRef.send({ type: 'MOUSE_MOVE', point: toLngLat(e) });
    };

    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      if (state === 'editingPoint') {
        map.dragPan.enable();
        const pt = toLngLat(e);
        const entityId = snap.context.selectedEntityId;
        const idx = snap.context.dragPointIndex;
        const pType = snap.context.dragPointType;
        const alt = snap.context.dragAltKey;
        if (entityId) {
          const entity = useMapStore.getState().entities.get(entityId);
          if (entity) {
            useMapStore.getState().updateEntity(entityId, applyDrag(entity, idx, pType, pt, alt));
          }
        }
        actorRef.send({ type: 'DRAG_END', point: pt });
        return;
      }

      actorRef.send({ type: 'MOUSE_UP', point: toLngLat(e) });
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      lastDrawInput = null;
      actorRef.send({ type: 'DOUBLE_CLICK', point: toLngLat(e) });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actorRef.send({ type: 'CANCEL' });
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

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('dblclick', onDblClick);
      map.off('zoomend', onZoomEnd);
      window.removeEventListener('keydown', onKeyDown);
      if (cursorRafId !== null) {
        cancelAnimationFrame(cursorRafId);
        cursorRafId = null;
      }
      pendingCursorLngLat = null;
    };
    // mapRef / bridgeRef are refs — non-reactive by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorRef]);
}
