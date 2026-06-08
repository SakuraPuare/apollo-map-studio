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

interface RawYieldSign {
  id?: RawId;
  stop_line?: Curve[];
}

interface RawClearArea {
  id?: RawId;
  polygon?: ApolloPolygon;
}

interface RawParkingSpace {
  id?: RawId;
  polygon?: ApolloPolygon;
}

interface RawPNCJunction {
  id?: RawId;
  polygon?: ApolloPolygon;
}

interface RawArea {
  id?: RawId;
  polygon?: ApolloPolygon;
}

interface RawBarrierGate {
  id?: RawId;
  polygon?: ApolloPolygon;
  stop_line?: Curve[];
}

interface RawApolloMap {
  lane?: RawLane[];
  crosswalk?: RawCrosswalk[];
  junction?: RawJunction[];
  road?: RawRoad[];
  signal?: RawSignal[];
  stop_sign?: RawStopSign[];
  yield?: RawYieldSign[];
  speed_bump?: RawSpeedBump[];
  clear_area?: RawClearArea[];
  parking_space?: RawParkingSpace[];
  pnc_junction?: RawPNCJunction[];
  ad_area?: RawArea[];
  barrier_gate?: RawBarrierGate[];
}

interface BoundsAccumulator {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function visitPointBounds(bounds: BoundsAccumulator, p: PointLL | undefined): void {
  if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
  if (p.x < bounds.minX) bounds.minX = p.x;
  if (p.x > bounds.maxX) bounds.maxX = p.x;
  if (p.y < bounds.minY) bounds.minY = p.y;
  if (p.y > bounds.maxY) bounds.maxY = p.y;
}

function visitCurveBounds(bounds: BoundsAccumulator, c: Curve | undefined): void {
  for (const seg of c?.segment ?? []) {
    for (const pt of seg.line_segment?.point ?? []) visitPointBounds(bounds, pt);
  }
}

function visitPolygonBounds(bounds: BoundsAccumulator, p: ApolloPolygon | undefined): void {
  for (const pt of p?.point ?? []) visitPointBounds(bounds, pt);
}

function visitLaneBounds(bounds: BoundsAccumulator, lanes: RawLane[] = []): void {
  for (const lane of lanes) {
    visitCurveBounds(bounds, lane.central_curve);
    visitCurveBounds(bounds, lane.left_boundary?.curve);
    visitCurveBounds(bounds, lane.right_boundary?.curve);
  }
}

function visitRoadBounds(bounds: BoundsAccumulator, roads: RawRoad[] = []): void {
  for (const road of roads) {
    for (const section of road.section ?? []) {
      for (const edge of section.boundary?.outer_polygon?.edge ?? []) {
        visitCurveBounds(bounds, edge.curve);
      }
    }
  }
}

function visitSignalBounds(bounds: BoundsAccumulator, signals: RawSignal[] = []): void {
  for (const signal of signals) {
    visitPolygonBounds(bounds, signal.boundary);
    for (const stopLine of signal.stop_line ?? []) visitCurveBounds(bounds, stopLine);
  }
}

function visitStopLineEntityBounds(
  bounds: BoundsAccumulator,
  entities: Array<{ stop_line?: Curve[] }> = [],
): void {
  for (const entity of entities) {
    for (const stopLine of entity.stop_line ?? []) visitCurveBounds(bounds, stopLine);
  }
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
  const bounds: BoundsAccumulator = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  visitLaneBounds(bounds, map.lane);
  for (const crosswalk of map.crosswalk ?? []) visitPolygonBounds(bounds, crosswalk.polygon);
  for (const junction of map.junction ?? []) visitPolygonBounds(bounds, junction.polygon);
  for (const clearArea of map.clear_area ?? []) visitPolygonBounds(bounds, clearArea.polygon);
  for (const parkingSpace of map.parking_space ?? []) {
    visitPolygonBounds(bounds, parkingSpace.polygon);
  }
  for (const pncJunction of map.pnc_junction ?? []) visitPolygonBounds(bounds, pncJunction.polygon);
  for (const area of map.ad_area ?? []) visitPolygonBounds(bounds, area.polygon);
  for (const barrierGate of map.barrier_gate ?? []) {
    visitPolygonBounds(bounds, barrierGate.polygon);
    for (const stopLine of barrierGate.stop_line ?? []) visitCurveBounds(bounds, stopLine);
  }
  visitRoadBounds(bounds, map.road);
  visitSignalBounds(bounds, map.signal);
  visitStopLineEntityBounds(bounds, map.stop_sign);
  visitStopLineEntityBounds(bounds, map.yield);
  for (const speedBump of map.speed_bump ?? []) {
    for (const curve of speedBump.position ?? []) visitCurveBounds(bounds, curve);
  }

  if (!Number.isFinite(bounds.minX)) return null;
  return [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.maxY],
  ];
}
