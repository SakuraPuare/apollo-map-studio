import { useRef, useEffect, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { nanoid } from 'nanoid';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import type { PolylineEntity, CatmullRomEntity, BezierEntity, ArcEntity, RectEntity, PolygonEntity } from '@/types/entities';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { anchorToData } from '@/core/geometry/anchorConvert';
import { coordsToPoints, toGeoPoint } from '@/core/geometry/coords';
import { useMapStore } from '@/store/mapStore';
import type { MapElementType } from '@/core/elements';
import { createApolloEntity } from '@/core/geometry/apolloCompile';

export function useDrawCommit(actorRef: ActorRefFrom<typeof editorMachine>) {
  const addEntity = useMapStore((s) => s.addEntity);
  const drawPoints = useSelector(actorRef, (s) => s.context.drawPoints);
  const bezierAnchors = useSelector(actorRef, (s) => s.context.bezierAnchors);
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const activeElement = useSelector(actorRef, (s) => s.context.activeElement);

  const commitEntity = useCallback(
    (state: string, points: LngLat[], anchors: BezierAnchor[], element: MapElementType | null) => {
      // Apollo 元素模式：将绘制结果转为 Apollo 实体
      if (element) {
        const hasGeometry =
          (state === 'drawBezier' && anchors.length >= 2) ||
          (state === 'drawArc' && points.length >= 3) ||
          (state === 'drawRect' && points.length >= 2) ||
          (state === 'drawPolygon' && points.length >= 3) ||
          ((state === 'drawPolyline' || state === 'drawCatmullRom') && points.length >= 2);

        if (hasGeometry) {
          addEntity(createApolloEntity(element, state, points, anchors));
        }
        return;
      }

      // 基础几何模式（原有逻辑）
      if ((state === 'drawPolyline' || state === 'drawCatmullRom') && points.length >= 2) {
        const entityType = state === 'drawPolyline' ? 'polyline' : 'catmullRom';
        addEntity({
          id: `${entityType}_${nanoid(12)}`,
          entityType,
          points: coordsToPoints(points),
        } as PolylineEntity | CatmullRomEntity);
      } else if (state === 'drawBezier' && anchors.length >= 2) {
        addEntity({
          id: `bezier_${nanoid(12)}`,
          entityType: 'bezier',
          anchors: anchors.map(anchorToData),
        } as BezierEntity);
      } else if (state === 'drawArc' && points.length >= 3) {
        addEntity({
          id: `arc_${nanoid(12)}`,
          entityType: 'arc',
          start: toGeoPoint(points[0]),
          mid: toGeoPoint(points[1]),
          end: toGeoPoint(points[2]),
        } as ArcEntity);
      } else if (state === 'drawRect' && points.length >= 2) {
        addEntity({
          id: `rect_${nanoid(12)}`,
          entityType: 'rect',
          p1: toGeoPoint(points[0]),
          p2: toGeoPoint(points[1]),
          rotation: 0,
        } as RectEntity);
      } else if (state === 'drawPolygon' && points.length >= 3) {
        addEntity({
          id: `polygon_${nanoid(12)}`,
          entityType: 'polygon',
          points: coordsToPoints(points),
        } as PolygonEntity);
      }
    },
    [addEntity],
  );

  const prevStateRef = useRef<string>('idle');
  const prevPointsRef = useRef<LngLat[]>([]);
  const prevAnchorsRef = useRef<BezierAnchor[]>([]);
  const prevElementRef = useRef<MapElementType | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = currentState;
    prevPointsRef.current = drawPoints;
    prevAnchorsRef.current = bezierAnchors;
    prevElementRef.current = activeElement;

    if (currentState === 'idle' && isDrawingState(prev)) {
      commitEntity(prev, prevPointsRef.current, prevAnchorsRef.current, prevElementRef.current);
    }
  }, [currentState, drawPoints, bezierAnchors, activeElement, commitEntity]);
}
