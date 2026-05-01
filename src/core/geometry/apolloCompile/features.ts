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
import { curvePoints, explicitLaneBoundaryEdges } from './laneBoundaryGeometry';
import { offsetPolylineDeg } from './offsetPolyline';
import { computeSignalHeading, headingToIconRotate } from './signalHeading';

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

type EntityRenderer<E extends ApolloEntity = ApolloEntity> = (
  entity: E,
  base: Record<string, unknown>,
) => GeoJSON.Feature[];

type EntityOfType<T extends ApolloEntity['entityType']> = Extract<ApolloEntity, { entityType: T }>;

function renderLane(
  entity: EntityOfType<'lane'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const centerPts = curvePoints(entity.centralCurve);
  if (centerPts.length < 2) return features;
  const laneColor = laneTypeColor(entity.type);
  const laneBase: Record<string, unknown> = { ...base, color: laneColor };
  const leftW = entity.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
  const rightW = entity.rightSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;
  const explicitEdges = explicitLaneBoundaryEdges(entity);
  const leftEdge = explicitEdges?.left ?? offsetPolylineDeg(centerPts, leftW, 'left');
  const rightEdge = explicitEdges?.right ?? offsetPolylineDeg(centerPts, rightW, 'right');
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
  return features;
}

function renderJunction(
  entity: EntityOfType<'junction'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const coords = polygonToCoords(entity.polygon);
  if (coords.length < 3) return [];
  return [mkPolygon(coords, { ...base, fillOpacity: 0.35, lineWidth: 2 })];
}

function renderPncJunction(
  entity: EntityOfType<'pncJunction'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const coords = polygonToCoords(entity.polygon);
  if (coords.length < 3) return [];
  return [mkPolygon(coords, { ...base, fillOpacity: 0.2, lineWidth: 2, dashed: true })];
}

function renderParkingSpace(
  entity: EntityOfType<'parkingSpace'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const coords = polygonToCoords(entity.polygon);
  if (coords.length < 3) return [];
  return [
    mkPolygon(coords, { ...base, fillOpacity: 0.4, lineWidth: 1.5 }),
    mkPoint(centroid(coords), { ...base, role: 'label', icon: 'icon-parking', labelSize: 22 }),
  ];
}

function renderCrosswalk(
  entity: EntityOfType<'crosswalk'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const coords = polygonToCoords(entity.polygon);
  if (coords.length < 3) return [];
  return [mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 2.5 })];
}

function renderSignal(
  entity: EntityOfType<'signal'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  for (const curve of entity.stopLines) {
    const c = curveToCoords(curve);
    if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 4 }));
  }
  // Per Dreamview: heading derives from boundary plane normal +
  // stop-line orientation (boundary itself is metadata, not drawable).
  const headingRad = computeSignalHeading(entity);
  const iconRotate = headingRad != null ? headingToIconRotate(headingRad) : undefined;
  const labelProps: Record<string, unknown> = {
    ...base,
    role: 'label',
    icon: 'icon-signal',
    labelSize: 22,
    ...(iconRotate !== undefined ? { iconRotate } : {}),
  };
  const all = entity.stopLines.flatMap(curveToCoords);
  if (all.length > 0) {
    features.push(mkPoint(lineMid(all), labelProps));
  } else {
    // Imported signals sometimes ship only `boundary` (the 3D signal-head
    // hardware) with no stopLines. boundary is a 3D shape and meaningless
    // to render in 2D, but the entity must still be visible & selectable
    // — drop a label icon at the boundary centroid.
    const boundaryCoords = polygonToCoords(entity.boundary);
    if (boundaryCoords.length > 0) {
      features.push(mkPoint(centroid(boundaryCoords), labelProps));
    }
  }
  return features;
}

function renderClearArea(
  entity: EntityOfType<'clearArea'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const coords = polygonToCoords(entity.polygon);
  if (coords.length < 3) return [];
  return [mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 2 })];
}

function renderBarrierGate(
  entity: EntityOfType<'barrierGate'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  for (const curve of entity.stopLines) {
    const c = curveToCoords(curve);
    if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 5, dashed: true }));
  }
  const all = entity.stopLines.flatMap(curveToCoords);
  if (all.length > 0)
    features.push(
      mkPoint(lineMid(all), { ...base, role: 'label', icon: 'icon-barrier', labelSize: 20 }),
    );
  return features;
}

function renderArea(
  entity: EntityOfType<'area'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const coords = polygonToCoords(entity.polygon);
  if (coords.length < 3) return [];
  return [mkPolygon(coords, { ...base, fillOpacity: 0.25, lineWidth: 1.5 })];
}

function renderStopSign(
  entity: EntityOfType<'stopSign'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  for (const curve of entity.stopLines) {
    const c = curveToCoords(curve);
    if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 4 }));
  }
  const all = entity.stopLines.flatMap(curveToCoords);
  if (all.length > 0)
    features.push(
      mkPoint(lineMid(all), { ...base, role: 'label', icon: 'icon-stop', labelSize: 20 }),
    );
  return features;
}

function renderSpeedBump(
  entity: EntityOfType<'speedBump'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
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
  return features;
}

function renderYieldSign(
  entity: EntityOfType<'yieldSign'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  for (const curve of entity.stopLines) {
    const c = curveToCoords(curve);
    if (c.length >= 2) features.push(mkLine(c, { ...base, lineWidth: 3, dashed: true }));
  }
  const all = entity.stopLines.flatMap(curveToCoords);
  if (all.length > 0)
    features.push(
      mkPoint(lineMid(all), { ...base, role: 'label', icon: 'icon-yield', labelSize: 20 }),
    );
  return features;
}

function renderRoad(
  entity: EntityOfType<'road'>,
  base: Record<string, unknown>,
): GeoJSON.Feature[] {
  // Road geometry = section[].boundary.outer_polygon.edge[].curve, i.e.
  // the left/right shoulders of the asphalt. Lanes inside the road are
  // already drawn as their own LaneEntity, so the road only contributes
  // the outer boundary edges. Render as polylines (not fill) so they
  // don't compete visually with lanes; subtle dashed grey reads as
  // "context, not editable centerline".
  const features: GeoJSON.Feature[] = [];
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
  return features;
}

const RENDERERS: { [K in ApolloEntity['entityType']]?: EntityRenderer } = {
  lane: renderLane as EntityRenderer,
  junction: renderJunction as EntityRenderer,
  pncJunction: renderPncJunction as EntityRenderer,
  parkingSpace: renderParkingSpace as EntityRenderer,
  crosswalk: renderCrosswalk as EntityRenderer,
  signal: renderSignal as EntityRenderer,
  clearArea: renderClearArea as EntityRenderer,
  barrierGate: renderBarrierGate as EntityRenderer,
  area: renderArea as EntityRenderer,
  stopSign: renderStopSign as EntityRenderer,
  speedBump: renderSpeedBump as EntityRenderer,
  yieldSign: renderYieldSign as EntityRenderer,
  road: renderRoad as EntityRenderer,
};

export function compileApolloFeatures(entity: ApolloEntity): GeoJSON.Feature[] {
  const color = elementColor(entity.entityType) ?? '#ffffff';
  const base: Record<string, unknown> = { color, id: entity.id, entityType: entity.entityType };
  const renderer = RENDERERS[entity.entityType];
  return renderer ? renderer(entity, base) : [];
}
