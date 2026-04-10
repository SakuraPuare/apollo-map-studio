import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import { catmullRom, cubicBezier, threePointArc, rectCorners, type BezierAnchor } from '@/core/geometry/interpolate';
import { lineFeature, pointFeature, handleLineFeature, polygonFeature } from '@/components/map/geoJsonHelpers';
import type { LngLat } from '@/core/geometry/interpolate';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

type OverlayRenderState = {
  currentState: string;
  drawPoints: LngLat[];
  previewPoint: LngLat | null;
  bezierAnchors: BezierAnchor[];
};

function samePoint(a: LngLat | null, b: LngLat | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1];
}

function sameOverlayRenderState(a: OverlayRenderState | null, b: OverlayRenderState) {
  return !!a
    && a.currentState === b.currentState
    && a.drawPoints === b.drawPoints
    && a.bezierAnchors === b.bezierAnchors
    && samePoint(a.previewPoint, b.previewPoint);
}

function buildOverlayFeatures(renderState: OverlayRenderState): GeoJSON.Feature[] {
  const { currentState, drawPoints, previewPoint, bezierAnchors } = renderState;
  const features: GeoJSON.Feature[] = [];

  if (currentState === 'drawPolyline' || currentState === 'drawCatmullRom') {
    const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
    if (allPts.length >= 2) {
      const line = currentState === 'drawCatmullRom' ? catmullRom(allPts) : allPts;
      features.push(lineFeature(line));
    }
    for (const pt of drawPoints) features.push(pointFeature(pt, 'vertex'));
  } else if (currentState === 'drawBezier') {
    const runtimeAnchors: BezierAnchor[] = bezierAnchors.map((anchor) => ({ ...anchor }));

    if (previewPoint && runtimeAnchors.length > 0) {
      const preview: BezierAnchor = { point: previewPoint, handleIn: null, handleOut: null };
      const withPreview = [...runtimeAnchors, preview];
      if (withPreview.length >= 2) features.push(lineFeature(cubicBezier(withPreview)));
    } else if (runtimeAnchors.length >= 2) {
      features.push(lineFeature(cubicBezier(runtimeAnchors)));
    }

    for (const anchor of runtimeAnchors) {
      features.push(pointFeature(anchor.point, 'vertex'));
      if (anchor.handleIn) {
        features.push(handleLineFeature(anchor.point, anchor.handleIn));
        features.push(pointFeature(anchor.handleIn, 'handle'));
      }
      if (anchor.handleOut) {
        features.push(handleLineFeature(anchor.point, anchor.handleOut));
        features.push(pointFeature(anchor.handleOut, 'handle'));
      }
    }
  } else if (currentState === 'drawArc') {
    const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
    for (const pt of drawPoints) features.push(pointFeature(pt, 'vertex'));
    if (allPts.length === 3) {
      features.push(lineFeature(threePointArc(allPts[0], allPts[1], allPts[2])));
    } else if (allPts.length === 2) {
      features.push(lineFeature(allPts));
    }
  } else if (currentState === 'drawRect') {
    const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
    for (const pt of drawPoints) features.push(pointFeature(pt, 'vertex'));
    if (allPts.length === 2) {
      features.push(polygonFeature(rectCorners(allPts[0], allPts[1], 0)));
    } else if (allPts.length === 1 && previewPoint) {
      features.push(lineFeature([allPts[0], previewPoint]));
    }
  } else if (currentState === 'drawPolygon') {
    const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
    for (const pt of drawPoints) features.push(pointFeature(pt, 'vertex'));
    if (allPts.length >= 3) {
      features.push(polygonFeature(allPts));
    } else if (allPts.length === 2) {
      features.push(lineFeature(allPts));
    }
  }

  return features;
}

export function useOverlayLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let frameId: number | null = null;
    let lastRenderState: OverlayRenderState | null = null;

    const renderOverlayLayer = () => {
      frameId = null;
      if (!mapLoadedRef.current) return;

      const src = map.getSource('overlay') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      const snapshot = actorRef.getSnapshot();
      const nextState: OverlayRenderState = {
        currentState: snapshot.value as string,
        drawPoints: snapshot.context.drawPoints,
        previewPoint: snapshot.context.previewPoint,
        bezierAnchors: snapshot.context.bezierAnchors,
      };

      if (sameOverlayRenderState(lastRenderState, nextState)) return;
      lastRenderState = nextState;

      if (!isDrawingState(nextState.currentState)) {
        src.setData(EMPTY_FC);
        return;
      }

      src.setData({
        type: 'FeatureCollection',
        features: buildOverlayFeatures(nextState),
      });
    };

    const scheduleRender = () => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(renderOverlayLayer);
    };

    const actorSubscription = actorRef.subscribe(scheduleRender);

    if (mapLoadedRef.current) {
      scheduleRender();
    } else {
      map.once('load', scheduleRender);
    }

    return () => {
      actorSubscription.unsubscribe();
      map.off('load', scheduleRender);
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [actorRef]);
}
