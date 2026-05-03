import type { JunctionEntity, LaneEntity } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';
import { METERS_PER_DEGREE } from '@/config/mapConstants';
import { curvePoints } from './apolloCompile/laneBoundaryGeometry';
import { SpatialIndex } from '@/core/elements/overlap/spatialIndex';
import { bboxOfPoints } from '@/core/elements/overlap/intersect';
import type { BBox } from '@/core/elements/overlap/types';

export const COORD_KEY_PRECISION = 6;
export const NEIGHBOR_QUERY_PADDING_M = 12;

export interface Endpoint {
  laneId: string;
  isStart: boolean;
  x: number;
  y: number;
}

export interface LocalFrame {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  ux: number;
  uy: number;
}

export interface LaneGeometry {
  start: GeoPoint;
  end: GeoPoint;
  centerline: GeoPoint[];
}

export interface JunctionPolygon {
  id: string;
  polygon: [number, number][];
  order: number;
}

export interface TopologyIndices {
  lanes: LaneEntity[];
  laneGeometry: Map<string, LaneGeometry>;
  frames: Map<string, LocalFrame>;
  startsByKey: Map<string, Endpoint[]>;
  endsByKey: Map<string, Endpoint[]>;
  junctionPolygons: JunctionPolygon[];
  junctionById: Map<string, JunctionPolygon>;
  junctionIndex: SpatialIndex;
  lanesById: Map<string, LaneEntity>;
  laneIndex: SpatialIndex;
}

export function endpointKey(x: number, y: number): string {
  return `${x.toFixed(COORD_KEY_PRECISION)},${y.toFixed(COORD_KEY_PRECISION)}`;
}

export function buildLocalFrame(start: GeoPoint, end: GeoPoint): LocalFrame | null {
  const cosLat = Math.cos((start.y * Math.PI) / 180);
  const mPerLng = METERS_PER_DEGREE * cosLat;
  const ex = (end.x - start.x) * mPerLng;
  const ey = (end.y - start.y) * METERS_PER_DEGREE;
  const len = Math.hypot(ex, ey);
  if (len < 1e-3) return null;
  return { sx: 0, sy: 0, ex, ey, ux: ex / len, uy: ey / len };
}

function metersToLngDegrees(meters: number, latDeg: number): number {
  const cosLat = Math.max(0.01, Math.abs(Math.cos((latDeg * Math.PI) / 180)));
  return meters / (METERS_PER_DEGREE * cosLat);
}

export function paddedLaneBBoxFromBBox(bbox: BBox, refLat: number, paddingM: number): BBox {
  const dx = metersToLngDegrees(paddingM, refLat);
  const dy = paddingM / METERS_PER_DEGREE;
  return {
    minX: bbox.minX - dx,
    minY: bbox.minY - dy,
    maxX: bbox.maxX + dx,
    maxY: bbox.maxY + dy,
  };
}

export function geometryForLane(lane: LaneEntity): LaneGeometry | null {
  const centerline = curvePoints(lane.centralCurve);
  const start = centerline[0] ?? null;
  const end = centerline[centerline.length - 1] ?? null;
  if (!start || !end) return null;
  return { start, end, centerline };
}

function pushEndpoint(indices: Map<string, Endpoint[]>, ep: Endpoint): void {
  const key = endpointKey(ep.x, ep.y);
  const list = indices.get(key);
  if (list) list.push(ep);
  else indices.set(key, [ep]);
}

function collectEntities(entities: ReadonlyMap<string, MapEntity>) {
  const lanes: LaneEntity[] = [];
  const junctions: JunctionEntity[] = [];
  for (const e of entities.values()) {
    if (e.entityType === 'lane') lanes.push(e);
    else if (e.entityType === 'junction') junctions.push(e);
  }
  return { lanes, junctions };
}

function buildLaneIndices(lanes: readonly LaneEntity[]) {
  const laneGeometry = new Map<string, LaneGeometry>();
  const frames = new Map<string, LocalFrame>();
  const startsByKey = new Map<string, Endpoint[]>();
  const endsByKey = new Map<string, Endpoint[]>();

  for (const lane of lanes) {
    const geometry = geometryForLane(lane);
    if (!geometry) continue;
    laneGeometry.set(lane.id, geometry);
    pushEndpoint(startsByKey, {
      laneId: lane.id,
      isStart: true,
      x: geometry.start.x,
      y: geometry.start.y,
    });
    pushEndpoint(endsByKey, {
      laneId: lane.id,
      isStart: false,
      x: geometry.end.x,
      y: geometry.end.y,
    });
    const frame = buildLocalFrame(geometry.start, geometry.end);
    if (frame) frames.set(lane.id, frame);
  }

  return { laneGeometry, frames, startsByKey, endsByKey };
}

function buildJunctionPolygons(junctions: readonly JunctionEntity[]): JunctionPolygon[] {
  return junctions.map((j, order) => ({
    id: j.id,
    polygon: j.polygon.points.map((p) => [p.x, p.y] as [number, number]),
    order,
  }));
}

export function buildTopologyIndices(entities: ReadonlyMap<string, MapEntity>): TopologyIndices {
  const { lanes, junctions } = collectEntities(entities);
  const laneParts = buildLaneIndices(lanes);
  const junctionPolygons = buildJunctionPolygons(junctions);
  const junctionById = new Map(junctionPolygons.map((junction) => [junction.id, junction]));
  const lanesById = new Map(lanes.map((lane) => [lane.id, lane]));

  const laneIndex = new SpatialIndex();
  laneIndex.build(new Map(lanes.map((lane) => [lane.id, lane])));
  const junctionIndex = new SpatialIndex();
  junctionIndex.build(new Map(junctions.map((junction) => [junction.id, junction])));

  return {
    lanes,
    junctionPolygons,
    junctionById,
    lanesById,
    laneIndex,
    junctionIndex,
    ...laneParts,
  };
}

function addEndpointPeers(indices: TopologyIndices, point: GeoPoint, affected: Set<string>) {
  const key = endpointKey(point.x, point.y);
  for (const ep of indices.startsByKey.get(key) ?? []) affected.add(ep.laneId);
  for (const ep of indices.endsByKey.get(key) ?? []) affected.add(ep.laneId);
}

function addSpatialLanePeers(
  indices: TopologyIndices,
  geometry: LaneGeometry,
  affected: Set<string>,
) {
  const bbox = bboxOfPoints(geometry.centerline);
  if (!bbox) return;
  const padded = paddedLaneBBoxFromBBox(bbox, geometry.start.y, NEIGHBOR_QUERY_PADDING_M);
  for (const node of indices.laneIndex.queryBBox(padded)) affected.add(node.id);
}

function addLanePeers(indices: TopologyIndices, lane: LaneEntity, affected: Set<string>) {
  affected.add(lane.id);
  const geometry = indices.laneGeometry.get(lane.id);
  if (!geometry) return;
  addEndpointPeers(indices, geometry.start, affected);
  addEndpointPeers(indices, geometry.end, affected);
  addSpatialLanePeers(indices, geometry, affected);
}

function addPreviousLanePeers(indices: TopologyIndices, lane: LaneEntity, affected: Set<string>) {
  affected.add(lane.id);
  const geometry = geometryForLane(lane);
  if (!geometry) return;
  addEndpointPeers(indices, geometry.start, affected);
  addEndpointPeers(indices, geometry.end, affected);
  addSpatialLanePeers(indices, geometry, affected);
}

function addJunctionLanePeers(
  indices: TopologyIndices,
  junction: JunctionEntity,
  affected: Set<string>,
) {
  const bbox = bboxOfPoints(junction.polygon.points);
  if (!bbox) return;
  for (const node of indices.laneIndex.queryBBox(bbox)) affected.add(node.id);
}

function junctionEntityFromPolygon(junction: JunctionPolygon): JunctionEntity {
  return {
    id: junction.id,
    entityType: 'junction',
    polygon: { points: junction.polygon.map(([x, y]) => ({ x, y })) },
    overlapIds: [],
  } as JunctionEntity;
}

export function collectAffectedLanes(
  indices: TopologyIndices,
  dirtyIds: ReadonlySet<string>,
  previousEntities?: ReadonlyMap<string, MapEntity>,
): Set<string> {
  const affected = new Set<string>();
  const dirtyJunctionIds = new Set<string>();

  for (const id of dirtyIds) {
    const current = indices.lanesById.get(id);
    const previous = previousEntities?.get(id);
    if (current) addLanePeers(indices, current, affected);
    if (previous?.entityType === 'lane') addPreviousLanePeers(indices, previous, affected);
    if (previous?.entityType === 'junction') {
      dirtyJunctionIds.add(previous.id);
      addJunctionLanePeers(indices, previous, affected);
    }
  }

  for (const id of dirtyIds) {
    const junction = indices.junctionById.get(id);
    if (!junction) continue;
    dirtyJunctionIds.add(id);
    addJunctionLanePeers(indices, junctionEntityFromPolygon(junction), affected);
  }

  if (dirtyJunctionIds.size > 0) {
    for (const lane of indices.lanes) {
      if (lane.junctionId && dirtyJunctionIds.has(lane.junctionId)) affected.add(lane.id);
    }
  }

  return affected;
}
