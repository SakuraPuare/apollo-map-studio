import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { useMapStore } from '@/store/mapStore';
import { entityToHotFeatures } from '@/components/map/geoJsonHelpers';
import { applyDrag } from '@/components/map/entityMutations';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function useHotLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  const entities = useMapStore((s) => s.entities);
  const selectedEntityId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const dragPointIndex = useSelector(actorRef, (s) => s.context.dragPointIndex);
  const dragPointType = useSelector(actorRef, (s) => s.context.dragPointType);
  const dragCurrentPoint = useSelector(actorRef, (s) => s.context.dragCurrentPoint);
  const dragAltKey = useSelector(actorRef, (s) => s.context.dragAltKey);
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const isEditingPoint = currentState === 'editingPoint';

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

    const displayEntity = (isEditingPoint && dragCurrentPoint && (dragPointIndex >= 0 || dragPointType === 'rotate' || dragPointType === 'center'))
      ? applyDrag(entity, dragPointIndex, dragPointType, dragCurrentPoint, dragAltKey)
      : entity;

    src.setData({ type: 'FeatureCollection', features: entityToHotFeatures(displayEntity) });
  }, [selectedEntityId, entities, isEditingPoint, dragCurrentPoint, dragPointIndex, dragPointType, dragAltKey]);
}
