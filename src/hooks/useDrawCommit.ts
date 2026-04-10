import { useEffect } from 'react';
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
import { useSettingsStore } from '@/store/settingsStore';

function commitEntity(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
  element: MapElementType | null,
) {
  const addEntity = useMapStore.getState().addEntity;

  if (element) {
    const hasGeometry =
      (state === 'drawBezier' && anchors.length >= 2) ||
      (state === 'drawArc' && points.length >= 3) ||
      (state === 'drawRect' && points.length >= 2) ||
      (state === 'drawPolygon' && points.length >= 3) ||
      ((state === 'drawPolyline' || state === 'drawCatmullRom') && points.length >= 2);

    if (hasGeometry) {
      const { laneHalfWidth } = useSettingsStore.getState();
      addEntity(createApolloEntity(element, state, points, anchors, { laneHalfWidth }));
    }
    return;
  }

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
}

export function useDrawCommit(actorRef: ActorRefFrom<typeof editorMachine>) {
  useEffect(() => {
    let prevSnapshot = actorRef.getSnapshot();

    const subscription = actorRef.subscribe((snapshot) => {
      const prevState = prevSnapshot.value as string;
      const nextState = snapshot.value as string;

      if (nextState === 'idle' && isDrawingState(prevState)) {
        commitEntity(
          prevState,
          prevSnapshot.context.drawPoints,
          prevSnapshot.context.bezierAnchors,
          prevSnapshot.context.activeElement,
        );
      }

      prevSnapshot = snapshot;
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [actorRef]);
}
