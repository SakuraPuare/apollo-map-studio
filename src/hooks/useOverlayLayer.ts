import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import {
  catmullRom,
  cubicBezier,
  threePointArc,
  rectCorners,
  rotatedRectFromPoints,
  type BezierAnchor,
} from '@/core/geometry/interpolate';
import { lineFeature, pointFeature, handleLineFeature, polygonFeature } from '@/lib/geoJsonHelpers';
import type { LngLat } from '@/core/geometry/interpolate';
import { useUIStore } from '@/store/uiStore';
import type { SnapTarget } from '@/core/geometry/snap';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export type OverlayRenderState = {
  currentState: string;
  drawPoints: LngLat[];
  previewPoint: LngLat | null;
  bezierAnchors: BezierAnchor[];
};

export function samePoint(a: LngLat | null, b: LngLat | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1];
}

export function sameOverlayRenderState(a: OverlayRenderState | null, b: OverlayRenderState) {
  return (
    !!a &&
    a.currentState === b.currentState &&
    a.drawPoints === b.drawPoints &&
    a.bezierAnchors === b.bezierAnchors &&
    samePoint(a.previewPoint, b.previewPoint)
  );
}

// Per-draw-state feature builders. Each one receives the render state and
// returns the GeoJSON features for that state. Splitting them out keeps each
// builder's complexity well below the lint threshold and makes the dispatch
// table the single source of truth for "which states render an overlay".
type OverlayBuilder = (state: OverlayRenderState) => GeoJSON.Feature[];

function withPreview(drawPoints: LngLat[], previewPoint: LngLat | null): LngLat[] {
  return previewPoint ? [...drawPoints, previewPoint] : drawPoints;
}

function vertexFeatures(drawPoints: LngLat[]): GeoJSON.Feature[] {
  return drawPoints.map((pt) => pointFeature(pt, 'vertex'));
}

function buildPolylineFeatures({
  drawPoints,
  previewPoint,
}: OverlayRenderState): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const allPts = withPreview(drawPoints, previewPoint);
  if (allPts.length >= 2) features.push(lineFeature(allPts));
  features.push(...vertexFeatures(drawPoints));
  return features;
}

function buildCatmullRomFeatures({
  drawPoints,
  previewPoint,
}: OverlayRenderState): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const allPts = withPreview(drawPoints, previewPoint);
  if (allPts.length >= 2) features.push(lineFeature(catmullRom(allPts)));
  features.push(...vertexFeatures(drawPoints));
  return features;
}

function bezierAnchorFeatures(anchors: BezierAnchor[]): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  for (const anchor of anchors) {
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
  return features;
}

function buildBezierFeatures({
  bezierAnchors,
  previewPoint,
}: OverlayRenderState): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const runtimeAnchors: BezierAnchor[] = bezierAnchors.map((anchor) => ({ ...anchor }));

  if (previewPoint && runtimeAnchors.length > 0) {
    const preview: BezierAnchor = { point: previewPoint, handleIn: null, handleOut: null };
    const withPreviewAnchors = [...runtimeAnchors, preview];
    if (withPreviewAnchors.length >= 2) {
      features.push(lineFeature(cubicBezier(withPreviewAnchors)));
    }
  } else if (runtimeAnchors.length >= 2) {
    features.push(lineFeature(cubicBezier(runtimeAnchors)));
  }

  features.push(...bezierAnchorFeatures(runtimeAnchors));
  return features;
}

function buildArcFeatures({ drawPoints, previewPoint }: OverlayRenderState): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = vertexFeatures(drawPoints);
  const allPts = withPreview(drawPoints, previewPoint);
  if (allPts.length === 3) {
    features.push(lineFeature(threePointArc(allPts[0]!, allPts[1]!, allPts[2]!)));
  } else if (allPts.length === 2) {
    features.push(lineFeature(allPts));
  }
  return features;
}

function buildRotatedRectFeatures({
  drawPoints,
  previewPoint,
}: OverlayRenderState): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = vertexFeatures(drawPoints);
  const allPts = withPreview(drawPoints, previewPoint);
  if (allPts.length === 3) {
    const r = rotatedRectFromPoints(allPts[0]!, allPts[1]!, allPts[2]!);
    features.push(polygonFeature(rectCorners(r.p1, r.p2, r.rotation)));
  } else if (allPts.length === 2) {
    // 显示主轴
    features.push(lineFeature([allPts[0]!, allPts[1]!]));
  } else if (allPts.length === 1 && previewPoint) {
    features.push(lineFeature([allPts[0]!, previewPoint]));
  }
  return features;
}

function buildPolygonFeatures({ drawPoints, previewPoint }: OverlayRenderState): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = vertexFeatures(drawPoints);
  const allPts = withPreview(drawPoints, previewPoint);
  if (allPts.length >= 3) {
    features.push(polygonFeature(allPts));
  } else if (allPts.length === 2) {
    features.push(lineFeature(allPts));
  }
  return features;
}

const OVERLAY_BUILDERS: Record<string, OverlayBuilder> = {
  drawPolyline: buildPolylineFeatures,
  drawCatmullRom: buildCatmullRomFeatures,
  drawBezier: buildBezierFeatures,
  drawArc: buildArcFeatures,
  drawRotatedRect: buildRotatedRectFeatures,
  drawPolygon: buildPolygonFeatures,
};

export function buildOverlayFeatures(renderState: OverlayRenderState): GeoJSON.Feature[] {
  const builder = OVERLAY_BUILDERS[renderState.currentState];
  return builder ? builder(renderState) : [];
}

function snapTargetFeatureCollection(target: SnapTarget): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          kind: target.kind,
          entityId: target.entityId,
          entityType: target.entityType,
        },
        geometry: { type: 'Point', coordinates: [target.point.x, target.point.y] },
      },
    ],
  };
}

function useSnapIndicatorLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
) {
  // Snap indicator — independent source so it can render outside draw
  // states (e.g. during vertex drag). Subscribes to `currentSnapTarget`
  // from the UI store; the store's setter dedupes identity churn so this
  // effect only runs on real snap state changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = (target: SnapTarget | null) => {
      if (!mapLoadedRef.current) return;
      const src = map.getSource('snap') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(target ? snapTargetFeatureCollection(target) : EMPTY_FC);
    };

    apply(useUIStore.getState().currentSnapTarget);
    const unsub = useUIStore.subscribe((s, prev) => {
      if (s.currentSnapTarget !== prev.currentSnapTarget) {
        apply(s.currentSnapTarget);
      }
    });

    return unsub;
  }, [mapLoadedRef, mapRef]);
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
  }, [actorRef, mapLoadedRef, mapRef]);

  useSnapIndicatorLayer(mapRef, mapLoadedRef);
}
