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

export function useDrawCommit(actorRef: ActorRefFrom<typeof editorMachine>) {
  const addEntity = useMapStore((s) => s.addEntity);
  const drawPoints = useSelector(actorRef, (s) => s.context.drawPoints);
  const bezierAnchors = useSelector(actorRef, (s) => s.context.bezierAnchors);
  const currentState = useSelector(actorRef, (s) => s.value as string);

  const commitEntity = useCallback(
    (state: string, points: LngLat[], anchors: BezierAnchor[]) => {
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

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = currentState;
    prevPointsRef.current = drawPoints;
    prevAnchorsRef.current = bezierAnchors;

    if (currentState === 'idle' && isDrawingState(prev)) {
      commitEntity(prev, prevPointsRef.current, prevAnchorsRef.current);
    }
  }, [currentState, drawPoints, bezierAnchors, commitEntity]);
}
