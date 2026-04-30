/**
 * Convert a decoded Apollo HD-map (with PointENU coordinates already in
 * WGS84 lon/lat) into MapLibre-ready GeoJSON FeatureCollections — one
 * per visual category. Pure function, no DOM, no store dependency.
 *
 * The output is read-only: the editor's MapEntity store is not touched.
 * This keeps the round-trip path lossless (re-export uses the original
 * proto tree) while still letting the canvas show what was imported.
 */

interface PointLL {
  x: number;
  y: number;
  z?: number;
}

interface LineSegment {
  point?: PointLL[];
}

interface Curve {
  segment?: Array<{ line_segment?: LineSegment }>;
}

interface ApolloPolygon {
  point?: PointLL[];
}

interface RawId {
  id?: string;
}

interface RawLane {
  id?: RawId;
  central_curve?: Curve;
  left_boundary?: { curve?: Curve };
  right_boundary?: { curve?: Curve };
  type?: number;
  turn?: number;
}

interface RawCrosswalk {
  id?: RawId;
  polygon?: ApolloPolygon;
}

interface RawJunction {
  id?: RawId;
  polygon?: ApolloPolygon;
  type?: number;
}

interface RawRoad {
  id?: RawId;
  section?: Array<{
    boundary?: {
      outer_polygon?: {
        edge?: Array<{ curve?: Curve; type?: number }>;
      };
    };
  }>;
}

interface RawSignal {
  id?: RawId;
  boundary?: ApolloPolygon;
  stop_line?: Curve[];
  type?: number;
}

interface RawStopSign {
  id?: RawId;
  stop_line?: Curve[];
}

interface RawSpeedBump {
  id?: RawId;
  position?: Curve[];
}

interface RawClearArea {
  id?: RawId;
  polygon?: ApolloPolygon;
}

interface RawParkingSpace {
  id?: RawId;
  polygon?: ApolloPolygon;
}

interface RawApolloMap {
  lane?: RawLane[];
  crosswalk?: RawCrosswalk[];
  junction?: RawJunction[];
  road?: RawRoad[];
  signal?: RawSignal[];
  stop_sign?: RawStopSign[];
  speed_bump?: RawSpeedBump[];
  clear_area?: RawClearArea[];
  parking_space?: RawParkingSpace[];
}

/**
 * Walk every point reachable from a raw Apollo Map (lane curves, polygons,
 * road boundaries, signal stop lines, etc.) and return the WGS84 bounding
 * box. Used by ApolloLayer / mapIO to auto-fit the viewport on import,
 * even though the actual rendering goes through the cold layer.
 */
export function computeApolloMapBounds(
  map: RawApolloMap,
): [[number, number], [number, number]] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (p: PointLL | undefined) => {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  };
  const visitCurve = (c: Curve | undefined) => {
    for (const seg of c?.segment ?? []) {
      for (const pt of seg.line_segment?.point ?? []) visit(pt);
    }
  };
  const visitPolygon = (p: ApolloPolygon | undefined) => {
    for (const pt of p?.point ?? []) visit(pt);
  };

  for (const lane of map.lane ?? []) {
    visitCurve(lane.central_curve);
    visitCurve(lane.left_boundary?.curve);
    visitCurve(lane.right_boundary?.curve);
  }
  for (const cw of map.crosswalk ?? []) visitPolygon(cw.polygon);
  for (const j of map.junction ?? []) visitPolygon(j.polygon);
  for (const ca of map.clear_area ?? []) visitPolygon(ca.polygon);
  for (const ps of map.parking_space ?? []) visitPolygon(ps.polygon);
  for (const r of map.road ?? []) {
    for (const sec of r.section ?? []) {
      for (const e of sec.boundary?.outer_polygon?.edge ?? []) visitCurve(e.curve);
    }
  }
  for (const sig of map.signal ?? []) {
    visitPolygon(sig.boundary);
    for (const sl of sig.stop_line ?? []) visitCurve(sl);
  }
  for (const ss of map.stop_sign ?? []) for (const sl of ss.stop_line ?? []) visitCurve(sl);
  for (const sb of map.speed_bump ?? []) for (const c of sb.position ?? []) visitCurve(c);

  if (!Number.isFinite(minX)) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
