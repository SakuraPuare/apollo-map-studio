import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSON } from 'geojson';
import { useSelector } from '@xstate/react';
import { nanoid } from 'nanoid';
import type { editorMachine, DrawTool } from '@/core/fsm/editorMachine';
import type { ActorRefFrom } from 'xstate';
import { useMapStore } from '@/store/mapStore';
import type { PolylineEntity, CatmullRomEntity, BezierEntity, ArcEntity } from '@/types/entities';
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

  const isDrawing = useSelector(actorRef, (s) =>
    s.matches('drawPolyline') || s.matches('drawCatmullRom') ||
    s.matches('drawBezier') || s.matches('drawArc'),
  );
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

    // 贝塞尔模式需要 mousedown 来开始拖拽控制柄
    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      const snap = actorRef.getSnapshot();
      if (snap.matches('drawBezier')) {
        // 立即禁用地图拖拽，防止地图跟着动
        map.dragPan.disable();
        actorRef.send({ type: 'MOUSE_DOWN', point: toLngLat(e) });
      }
    };

    // 非贝塞尔模式用 click（mouseup 后触发，不会和地图拖拽冲突）
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const snap = actorRef.getSnapshot();
      if (!snap.matches('drawBezier')) {
        actorRef.send({ type: 'MOUSE_DOWN', point: toLngLat(e) });
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      actorRef.send({ type: 'MOUSE_MOVE', point: toLngLat(e) });
    };
    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      actorRef.send({ type: 'MOUSE_UP', point: toLngLat(e) });
    };
    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      actorRef.send({ type: 'DOUBLE_CLICK', point: toLngLat(e) });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actorRef.send({ type: 'CANCEL' });
      if (e.key === 'Enter') actorRef.send({ type: 'CONFIRM' });
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

  // 更新 cold layer（已完成的曲线）
  useEffect(() => {
    if (!mapLoadedRef.current) return;
    const src = mapRef.current?.getSource('cold') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = [];

    for (const entity of entities.values()) {
      const color = CURVE_COLORS[entity.entityType] ?? '#ffffff';

      if (entity.entityType === 'polyline') {
        const coords = entity.points.map((p): LngLat => [p.x, p.y]);
        features.push(lineFeature(coords, { color, id: entity.id }));
        for (const c of coords) features.push(pointFeature(c, 'vertex', { color }));
      } else if (entity.entityType === 'catmullRom') {
        const controlPts = entity.points.map((p): LngLat => [p.x, p.y]);
        const interpolated = catmullRom(controlPts);
        features.push(lineFeature(interpolated, { color, id: entity.id }));
        for (const c of controlPts) features.push(pointFeature(c, 'vertex', { color }));
      } else if (entity.entityType === 'bezier') {
        const anchors: BezierAnchor[] = entity.anchors.map((a) => ({
          point: [a.point.x, a.point.y] as LngLat,
          handleIn: a.handleIn ? [a.handleIn.x, a.handleIn.y] as LngLat : null,
          handleOut: a.handleOut ? [a.handleOut.x, a.handleOut.y] as LngLat : null,
        }));
        const interpolated = cubicBezier(anchors);
        features.push(lineFeature(interpolated, { color, id: entity.id }));
        for (const a of anchors) features.push(pointFeature(a.point, 'vertex', { color }));
      } else if (entity.entityType === 'arc') {
        const p1: LngLat = [entity.start.x, entity.start.y];
        const p2: LngLat = [entity.mid.x, entity.mid.y];
        const p3: LngLat = [entity.end.x, entity.end.y];
        const interpolated = threePointArc(p1, p2, p3);
        features.push(lineFeature(interpolated, { color, id: entity.id }));
        features.push(pointFeature(p1, 'vertex', { color }));
        features.push(pointFeature(p2, 'vertex', { color }));
        features.push(pointFeature(p3, 'vertex', { color }));
      }
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [entities]);

  // 光标
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    canvas.style.cursor = isDrawing ? 'crosshair' : '';
  }, [isDrawing]);

  // 贝塞尔拖拽时禁用地图拖拽
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isDraggingHandle) {
      map.dragPan.disable();
    } else {
      map.dragPan.enable();
    }
  }, [isDraggingHandle]);

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
