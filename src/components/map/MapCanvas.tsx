import { useRef, useEffect } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { SpatialWorkerBridge } from '@/core/workers/spatialBridge';
import { useMapLibreInit } from '@/hooks/useMapLibreInit';
import { useDrawCommit } from '@/hooks/useDrawCommit';
import { useMapEventRouter } from '@/hooks/useMapEventRouter';
import { useOverlayLayer } from '@/hooks/useOverlayLayer';
import { useColdLayer } from '@/hooks/useColdLayer';
import { useHotLayer } from '@/hooks/useHotLayer';
import { useGridLayer } from '@/hooks/useGridLayer';
import { useApolloLayer } from '@/hooks/useApolloLayer';
import { useScenarioLayer } from '@/hooks/useScenarioLayer';
import { useScenarioAuthoring } from '@/hooks/useScenarioAuthoring';
import { usePlaybackClock } from '@/hooks/usePlaybackClock';
import { useCursorManager } from '@/hooks/useCursorManager';
import { useDragPan } from '@/hooks/useDragPan';
import { useFocusEntity } from '@/hooks/useFocusEntity';

interface MapCanvasProps {
  actorRef: ActorRefFrom<typeof editorMachine>;
}

function ElectronE2EMapHarness() {
  return (
    <div className="w-full h-full bg-zinc-950" data-testid="map-canvas" aria-label="Map canvas">
      <div
        className="h-full w-full"
        data-testid="maplibre-canvas"
        data-map-ready="true"
        aria-hidden="true"
      />
    </div>
  );
}

function MapCanvasRuntime({ actorRef }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<SpatialWorkerBridge | null>(null);

  useEffect(() => {
    const bridge = new SpatialWorkerBridge();
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, []);

  const { mapRef, mapLoadedRef } = useMapLibreInit(containerRef);

  useDrawCommit(actorRef);
  useMapEventRouter(mapRef, actorRef, bridgeRef);
  useOverlayLayer(mapRef, mapLoadedRef, actorRef);
  useColdLayer(mapRef, mapLoadedRef, actorRef, bridgeRef);
  useHotLayer(mapRef, mapLoadedRef, actorRef);
  useGridLayer(mapRef, mapLoadedRef);
  useApolloLayer(mapRef, mapLoadedRef);
  useScenarioLayer(mapRef, mapLoadedRef);
  useScenarioAuthoring(mapRef, mapLoadedRef);
  usePlaybackClock();
  useCursorManager(mapRef, actorRef);
  useDragPan(mapRef, actorRef);
  useFocusEntity(mapRef, mapLoadedRef);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      data-testid="map-canvas"
      aria-label="Map canvas"
    />
  );
}

export function MapCanvas(props: MapCanvasProps) {
  if (import.meta.env.VITE_APOLLO_ELECTRON_E2E === '1') {
    return <ElectronE2EMapHarness />;
  }

  return <MapCanvasRuntime {...props} />;
}
