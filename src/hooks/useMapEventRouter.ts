import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { applyDrag } from '@/components/map/entityMutations';
import { CLICK_THRESHOLD_PX } from '@/config/mapConstants';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import { createCursorScheduler } from './mapEventRouter/cursorScheduler';
import { hitBbox, toLngLat, workerHitTest } from './mapEventRouter/hitTest';
import { isDuplicateInput, sampleInput, type InputSample } from './mapEventRouter/inputDedup';
import { handleConnectModeClick } from './mapEventRouter/connectMode';
import { handleMapKeyDown } from './mapEventRouter/keyboard';
import { handleSelectedMouseDown } from './mapEventRouter/selectionDrag';
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

      const selectedDrag = handleSelectedMouseDown(map, actorRef, e);
      if (selectedDrag.handled) {
        if ('centerGrabOffset' in selectedDrag) centerGrabOffset = selectedDrag.centerGrabOffset!;
        return;
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

      if (handleConnectModeClick(actorRef, hitTest, e)) return;

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
      handleMapKeyDown(actorRef, e, () => {
        centerGrabOffset = null;
      });
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
