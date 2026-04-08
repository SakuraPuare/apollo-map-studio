import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSON } from 'geojson';
import { useSelector } from '@xstate/react';
import { nanoid } from 'nanoid';
import type { editorMachine } from '@/core/fsm/editorMachine';
import type { DragPointType } from '@/core/fsm/editorMachine';
import type { ActorRefFrom } from 'xstate';
import { useMapStore } from '@/store/mapStore';
import type { MapEntity, PolylineEntity, CatmullRomEntity, BezierEntity, ArcEntity } from '@/types/entities';
import { catmullRom, cubicBezier, threePointArc, type BezierAnchor } from '@/core/geometry/interpolate';

type LngLat = [number, number];

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

// 各曲线类型的颜色
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
  const activeTool = useSelector(actorRef, (s) => s.context.activeTool);
  const selectedEntityId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const dragPointIndex = useSelector(actorRef, (s) => s.context.dragPointIndex);
  const dragPointType = useSelector(actorRef, (s) => s.context.dragPointType);
  const dragCurrentPoint = useSelector(actorRef, (s) => s.context.dragCurrentPoint);
  const dragAltKey = useSelector(actorRef, (s) => s.context.dragAltKey);

  const isDrawing = useSelector(actorRef, (s) =>
    s.matches('drawPolyline') || s.matches('drawCatmullRom') ||
    s.matches('drawBezier') || s.matches('drawArc'),
  );
  const isEditingPoint = useSelector(actorRef, (s) => s.matches('editingPoint'));
  const currentState = useSelector(actorRef, (s) => s.value as string);

  // 提交实体到 store
  const commitEntity = useCallback(
    (state: string, points: LngLat[], anchors: BezierAnchor[]) => {
      if (state === 'drawPolyline' && points.length >= 2) {
        const entity: PolylineEntity = {
          id: `polyline_${nanoid(12)}`,
          entityType: 'polyline',
          points: points.map(([x, y]) => ({ x, y })),
        };
        addEntity(entity);
      } else if (state === 'drawCatmullRom' && points.length >= 2) {
        const entity: CatmullRomEntity = {
          id: `catmullRom_${nanoid(12)}`,
          entityType: 'catmullRom',
          points: points.map(([x, y]) => ({ x, y })),
        };
        addEntity(entity);
      } else if (state === 'drawBezier' && anchors.length >= 2) {
        const entity: BezierEntity = {
          id: `bezier_${nanoid(12)}`,
          entityType: 'bezier',
          anchors: anchors.map((a) => ({
            point: { x: a.point[0], y: a.point[1] },
            handleIn: a.handleIn ? { x: a.handleIn[0], y: a.handleIn[1] } : null,
            handleOut: a.handleOut ? { x: a.handleOut[0], y: a.handleOut[1] } : null,
          })),
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
    prevPointsRef.current = drawPoints;
  }, [drawPoints]);
  useEffect(() => {
    prevAnchorsRef.current = bezierAnchors;
  }, [bezierAnchors]);

  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev !== 'idle' && currentState === 'idle') {
      commitEntity(prev, prevPointsRef.current, prevAnchorsRef.current);
    }
    prevStateRef.current = currentState;
  }, [currentState, commitEntity]);

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

      // cold layer: 已完成的曲线
      map.addSource('cold', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'cold-line',
        type: 'line',
        source: 'cold',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
        },
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

      // hot layer: 选中实体的曲线 + 控制点
      map.addSource('hot', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'hot-line',
        type: 'line',
        source: 'hot',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': ['case',
            ['==', ['get', 'role'], 'handleLine'], '#ffffff',
            '#ff4444',
          ],
          'line-width': ['case',
            ['==', ['get', 'role'], 'handleLine'], 1,
            2.5,
          ],
          'line-dasharray': ['case',
            ['==', ['get', 'role'], 'handleLine'], ['literal', [3, 2]],
            ['literal', [1, 0]],
          ],
        },
      });
      map.addLayer({
        id: 'hot-points',
        type: 'circle',
        source: 'hot',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': ['case',
            ['==', ['get', 'role'], 'handle'], 5,
            7,
          ],
          'circle-color': ['case',
            ['==', ['get', 'role'], 'handle'], '#ffffff',
            '#ff4444',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      // overlay layer: 绘制中的预览
      map.addSource('overlay', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'overlay-line',
        type: 'line',
        source: 'overlay',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#ffcc00',
          'line-width': 2,
          'line-dasharray': [4, 3],
        },
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
      // 贝塞尔控制柄点
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
      // 贝塞尔控制柄连线
      map.addLayer({
        id: 'overlay-handle-lines',
        type: 'line',
        source: 'overlay',
        filter: ['==', 'role', 'handleLine'],
        paint: {
          'line-color': '#ff66cc',
          'line-width': 1,
          'line-opacity': 0.6,
        },
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

    // 记录 mousedown 屏幕坐标，用于区分点击和拖拽
    let mouseDownScreenPos: { x: number; y: number } | null = null;
    const CLICK_THRESHOLD = 5; // px

    // 扩大点击检测范围的 bbox
    const hitBbox = (point: maplibregl.PointLike): [maplibregl.PointLike, maplibregl.PointLike] => {
      const p = point as maplibregl.Point;
      return [[p.x - 8, p.y - 8], [p.x + 8, p.y + 8]];
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      mouseDownScreenPos = { x: e.point.x, y: e.point.y };
      const snap = actorRef.getSnapshot();
      const state = snap.value as string;
      const altKey = e.originalEvent.altKey;

      // selected: 检测是否点击了 hot 层控制点
      if (state === 'selected') {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        if (hotHits.length > 0) {
          const props = hotHits[0].properties;
          const idx = props?.index as number;
          const pType = (props?.role === 'handle'
            ? props?.handleType as DragPointType
            : 'vertex') as DragPointType;

          // Alt+点击 vertex → 切换尖角/平滑
          if (altKey && pType === 'vertex') {
            const entityId = snap.context.selectedEntityId;
            if (entityId) {
              const entity = useMapStore.getState().entities.get(entityId);
              if (entity && entity.entityType === 'bezier') {
                const updated = toggleSmooth(entity, idx);
                useMapStore.getState().updateEntity(entityId, updated);
              }
            }
            actorRef.send({ type: 'TOGGLE_SMOOTH', index: idx });
            return;
          }

          // 普通拖拽 / Alt+拖拽控制柄（cusp）
          map.dragPan.disable();
          actorRef.send({ type: 'START_DRAG', index: idx, pointType: pType, altKey });
          return;
        }
      }

      // editingPoint: 不处理 mousedown
      if (state === 'editingPoint') return;

      // 贝塞尔绘制模式（dragPan 已由 effect 禁用）
      if (snap.matches('drawBezier')) {
        actorRef.send({ type: 'MOUSE_DOWN', point: toLngLat(e) });
      }
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      // 区分拖拽和点击：如果鼠标移动超过阈值，视为拖拽，不处理 click
      if (mouseDownScreenPos) {
        const dx = e.point.x - mouseDownScreenPos.x;
        const dy = e.point.y - mouseDownScreenPos.y;
        if (Math.hypot(dx, dy) > CLICK_THRESHOLD) return;
      }

      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      // editingPoint 状态下不处理 click
      if (state === 'editingPoint') return;

      // selected 状态
      if (state === 'selected') {
        // 点击 hot 层控制点已在 mousedown 处理
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        if (hotHits.length > 0) return;

        // 点击 cold 层其他实体 → 切换选中
        const coldHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['cold-line', 'cold-vertices'] });
        if (coldHits.length > 0 && coldHits[0].properties?.id) {
          actorRef.send({ type: 'SELECT_ENTITY', id: coldHits[0].properties.id as string });
          return;
        }
        // 点击空白 → 取消选中
        actorRef.send({ type: 'DESELECT' });
        return;
      }

      // idle 状态：检测是否点击了已有实体
      if (state === 'idle') {
        const coldHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['cold-line', 'cold-vertices'] });
        if (coldHits.length > 0 && coldHits[0].properties?.id) {
          actorRef.send({ type: 'SELECT_ENTITY', id: coldHits[0].properties.id as string });
          return;
        }
      }

      // 绘制状态（非贝塞尔）
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

      // selected 状态：hover 时改变光标
      if (state === 'selected') {
        const hotHits = map.queryRenderedFeatures(hitBbox(e.point), { layers: ['hot-points'] });
        map.getCanvas().style.cursor = hotHits.length > 0 ? 'grab' : '';
      }

      actorRef.send({ type: 'MOUSE_MOVE', point: toLngLat(e) });
    };

    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      const snap = actorRef.getSnapshot();
      const state = snap.value as string;

      if (state === 'editingPoint') {
        map.dragPan.enable();
        const pt = toLngLat(e);
        // 直接提交修改到 store
        const entityId = snap.context.selectedEntityId;
        const idx = snap.context.dragPointIndex;
        const pType = snap.context.dragPointType;
        const alt = snap.context.dragAltKey;
        if (entityId) {
          const entity = useMapStore.getState().entities.get(entityId);
          if (entity) {
            const updated = applyDrag(entity, idx, pType, pt, alt);
            useMapStore.getState().updateEntity(entityId, updated);
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

    if (currentState === 'drawPolyline') {
      const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
      if (allPts.length >= 2) {
        features.push(lineFeature(allPts));
      }
      for (const pt of drawPoints) {
        features.push(pointFeature(pt, 'vertex'));
      }
    } else if (currentState === 'drawCatmullRom') {
      const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
      if (allPts.length >= 2) {
        const interpolated = catmullRom(allPts);
        features.push(lineFeature(interpolated));
      }
      for (const pt of drawPoints) {
        features.push(pointFeature(pt, 'vertex'));
      }
    } else if (currentState === 'drawBezier') {
      // 构建预览锚点列表
      const previewAnchors: BezierAnchor[] = [...bezierAnchors];
      if (previewPoint && !isDraggingHandle && bezierAnchors.length >= 1) {
        previewAnchors.push({ point: previewPoint, handleIn: null, handleOut: null });
      }
      if (previewAnchors.length >= 2) {
        const interpolated = cubicBezier(previewAnchors);
        features.push(lineFeature(interpolated));
      }
      // 锚点
      for (const a of bezierAnchors) {
        features.push(pointFeature(a.point, 'vertex'));
        // 控制柄
        if (a.handleOut) {
          features.push(pointFeature(a.handleOut, 'handle'));
          features.push(handleLineFeature(a.point, a.handleOut));
        }
        if (a.handleIn) {
          features.push(pointFeature(a.handleIn, 'handle'));
          features.push(handleLineFeature(a.point, a.handleIn));
        }
      }
    } else if (currentState === 'drawArc') {
      const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
      if (allPts.length === 2) {
        // 两点时画直线预览
        features.push(lineFeature(allPts));
      } else if (allPts.length >= 3) {
        const interpolated = threePointArc(allPts[0], allPts[1], allPts[2]);
        features.push(lineFeature(interpolated));
      }
      for (const pt of drawPoints) {
        features.push(pointFeature(pt, 'vertex'));
      }
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [drawPoints, previewPoint, bezierAnchors, isDraggingHandle, isDrawing, currentState]);

  // 更新 cold layer（已完成的曲线，排除选中实体）
  useEffect(() => {
    if (!mapLoadedRef.current) return;
    const src = mapRef.current?.getSource('cold') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = [];

    for (const entity of entities.values()) {
      if (entity.id === selectedEntityId) continue; // 选中的在 hot 层渲染
      const color = CURVE_COLORS[entity.entityType] ?? '#ffffff';

      if (entity.entityType === 'polyline') {
        const coords = entity.points.map((p): LngLat => [p.x, p.y]);
        features.push(lineFeature(coords, { color, id: entity.id }));
        for (const c of coords) features.push(pointFeature(c, 'vertex', { color, id: entity.id }));
      } else if (entity.entityType === 'catmullRom') {
        const controlPts = entity.points.map((p): LngLat => [p.x, p.y]);
        const interpolated = catmullRom(controlPts);
        features.push(lineFeature(interpolated, { color, id: entity.id }));
        for (const c of controlPts) features.push(pointFeature(c, 'vertex', { color, id: entity.id }));
      } else if (entity.entityType === 'bezier') {
        const anchors: BezierAnchor[] = entity.anchors.map((a) => ({
          point: [a.point.x, a.point.y] as LngLat,
          handleIn: a.handleIn ? [a.handleIn.x, a.handleIn.y] as LngLat : null,
          handleOut: a.handleOut ? [a.handleOut.x, a.handleOut.y] as LngLat : null,
        }));
        const interpolated = cubicBezier(anchors);
        features.push(lineFeature(interpolated, { color, id: entity.id }));
        for (const a of anchors) features.push(pointFeature(a.point, 'vertex', { color, id: entity.id }));
      } else if (entity.entityType === 'arc') {
        const p1: LngLat = [entity.start.x, entity.start.y];
        const p2: LngLat = [entity.mid.x, entity.mid.y];
        const p3: LngLat = [entity.end.x, entity.end.y];
        const interpolated = threePointArc(p1, p2, p3);
        features.push(lineFeature(interpolated, { color, id: entity.id }));
        features.push(pointFeature(p1, 'vertex', { color, id: entity.id }));
        features.push(pointFeature(p2, 'vertex', { color, id: entity.id }));
        features.push(pointFeature(p3, 'vertex', { color, id: entity.id }));
      }
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [entities, selectedEntityId]);

  // 更新 hot layer（选中实体 + 拖拽预览）
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

    // 如果正在拖拽，生成修改后的实体预览
    const displayEntity = (isEditingPoint && dragCurrentPoint && dragPointIndex >= 0)
      ? applyDrag(entity, dragPointIndex, dragPointType, dragCurrentPoint, dragAltKey)
      : entity;

    const features = entityToHotFeatures(displayEntity);
    src.setData({ type: 'FeatureCollection', features });
  }, [selectedEntityId, entities, isEditingPoint, dragCurrentPoint, dragPointIndex, dragPointType, dragAltKey]);

  // DELETE_ENTITY → 在 keydown handler 中直接处理
  // （FSM 只负责状态转换，实际删除在事件拦截中执行）

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

  // 拖拽时禁用地图拖拽（贝塞尔绘制 + 编辑拖拽）
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isDraggingHandle || isEditingPoint || currentState === 'drawBezier') {
      map.dragPan.disable();
    } else {
      map.dragPan.enable();
    }
  }, [isDraggingHandle, isEditingPoint, currentState]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// ─── GeoJSON helpers ────────────────────────────────────────

function lineFeature(coords: LngLat[], props: Record<string, unknown> = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { ...props },
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function pointFeature(coord: LngLat, role: string, props: Record<string, unknown> = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { role, ...props },
    geometry: { type: 'Point', coordinates: coord },
  };
}

function handleLineFeature(from: LngLat, to: LngLat): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { role: 'handleLine' },
    geometry: { type: 'LineString', coordinates: [from, to] },
  };
}

// ─── 选中态辅助函数 ────────────────────────────────────────

/** 将实体转为 hot 层 GeoJSON features（含可拖拽控制点） */
function entityToHotFeatures(entity: MapEntity): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];

  if (entity.entityType === 'polyline') {
    const coords = entity.points.map((p): LngLat => [p.x, p.y]);
    features.push(lineFeature(coords));
    coords.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
  } else if (entity.entityType === 'catmullRom') {
    const controlPts = entity.points.map((p): LngLat => [p.x, p.y]);
    const interpolated = catmullRom(controlPts);
    features.push(lineFeature(interpolated));
    controlPts.forEach((c, i) => features.push(pointFeature(c, 'vertex', { index: i })));
  } else if (entity.entityType === 'bezier') {
    const anchors: BezierAnchor[] = entity.anchors.map((a) => ({
      point: [a.point.x, a.point.y] as LngLat,
      handleIn: a.handleIn ? [a.handleIn.x, a.handleIn.y] as LngLat : null,
      handleOut: a.handleOut ? [a.handleOut.x, a.handleOut.y] as LngLat : null,
    }));
    if (anchors.length >= 2) {
      const interpolated = cubicBezier(anchors);
      features.push(lineFeature(interpolated));
    }
    anchors.forEach((a, i) => {
      features.push(pointFeature(a.point, 'vertex', { index: i }));
      if (a.handleOut) {
        features.push(pointFeature(a.handleOut, 'handle', { index: i, handleType: 'handleOut' }));
        features.push(handleLineFeature(a.point, a.handleOut));
      }
      if (a.handleIn) {
        features.push(pointFeature(a.handleIn, 'handle', { index: i, handleType: 'handleIn' }));
        features.push(handleLineFeature(a.point, a.handleIn));
      }
    });
  } else if (entity.entityType === 'arc') {
    const p1: LngLat = [entity.start.x, entity.start.y];
    const p2: LngLat = [entity.mid.x, entity.mid.y];
    const p3: LngLat = [entity.end.x, entity.end.y];
    const interpolated = threePointArc(p1, p2, p3);
    features.push(lineFeature(interpolated));
    features.push(pointFeature(p1, 'vertex', { index: 0 }));
    features.push(pointFeature(p2, 'vertex', { index: 1 }));
    features.push(pointFeature(p3, 'vertex', { index: 2 }));
  }

  return features;
}

/** Alt+点击锚点：尖角↔平滑切换 */
function toggleSmooth(entity: BezierEntity, index: number): BezierEntity {
  const anchors = entity.anchors.map((a) => ({ ...a }));
  const anchor = anchors[index];
  const hasHandles = anchor.handleIn !== null || anchor.handleOut !== null;

  if (hasHandles) {
    // 平滑 → 尖角：清除控制柄
    anchor.handleIn = null;
    anchor.handleOut = null;
  } else {
    // 尖角 → 平滑：根据相邻锚点自动生成控制柄
    const prev = index > 0 ? anchors[index - 1] : null;
    const next = index < anchors.length - 1 ? anchors[index + 1] : null;
    const px = anchor.point.x;
    const py = anchor.point.y;

    if (prev && next) {
      // 控制柄方向 = 相邻锚点连线方向，长度 = 距离的 1/3
      const dx = next.point.x - prev.point.x;
      const dy = next.point.y - prev.point.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const scale = len / 6; // 每侧 1/3 的一半
        const nx = dx / len;
        const ny = dy / len;
        anchor.handleOut = { x: px + nx * scale, y: py + ny * scale };
        anchor.handleIn = { x: px - nx * scale, y: py - ny * scale };
      }
    } else if (next) {
      // 首点：朝 next 方向
      const dx = next.point.x - px;
      const dy = next.point.y - py;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const scale = len / 3;
        anchor.handleOut = { x: px + (dx / len) * scale, y: py + (dy / len) * scale };
        anchor.handleIn = { x: px - (dx / len) * scale, y: py - (dy / len) * scale };
      }
    } else if (prev) {
      // 末点：朝 prev 反方向
      const dx = px - prev.point.x;
      const dy = py - prev.point.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const scale = len / 3;
        anchor.handleOut = { x: px + (dx / len) * scale, y: py + (dy / len) * scale };
        anchor.handleIn = { x: px - (dx / len) * scale, y: py - (dy / len) * scale };
      }
    }
  }

  anchors[index] = anchor;
  return { ...entity, anchors };
}

/** 对实体应用拖拽偏移，返回新实体（不修改原实体） */
function applyDrag(
  entity: MapEntity,
  index: number,
  pointType: DragPointType,
  newPoint: LngLat,
  altKey = false,
): MapEntity {
  if (entity.entityType === 'polyline') {
    const points = [...entity.points];
    points[index] = { ...points[index], x: newPoint[0], y: newPoint[1] };
    return { ...entity, points };
  }

  if (entity.entityType === 'catmullRom') {
    const points = [...entity.points];
    points[index] = { ...points[index], x: newPoint[0], y: newPoint[1] };
    return { ...entity, points };
  }

  if (entity.entityType === 'bezier') {
    const anchors = entity.anchors.map((a) => ({ ...a }));
    const anchor = { ...anchors[index] };

    if (pointType === 'vertex') {
      // 移动锚点时，控制柄跟随移动
      const dx = newPoint[0] - anchor.point.x;
      const dy = newPoint[1] - anchor.point.y;
      anchor.point = { x: newPoint[0], y: newPoint[1] };
      if (anchor.handleIn) {
        anchor.handleIn = { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy };
      }
      if (anchor.handleOut) {
        anchor.handleOut = { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy };
      }
    } else if (pointType === 'handleOut') {
      anchor.handleOut = { x: newPoint[0], y: newPoint[1] };
      if (!altKey) {
        // 默认：镜像联动 handleIn
        anchor.handleIn = {
          x: 2 * anchor.point.x - newPoint[0],
          y: 2 * anchor.point.y - newPoint[1],
        };
      }
      // Alt：cusp 模式，只动 handleOut，handleIn 不变
    } else if (pointType === 'handleIn') {
      anchor.handleIn = { x: newPoint[0], y: newPoint[1] };
      if (!altKey) {
        // 默认：镜像联动 handleOut
        anchor.handleOut = {
          x: 2 * anchor.point.x - newPoint[0],
          y: 2 * anchor.point.y - newPoint[1],
        };
      }
      // Alt：cusp 模式，只动 handleIn，handleOut 不变
    }

    anchors[index] = anchor;
    return { ...entity, anchors };
  }

  if (entity.entityType === 'arc') {
    const e = { ...entity };
    if (index === 0) e.start = { x: newPoint[0], y: newPoint[1] };
    else if (index === 1) e.mid = { x: newPoint[0], y: newPoint[1] };
    else if (index === 2) e.end = { x: newPoint[0], y: newPoint[1] };
    return e;
  }

  return entity;
}
