import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSON } from 'geojson';
import { useActorRef, useSelector } from '@xstate/react';
import { nanoid } from 'nanoid';
import { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import type { PolylineEntity } from '@/types/entities';

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/** 暗色空白底图 style */
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

interface MapCanvasProps {
  actorRef: ReturnType<typeof useActorRef<typeof editorMachine>>;
}

export function MapCanvas({ actorRef }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const addEntity = useMapStore((s) => s.addEntity);
  const entities = useMapStore((s) => s.entities);

  const drawPoints = useSelector(actorRef, (s) => s.context.drawPoints);
  const previewPoint = useSelector(actorRef, (s) => s.context.previewPoint);
  const isDrawing = useSelector(actorRef, (s) => s.matches('drawPolyline'));

  // 完成绘制 → 存入 store
  const commitPolyline = useCallback(
    (points: [number, number][]) => {
      if (points.length < 2) return;
      const entity: PolylineEntity = {
        id: `polyline_${nanoid(12)}`,
        entityType: 'polyline',
        points: points.map(([x, y]) => ({ x, y })),
      };
      addEntity(entity);
    },
    [addEntity],
  );

  // 监听状态机回到 idle 时提交
  const prevDrawingRef = useRef(false);
  useEffect(() => {
    if (prevDrawingRef.current && !isDrawing && drawPoints.length >= 2) {
      commitPolyline(drawPoints);
    }
    prevDrawingRef.current = isDrawing;
  }, [isDrawing, drawPoints, commitPolyline]);

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
      // cold layer: 已完成的多段线
      map.addSource('cold-polylines', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'cold-polyline-line',
        type: 'line',
        source: 'cold-polylines',
        paint: {
          'line-color': '#00d4ff',
          'line-width': 2,
        },
      });
      map.addLayer({
        id: 'cold-polyline-vertices',
        type: 'circle',
        source: 'cold-polylines',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': '#00d4ff',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      // overlay layer: 绘制中的预览
      map.addSource('overlay-draw', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'overlay-draw-line',
        type: 'line',
        source: 'overlay-draw',
        paint: {
          'line-color': '#ffcc00',
          'line-width': 2,
          'line-dasharray': [4, 3],
        },
      });
      map.addLayer({
        id: 'overlay-draw-points',
        type: 'circle',
        source: 'overlay-draw',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffcc00',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 事件拦截 → 发送给 FSM
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      actorRef.send({ type: 'MOUSE_DOWN', point: [e.lngLat.lng, e.lngLat.lat] });
    };
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      actorRef.send({ type: 'MOUSE_MOVE', point: [e.lngLat.lng, e.lngLat.lat] });
    };
    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      actorRef.send({ type: 'DOUBLE_CLICK', point: [e.lngLat.lng, e.lngLat.lat] });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actorRef.send({ type: 'CANCEL' });
      if (e.key === 'Enter') actorRef.send({ type: 'CONFIRM' });
    };

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [actorRef]);

  // 更新 overlay (绘制中预览) — 直接操作 MapLibre source，绕过 React
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource('overlay-draw') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!isDrawing || drawPoints.length === 0) {
      src.setData(EMPTY_FC);
      return;
    }

    const allPoints = previewPoint
      ? [...drawPoints, previewPoint]
      : drawPoints;

    const features: GeoJSON.Feature[] = [];

    // 线
    if (allPoints.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: allPoints,
        },
      });
    }

    // 已确认的节点
    for (const pt of drawPoints) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: pt },
      });
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [drawPoints, previewPoint, isDrawing]);

  // 更新 cold layer (已完成的多段线)
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource('cold-polylines') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = [];
    for (const entity of entities.values()) {
      if (entity.entityType !== 'polyline') continue;
      const coords = entity.points.map((p) => [p.x, p.y]);

      features.push({
        type: 'Feature',
        properties: { id: entity.id },
        geometry: { type: 'LineString', coordinates: coords },
      });

      // 顶点
      for (const coord of coords) {
        features.push({
          type: 'Feature',
          properties: { id: entity.id },
          geometry: { type: 'Point', coordinates: coord },
        });
      }
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [entities]);

  // 绘制模式下改变光标
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
    canvas.style.cursor = isDrawing ? 'crosshair' : '';
  }, [isDrawing]);

  return <div ref={containerRef} className="w-full h-full" />;
}
