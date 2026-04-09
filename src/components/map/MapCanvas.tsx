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
import { useCursorManager } from '@/hooks/useCursorManager';
import { useDragPan } from '@/hooks/useDragPan';

interface MapCanvasProps {
  actorRef: ActorRefFrom<typeof editorMachine>;
}

export function MapCanvas({ actorRef }: MapCanvasProps) {
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
  useCursorManager(mapRef, actorRef);
  useDragPan(mapRef, actorRef);

  return <div ref={containerRef} className="w-full h-full" />;
}
