import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import type { LaneEntity } from '@/types/apollo';
import { applyLaneConnection, planConnection } from '@/core/geometry/connectLanes';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';

type HitTest = (
  e: maplibregl.MapMouseEvent,
  filter?: (entityType: string) => boolean,
) => Promise<string | null>;

export function handleConnectModeClick(
  actorRef: ActorRefFrom<typeof editorMachine>,
  hitTest: HitTest,
  e: maplibregl.MapMouseEvent,
): boolean {
  if (!useUIStore.getState().connectMode.active) return false;

  hitTest(e, (t) => t === 'lane').then((hitId) => {
    const current = useUIStore.getState();
    if (!current.connectMode.active) return;
    if (!hitId) return;

    const entity = useMapStore.getState().entities.get(hitId);
    if (!entity || entity.entityType !== 'lane') return;

    if (!current.connectMode.firstLaneId) {
      useUIStore.getState().setConnectFirstLane(hitId);
      actorRef.send({ type: 'SELECT_ENTITY', id: hitId });
      return;
    }

    if (current.connectMode.firstLaneId === hitId) return;
    const source = useMapStore.getState().entities.get(current.connectMode.firstLaneId);
    if (!source || source.entityType !== 'lane') {
      useUIStore.getState().exitConnectMode();
      return;
    }

    try {
      const plan = planConnection(source as LaneEntity, entity as LaneEntity);
      if (plan) {
        const next = applyLaneConnection(source as LaneEntity, plan);
        useMapStore.getState().updateEntity(source.id, next);
      }
    } catch (err) {
      console.error('[connect] apply failed', err);
    } finally {
      useUIStore.getState().exitConnectMode();
      actorRef.send({ type: 'SELECT_ENTITY', id: source.id });
    }
  });

  return true;
}
