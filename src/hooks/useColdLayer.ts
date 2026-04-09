import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import type { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import type { SerializedEntity } from '@/core/workers/protocol';

export function useColdLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
  bridgeRef: React.RefObject<SpatialWorkerBridge | null>,
) {
  const entities = useMapStore((s) => s.entities);
  const selectedEntityId = useSelector(actorRef, (s) => s.context.selectedEntityId);

  useEffect(() => {
    if (!mapLoadedRef.current) return;
    const src = mapRef.current?.getSource('cold') as maplibregl.GeoJSONSource | undefined;
    const bridge = bridgeRef.current;
    if (!src || !bridge) return;

    const serialized: SerializedEntity[] = [];
    for (const entity of entities.values()) {
      serialized.push(entity);
    }

    bridge.send({
      type: 'SYNC',
      entities: serialized,
      excludeId: selectedEntityId,
    }).then((result) => {
      if (result.type === 'COLD_READY') {
        src.setData(result.featureCollection);
      }
    }).catch(() => { /* Worker unavailable — cold layer stays stale */ });
  }, [entities, selectedEntityId]);
}
