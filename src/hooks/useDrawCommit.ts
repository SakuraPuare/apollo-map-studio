import { useEffect } from 'react';
import { nanoid } from 'nanoid';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import type {
  PolylineEntity,
  CatmullRomEntity,
  BezierEntity,
  ArcEntity,
  RectEntity,
  PolygonEntity,
} from '@/types/entities';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { anchorToData } from '@/core/geometry/anchorConvert';
import { rotatedRectFromPoints } from '@/core/geometry/interpolate';
import { coordsToPoints, toGeoPoint } from '@/core/geometry/coords';
import { useMapStore } from '@/store/mapStore';
import type { MapElementType } from '@/core/elements';
import { createEntity as createApolloEntity } from '@/lib/entityOps';
import { useSettingsStore } from '@/store/settingsStore';

export function hasGeometryForState(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
): boolean {
  return (
    (state === 'drawBezier' && anchors.length >= 2) ||
    (state === 'drawArc' && points.length >= 3) ||
    (state === 'drawRotatedRect' && points.length >= 3) ||
    (state === 'drawPolygon' && points.length >= 3) ||
    ((state === 'drawPolyline' || state === 'drawCatmullRom') && points.length >= 2)
  );
}

function commitEntity(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
  element: MapElementType | null,
) {
  const addEntity = useMapStore.getState().addEntity;

  if (element) {
    if (hasGeometryForState(state, points, anchors)) {
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
      start: toGeoPoint(points[0]!),
      mid: toGeoPoint(points[1]!),
      end: toGeoPoint(points[2]!),
    } as ArcEntity);
  } else if (state === 'drawRotatedRect' && points.length >= 3) {
    const r = rotatedRectFromPoints(points[0]!, points[1]!, points[2]!);
    addEntity({
      id: `rect_${nanoid(12)}`,
      entityType: 'rect',
      p1: toGeoPoint(r.p1),
      p2: toGeoPoint(r.p2),
      rotation: r.rotation,
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
        // Read the POST-transition snapshot: transition actions (addPoint on the
        // trigger click) mutate context as part of the transition. prevSnapshot
        // was captured before the transition, so it's stale by exactly one
        // action — that's why drawArc / drawRotatedRect commit only by reading
        // the post-snapshot.
        commitEntity(
          prevState,
          snapshot.context.drawPoints,
          snapshot.context.bezierAnchors,
          snapshot.context.activeElement,
        );
        // commit 转移没带 resetDraw（否则 post-snapshot 就读不到 drawPoints 了），
        // 提交完后由这里发 RESET 把 activeElement / drawPoints / bezierAnchors
        // 清掉，避免 ToolStrip 元素高亮残留。
        actorRef.send({ type: 'RESET' });
      }

      prevSnapshot = snapshot;
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [actorRef]);
}
