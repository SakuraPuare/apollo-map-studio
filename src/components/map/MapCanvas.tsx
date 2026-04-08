import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSON } from 'geojson';
import { useSelector } from '@xstate/react';
import { nanoid } from 'nanoid';
import type { editorMachine, DragPointType } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import type { ActorRefFrom } from 'xstate';
import { useMapStore } from '@/store/mapStore';
import type { PolylineEntity, CatmullRomEntity, BezierEntity, ArcEntity } from '@/types/entities';
import { catmullRom, cubicBezier, threePointArc, type BezierAnchor, type LngLat } from '@/core/geometry/interpolate';
import { anchorToData, anchorToRuntime } from '@/core/geometry/anchorConvert';
import { lineFeature, pointFeature, handleLineFeature, entityToHotFeatures, entityToColdFeatures } from './geoJsonHelpers';
import { applyDrag, toggleSmooth } from './entityMutations';

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'dark-blank',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#1a1a2e' },
    },
  ],
};

const CURVE_COLORS: Record<string, string> = {
  polyline: '#00d4ff',
  catmullRom: '#00ff88',
  bezier: '#ff66cc',
  arc: '#ffaa00',
};

interface MapCanvasProps {
  actorRef: ActorRefFrom<typeof editorMachine>;
}

export function MapCanvas({ actorRef }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);

  const addEntity = useMapStore((s) => s.addEntity);
  const entities = useMapStore((s) => s.entities);

  const drawPoints = useSelector(actorRef, (s) => s.context.drawPoints);
  const previewPoint = useSelector(actorRef, (s) => s.context.previewPoint);
  const bezierAnchors = useSelector(actorRef, (s) => s.context.bezierAnchors);
  const isDraggingHandle = useSelector(actorRef, (s) => s.context.isDraggingHandle);
  const selectedEntityId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const dragPointIndex = useSelector(actorRef, (s) => s.context.dragPointIndex);
  const dragPointType = useSelector(actorRef, (s) => s.context.dragPointType);
  const dragCurrentPoint = useSelector(actorRef, (s) => s.context.dragCurrentPoint);
  const dragAltKey = useSelector(actorRef, (s) => s.context.dragAltKey);

  const currentState = useSelector(actorRef, (s) => s.value as string);
  const isDrawing = isDrawingState(currentState);
  const isEditingPoint = currentState === 'editingPoint';

  const commitEntity = useCallback(
    (state: string, points: LngLat[], anchors: BezierAnchor[]) => {
      if ((state === 'drawPolyline' || state === 'drawCatmullRom') && points.length >= 2) {
        const entityType = state === 'drawPolyline' ? 'polyline' : 'catmullRom';
        addEntity({
          id: `${entityType}_${nanoid(12)}`,
          entityType,
          points: points.map(([x, y]) => ({ x, y })),
        } as PolylineEntity | CatmullRomEntity);
      } else if (state === 'drawBezier' && anchors.length >= 2) {
        const entity: BezierEntity = {
          id: `bezier_${nanoid(12)}`,
          entityType: 'bezier',
          anchors: anchors.map(anchorToData),
        };
        addEntity(entity);
      } else if (state === 'drawArc' && points.length >= 3) {
        const entity: ArcEntity = {
          id: `arc_${nanoid(12)}`,
          entityType: 'arc',
          start: { x: points[0][0], y: points[0][1] },
          mid: { x: points[1][0], y: points[1][1] },
          end: { x: points[2][0], y: points[2][1] },
        };
        addEntity(entity);
      }
    },
    [addEntity],
  );

  // 监听状态机回到 idle 时提交
  const prevStateRef = useRef<string>('idle');
  const prevPointsRef = useRef<LngLat[]>([]);
  const prevAnchorsRef = useRef<BezierAnchor[]>([]);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = currentState;
    prevPointsRef.current = drawPoints;
    prevAnchorsRef.current = bezierAnchors;

    if (currentState === 'idle' && isDrawingState(prev)) {
      commitEntity(prev, prevPointsRef.current, prevAnchorsRef.current);
    }
  }, [currentState, drawPoints, bezierAnchors, commitEntity]);

  // 初始化 MapLibre
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [116.4, 39.9],
      zoom: 15,
      doubleClickZoom: false,
    });

    map.on('load', () => {
      mapLoadedRef.current = true;

      // cold layer
      map.addSource('cold', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'cold-line',
        type: 'line',
        source: 'cold',
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      });
      map.addLayer({
        id: 'cold-vertices',
        type: 'circle',
        source: 'cold',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'role', 'vertex']],
        paint: {
          'circle-radius': 3.5,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      // hot layer
      map.addSource('hot', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'hot-line',
        type: 'line',
        source: 'hot',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': ['case', ['==', ['get', 'role'], 'handleLine'], '#ffffff', '#ff4444'],
          'line-width': ['case', ['==', ['get', 'role'], 'handleLine'], 1, 2.5],
          'line-dasharray': ['case', ['==', ['get', 'role'], 'handleLine'], ['literal', [3, 2]], ['literal', [1, 0]]],
        },
      });
      map.addLayer({
        id: 'hot-points',
        type: 'circle',
        source: 'hot',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': ['case', ['==', ['get', 'role'], 'handle'], 5, 7],
          'circle-color': ['case', ['==', ['get', 'role'], 'handle'], '#ffffff', '#ff4444'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      // overlay layer
      map.addSource('overlay', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'overlay-line',
        type: 'line',
        source: 'overlay',
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#ffcc00', 'line-width': 2, 'line-dasharray': [4, 3] },
      });
      map.addLayer({
        id: 'overlay-points',
        type: 'circle',
        source: 'overlay',
        filter: ['all', ['==', '$type', 'Point'], ['!=', 'role', 'handle']],
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffcc00',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'overlay-handles',
        type: 'circle',
        source: 'overlay',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'role', 'handle']],
        paint: {
          'circle-radius': 4,
          'circle-color': '#ff66cc',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({
        id: 'overlay-handle-lines',
        type: 'line',
        source: 'overlay',
        filter: ['==', 'role', 'handleLine'],
        paint: { 'line-color': '#ff66cc', 'line-width': 1, 'line-opacity': 0.6 },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
  }, []);

  // 事件拦截 → FSM
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const toLngLat = (e: maplibregl.MapMouseEvent): LngLat => [e.lngLat.lng, e.lngLat.lat];
    let mouseDownScreenPos: { x: number; y: number } | null = null;
    const CLICK_THRESHOLD = 5;

    const hitBbox = (point: maplibregl.PointLike): [maplibregl.PointLike, maplibregl.PointLike] => {
      const p = point as maplibregl.Point;
      return [[p.x - 8, p.y - 8], [p.x + 8, p.y + 8]];
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
          const pType = (props?.role === 'handle'
            ? props?.handleType as DragPointType
            : 'vertex') as DragPointType;

          if (altKey && pType === 'vertex') {
            const entityId = snap.context.selectedEntityId;
            if (entityId) {
              const entity = useMapStore.getState().entities.get(entityId);
              if (entity && entity.entityType === 'bezier') {
                useMapStore.getState().updateEntity(entityId, toggleSmooth(entity, idx));
              }
            }
            actorRef.send({ type: 'TOGGLE_SMOOTH', index: idx });
            return;
          }

          map.dragPan.disable();
          actorRef.send({ type: 'START_DRAG', index: idx, pointType: pType, altKey });
          return;
        }
      }

      if (state === 'editingPoint') return;

      if (snap.matches('drawBezier')) {
        actorRef.send({ type: 'MOUSE_DOWN', point: toLngLat(e) });
      }
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (mouseDownScreenPos) {
        const dx = e.point.x - mouseDownScreenPos.x;
        const dy = e.point.y - mouseDownScreenPos.y;
        if (Math.hypot(dx, dy) > CLICK_THRESHOLD) return;
      }

      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      if (state === 'editingPoint') return;

      if (state === 'selected') {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        if (hotHits.length > 0) return;

        const coldHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['cold-line', 'cold-vertices'] });
        if (coldHits.length > 0 && coldHits[0].properties?.id) {
          actorRef.send({ type: 'SELECT_ENTITY', id: coldHits[0].properties.id as string });
          return;
        }
        actorRef.send({ type: 'DESELECT' });
        return;
      }

      if (state === 'idle') {
        const coldHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['cold-line', 'cold-vertices'] });
        if (coldHits.length > 0 && coldHits[0].properties?.id) {
          actorRef.send({ type: 'SELECT_ENTITY', id: coldHits[0].properties.id as string });
          return;
        }
      }

      if (!snap.matches('drawBezier')) {
        actorRef.send({ type: 'MOUSE_DOWN', point: toLngLat(e) });
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
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
      actorRef.send({ type: 'DOUBLE_CLICK', point: toLngLat(e) });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actorRef.send({ type: 'CANCEL' });
      if (e.key === 'Enter') actorRef.send({ type: 'CONFIRM' });
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const snap = actorRef.getSnapshot();
        if (snap.value === 'selected' && snap.context.selectedEntityId) {
          const id = snap.context.selectedEntityId;
          actorRef.send({ type: 'DELETE_ENTITY' });
          useMapStore.getState().removeEntity(id);
        }
      }
    };

    map.on('mousedown', onMouseDown);
    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [actorRef]);

  // 更新 overlay（绘制中预览）
  useEffect(() => {
    if (!mapLoadedRef.current) return;
    const src = mapRef.current?.getSource('overlay') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!isDrawing) {
      src.setData(EMPTY_FC);
      return;
    }

    const features: GeoJSON.Feature[] = [];

    if (currentState === 'drawPolyline' || currentState === 'drawCatmullRom') {
      const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
      if (allPts.length >= 2) {
        const line = currentState === 'drawCatmullRom' ? catmullRom(allPts) : allPts;
        features.push(lineFeature(line));
      }
      for (const pt of drawPoints) features.push(pointFeature(pt, 'vertex'));
    } else if (currentState === 'drawBezier') {
      const anchors = bezierAnchors;
      const runtimeAnchors: BezierAnchor[] = anchors.map((a) => ({ ...a }));

      if (previewPoint && runtimeAnchors.length > 0) {
        const preview: BezierAnchor = { point: previewPoint, handleIn: null, handleOut: null };
        const withPreview = [...runtimeAnchors, preview];
        if (withPreview.length >= 2) features.push(lineFeature(cubicBezier(withPreview)));
      } else if (runtimeAnchors.length >= 2) {
        features.push(lineFeature(cubicBezier(runtimeAnchors)));
      }

      for (const a of runtimeAnchors) {
        features.push(pointFeature(a.point, 'vertex'));
        if (a.handleIn) {
          features.push(handleLineFeature(a.point, a.handleIn));
          features.push(pointFeature(a.handleIn, 'handle'));
        }
        if (a.handleOut) {
          features.push(handleLineFeature(a.point, a.handleOut));
          features.push(pointFeature(a.handleOut, 'handle'));
        }
      }
    } else if (currentState === 'drawArc') {
      const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
      for (const pt of drawPoints) features.push(pointFeature(pt, 'vertex'));
      if (allPts.length === 3) {
        features.push(lineFeature(threePointArc(allPts[0], allPts[1], allPts[2])));
      } else if (allPts.length === 2) {
        features.push(lineFeature(allPts));
      }
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [drawPoints, previewPoint, bezierAnchors, isDrawing, currentState]);

  // 更新 cold layer
  useEffect(() => {
    if (!mapLoadedRef.current) return;
    const src = mapRef.current?.getSource('cold') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = [];
    for (const entity of entities.values()) {
      if (entity.id === selectedEntityId) continue;
      const color = CURVE_COLORS[entity.entityType] ?? '#ffffff';
      features.push(...entityToColdFeatures(entity, color));
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [entities, selectedEntityId]);

  // 更新 hot layer
  useEffect(() => {
    if (!mapLoadedRef.current) return;
    const src = mapRef.current?.getSource('hot') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!selectedEntityId) {
      src.setData(EMPTY_FC);
      return;
    }

    const entity = entities.get(selectedEntityId);
    if (!entity) {
      src.setData(EMPTY_FC);
      return;
    }

    const displayEntity = (isEditingPoint && dragCurrentPoint && dragPointIndex >= 0)
      ? applyDrag(entity, dragPointIndex, dragPointType, dragCurrentPoint, dragAltKey)
      : entity;

    src.setData({ type: 'FeatureCollection', features: entityToHotFeatures(displayEntity) });
  }, [selectedEntityId, entities, isEditingPoint, dragCurrentPoint, dragPointIndex, dragPointType, dragAltKey]);

  // 光标
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    if (isEditingPoint) {
      canvas.style.cursor = 'grabbing';
    } else if (isDrawing) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }, [isDrawing, isEditingPoint]);

  // dragPan 控制（带 no-op guard）
  const dragPanDisabledRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const shouldDisable = isDraggingHandle || isEditingPoint || currentState === 'drawBezier';
    if (shouldDisable === dragPanDisabledRef.current) return;
    dragPanDisabledRef.current = shouldDisable;
    shouldDisable ? map.dragPan.disable() : map.dragPan.enable();
  }, [isDraggingHandle, isEditingPoint, currentState]);

  return <div ref={containerRef} className="w-full h-full" />;
}
