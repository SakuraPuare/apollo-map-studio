import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '@/core/fsm/editorMachine';
import { isDrawingState } from '@/core/fsm/editorMachine';
import { catmullRom, cubicBezier, threePointArc, rectCorners, type BezierAnchor } from '@/core/geometry/interpolate';
import { lineFeature, pointFeature, handleLineFeature, polygonFeature } from '@/components/map/geoJsonHelpers';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function useOverlayLayer(
  mapRef: React.RefObject<maplibregl.Map | null>,
  mapLoadedRef: React.RefObject<boolean>,
  actorRef: ActorRefFrom<typeof editorMachine>,
) {
  const drawPoints = useSelector(actorRef, (s) => s.context.drawPoints);
  const previewPoint = useSelector(actorRef, (s) => s.context.previewPoint);
  const bezierAnchors = useSelector(actorRef, (s) => s.context.bezierAnchors);
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const isDrawing = isDrawingState(currentState);

  useEffect(() => {
    if (!mapLoadedRef.current) return;
    const src = mapRef.current?.getSource('overlay') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!isDrawing) {
      src.setData(EMPTY_FC);
      return;
    }

    const features: GeoJSON.Feature[] = [];

    if (currentState === 'drawPolyline' || currentState === 'drawCatmullRom') {
      const allPts = previewPoint ? [...drawPoints, previewPoint] : drawPoints;
      if (allPts.length >= 2) {
        const line = currentState === 'drawCatmullRom' ? catmullRom(allPts) : allPts;
        features.push(lineFeature(line));
      }
      for (const pt of drawPoints) features.push(pointFeature(pt, 'vertex'));
    } else if (currentState === 'drawBezier') {
      const runtimeAnchors: BezierAnchor[] = bezierAnchors.map((a) => ({ ...a }));

      if (previewPoint && runtimeAnchors.length > 0) {
        const preview: BezierAnchor = { point: previewPoint, handleIn: null, handleOut: null };
        const withPreview = [...runtimeAnchors, preview];
        if (withPreview.length >= 2) features.push(lineFeature(cubicBezier(withPreview)));
      } else if (runtimeAnchors.length >= 2) {
        features.push(lineFeature(cubicBezier(runtimeAnchors)));
      }

      for (const a of runtimeAnchors) {
        features.push(pointFeature(a.point, 'vertex'));
        if (a.handleIn) {
          features.push(handleLineFeature(a.point, a.handleIn));
          features.push(pointFeature(a.handleIn, 'handle'));
        }
        if (a.handleOut) {
          features.push(handleLineFeature(a.point, a.handleOut));
          features.push(pointFeature(a.handleOut, 'handle'));
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

    src.setData({ type: 'FeatureCollection', features });
  }, [drawPoints, previewPoint, bezierAnchors, isDrawing, currentState]);
}
