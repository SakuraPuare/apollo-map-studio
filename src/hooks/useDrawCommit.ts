import { useEffect } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import type { BezierAnchor, LngLat } from '@/core/geometry/interpolate';
import { useMapStore } from '@/store/mapStore';
import { isEntityTypeInteractive, useUIStore } from '@/store/uiStore';
import type { MapElementType } from '@/core/elements';
import { useSettingsStore } from '@/store/settingsStore';
import { createDrawnEntity, hasDrawableGeometry } from '@/core/mapEditingApi';

export function hasGeometryForState(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
): boolean {
  return hasDrawableGeometry(state, points, anchors);
}

function commitEntity(
  state: string,
  points: LngLat[],
  anchors: BezierAnchor[],
  element: MapElementType | null,
) {
  const { addEntity, entities } = useMapStore.getState();
  const { laneHalfWidth, laneSpeedLimit, laneBoundaryType } = useSettingsStore.getState();

  const entity = createDrawnEntity(state, points, anchors, element, {
    laneHalfWidth,
    laneSpeedLimit,
    laneBoundaryType,
    entities,
  });
  if (entity && isEntityTypeInteractive(useUIStore.getState().layerStates, entity.entityType)) {
    addEntity(entity);
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
