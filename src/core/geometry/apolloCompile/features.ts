import {
  DEFAULT_LANE_HALF_WIDTH,
  LANE_CENTER_LINE_OPACITY,
  LANE_CENTER_LINE_WIDTH,
  LANE_EDGE_LINE_OPACITY,
  LANE_EDGE_LINE_WIDTH,
  LANE_FILL_OPACITY,
} from '@/config/mapConstants';
import type { LngLat } from '@/core/geometry/interpolate';
import { pointsToCoords, toLngLat } from '@/core/geometry/coords';
import { elementColor, laneTypeColor } from '@/core/elements';
import type { ApolloEntity, ApolloPolygon, Curve } from '@/types/apollo';
import { offsetPolylineDeg } from './offsetPolyline';

function curveToCoords(curve: Curve): LngLat[] {
  const coords: LngLat[] = [];
  for (const seg of curve.segments)
    for (const pt of seg.lineSegment.points) coords.push(toLngLat(pt));
  return coords;
}

function polygonToCoords(polygon: ApolloPolygon): LngLat[] {
  return pointsToCoords(polygon.points);
}

function centroid(coords: LngLat[]): LngLat {
  const n = coords.length;
  if (n === 0) return [0, 0];
  if (n < 3) {
    return [coords.reduce((s, c) => s + c[0], 0) / n, coords.reduce((s, c) => s + c[1], 0) / n];
  }
  const ox = coords[0]![0];
  const oy = coords[0]![1];
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const x0 = coords[i]![0] - ox;
    const y0 = coords[i]![1] - oy;
    const next = coords[(i + 1) % n]!;
    const x1 = next[0] - ox;
    const y1 = next[1] - oy;
    const cross = x0 * y1 - x1 * y0;
    area2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area2) < 1e-18) {
    return [coords.reduce((s, c) => s + c[0], 0) / n, coords.reduce((s, c) => s + c[1], 0) / n];
  }
  const factor = 1 / (3 * area2);
  return [cx * factor + ox, cy * factor + oy];
}

function lineMid(coords: LngLat[]): LngLat {
  if (coords.length === 0) return [0, 0];
  if (coords.length <= 2) {
    const a = coords[0]!;
    const b = coords[coords.length - 1]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  return coords[Math.floor(coords.length / 2)]!;
}

function mkLine(coords: LngLat[], props: Record<string, unknown>): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function mkPolygon(coords: LngLat[], props: Record<string, unknown>): GeoJSON.Feature {
  const first = coords[0];
  const last = coords[coords.length - 1];
  const ring =
    first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...coords, first] : coords;
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } };
}

function mkPoint(coord: LngLat, props: Record<string, unknown>): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coord } };
}

export function compileApolloFeatures(entity: ApolloEntity): GeoJSON.Feature[] {
  const color = elementColor(entity.entityType) ?? '#ffffff';
  const base: Record<string, unknown> = { color, id: entity.id, entityType: entity.entityType };
  const features: GeoJSON.Feature[] = [];

  switch (entity.entityType) {
    case 'lane': {
      const centerPts = entity.centralCurve.segments[0]?.lineSegment.points ?? [];
      if (centerPts.length < 2) break;
      const laneColor = laneTypeColor(entity.type);
      const laneBase: Record<string, unknown> = { ...base, color: laneColor };
      const leftW = entity.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
      const rightW = entity.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
      const leftEdge = offsetPolylineDeg(centerPts, leftW, 'left');
      const rightEdge = offsetPolylineDeg(centerPts, rightW, 'right');
      const polyCoords = [...leftEdge, ...[...rightEdge].reverse()].map(toLngLat);
      if (polyCoords.length >= 4) {
        features.push(
          mkPolygon(polyCoords, { ...laneBase, fillOpacity: LANE_FILL_OPACITY, noStroke: true }),
        );
      }
      features.push(
        mkLine(leftEdge.map(toLngLat), {
          ...laneBase,
          role: 'laneEdgeLeft',
          boundarySide: 'left',
          boundaryBase: true,
          noStroke: true,
          lineWidth: LANE_EDGE_LINE_WIDTH,
          lineOpacity: LANE_EDGE_LINE_OPACITY,
        }),
      );
      features.push(
        mkLine(rightEdge.map(toLngLat), {
          ...laneBase,
          role: 'laneEdgeRight',
          boundarySide: 'right',
          boundaryBase: true,
          noStroke: true,
          lineWidth: LANE_EDGE_LINE_WIDTH,
          lineOpacity: LANE_EDGE_LINE_OPACITY,
        }),
      );

      const centerCoords = pointsToCoords(centerPts);
      const reversedCoords = [...centerCoords].reverse();
      const centerProps = {
        color: '#ffffff',
        id: entity.id,
        entityType: entity.entityType,
        lineWidth: LANE_CENTER_LINE_WIDTH,
        lineOpacity: LANE_CENTER_LINE_OPACITY,
        dashed: true,
        role: 'laneCenter',
      };
      if (entity.direction === 'BIDIRECTION') {
        features.push(mkLine(centerCoords, { ...centerProps, laneDirection: 'forward' }));
        features.push(mkLine(reversedCoords, { ...centerProps, laneDirection: 'backward' }));
      } else {
        const dirCoords = entity.direction === 'BACKWARD' ? reversedCoords : centerCoords;
        features.push(
          mkLine(dirCoords, {
            ...centerProps,
            laneDirection: entity.direction === 'BACKWARD' ? 'backward' : 'forward',
          }),
        );
      }
      break;
    }

    case 'junction': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.35, lineWidth: 2 }));
      break;
    }

    case 'pncJunction': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.2, lineWidth: 2, dashed: true }));
      break;
    }

    case 'parkingSpace': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.4, lineWidth: 1.5 }));
      features.push(
        mkPoint(centroid(coords), { ...base, role: 'label', icon: 'icon-parking', labelSize: 22 }),
      );
      break;
    }

    case 'crosswalk': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 2.5 }));
      break;
    }

    case 'signal': {
      for (const curve of entity.stopLines) {
        const c = curveToCoords(curve);
        if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 4 }));
      }
      const all = entity.stopLines.flatMap(curveToCoords);
      if (all.length > 0) {
        features.push(
          mkPoint(lineMid(all), { ...base, role: 'label', icon: 'icon-signal', labelSize: 22 }),
        );
      } else {
        // Imported signals sometimes ship only `boundary` (the 3D signal-head
        // hardware) with no stopLines. boundary is a 3D shape and meaningless
        // to render in 2D, but the entity must still be visible & selectable
        // — drop a label icon at the boundary centroid.
        const boundaryCoords = polygonToCoords(entity.boundary);
        if (boundaryCoords.length > 0) {
          features.push(
            mkPoint(centroid(boundaryCoords), {
              ...base,
              role: 'label',
              icon: 'icon-signal',
              labelSize: 22,
            }),
          );
        }
      }
      // Subsignal bulbs — render each bulb as a small colored dot at its
      // xy projection. For vertical layouts the bulbs share xy and stack
      // visually as a single dot (which is fine, the icon already conveys
      // the signal location); for horizontal layouts they spread along
      // the box width so the user can see the actual layout. Color by
      // row position so red/yellow/green visually matches the 3-light
      // convention.
      const SUBSIGNAL_COLORS = ['#ff3b30', '#ffcc00', '#34c759']; // top → bottom
      const sortedByZ = [...entity.subsignals].sort(
        (a, b) => (b.location.z ?? 0) - (a.location.z ?? 0),
      );
      for (let i = 0; i < sortedByZ.length; i++) {
        const sub = sortedByZ[i]!;
        features.push(
          mkPoint([sub.location.x, sub.location.y], {
            ...base,
            role: 'subsignal',
            color: SUBSIGNAL_COLORS[i] ?? base.color,
            subsignalType: sub.type,
            radius: 3,
          }),
        );
      }
      break;
    }

    case 'clearArea': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 2 }));
      break;
    }

    case 'barrierGate': {
      for (const curve of entity.stopLines) {
        const c = curveToCoords(curve);
        if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 5, dashed: true }));
      }
      const all = entity.stopLines.flatMap(curveToCoords);
      if (all.length > 0)
        features.push(
          mkPoint(lineMid(all), { ...base, role: 'label', icon: 'icon-barrier', labelSize: 20 }),
        );
      break;
    }

    case 'area': {
      const coords = polygonToCoords(entity.polygon);
      if (coords.length < 3) break;
      features.push(mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 1.5 }));
      break;
    }

    case 'stopSign': {
      for (const curve of entity.stopLines) {
        const c = curveToCoords(curve);
        if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 4 }));
      }
      const all = entity.stopLines.flatMap(curveToCoords);
      if (all.length > 0)
        features.push(
          mkPoint(lineMid(all), { ...base, role: 'label', icon: 'icon-stop', labelSize: 20 }),
        );
      break;
    }

    case 'speedBump': {
      for (const curve of entity.position) {
        const c = curveToCoords(curve);
        if (c.length < 2) continue;
        features.push(mkLine(c, { ...base, lineWidth: 10, lineOpacity: 0.4, color: '#443300' }));
        features.push(mkLine(c, { ...base, lineWidth: 10, lineOpacity: 0.8, dashed: true }));
      }
      const all = entity.position.flatMap(curveToCoords);
      if (all.length > 0)
        features.push(
          mkPoint(lineMid(all), { ...base, role: 'label', icon: 'icon-speed-bump', labelSize: 20 }),
        );
      break;
    }

    case 'yieldSign': {
      for (const curve of entity.stopLines) {
        const c = curveToCoords(curve);
        if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 3, dashed: true }));
      }
      const all = entity.stopLines.flatMap(curveToCoords);
      if (all.length > 0)
        features.push(
          mkPoint(lineMid(all), { ...base, role: 'label', icon: 'icon-yield', labelSize: 20 }),
        );
      break;
    }

    case 'road': {
      // Road geometry = section[].boundary.outer_polygon.edge[].curve, i.e.
      // the left/right shoulders of the asphalt. Lanes inside the road are
      // already drawn as their own LaneEntity, so the road only contributes
      // the outer boundary edges. Render as polylines (not fill) so they
      // don't compete visually with lanes; subtle dashed grey reads as
      // "context, not editable centerline".
      for (const section of entity.sections) {
        const outer = section.boundary?.outerPolygon;
        if (!outer) continue;
        for (const edge of outer.edges) {
          const c = curveToCoords(edge.curve);
          if (c.length < 2) continue;
          features.push(
            mkLine(c, {
              ...base,
              color: '#888888',
              lineWidth: 1.5,
              lineOpacity: 0.7,
              dashed: true,
              role: 'roadBoundary',
              boundaryType: edge.type,
            }),
          );
        }
      }
      break;
    }
  }

  return features;
}
