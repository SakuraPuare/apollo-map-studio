import {
  DEFAULT_LANE_HALF_WIDTH,
  DEFAULT_LANE_SPEED_LIMIT_MPS,
  DEFAULT_LANE_BOUNDARY_TYPE,
  TURN_INFER_NO_TURN_RAD,
  TURN_INFER_U_TURN_RAD,
} from '@/config/mapConstants';
import { nextEntityId } from '@/lib/idGenerator';
import type { MapEntity } from '@/types/entities';
import type { LngLat, BezierAnchor } from '@/core/geometry/interpolate';
import {
  cubicBezier,
  threePointArc,
  catmullRom,
  rectCorners,
  rotatedRectFromPoints,
} from '@/core/geometry/interpolate';
import { coordsToPoints, toGeoPoint } from '@/core/geometry/coords';
import type { MapElementType } from '@/core/elements';
import { polylineLengthMeters } from '@/lib/geo';
import type {
  ApolloEntity,
  AreaEntity,
  BarrierGateEntity,
  ClearAreaEntity,
  CrosswalkEntity,
  JunctionEntity,
  LaneEntity,
  LaneTurn,
  PNCJunctionEntity,
  ParkingSpaceEntity,
  SignalEntity,
  SourceDrawInfo,
  SourceRectInfo,
  SpeedBumpEntity,
  StopSignEntity,
  YieldSignEntity,
} from '@/types/apollo';
import type { GeoPoint } from '@/types/entities';
import { anchorToData } from '@/core/geometry/anchorConvert';
import { pointsToCurve, pointsToPolygon } from './conversions';
import { projectPoint } from './projection';
import { buildSignalTemplate } from './signalTemplate';

interface DrawResult {
  drawTool: string;
  points: LngLat[];
  anchors: BezierAnchor[];
  laneHalfWidth?: number;
}

function extractLinePoints(draw: DrawResult): GeoPoint[] {
  if (draw.drawTool === 'drawBezier' && draw.anchors.length >= 2)
    return coordsToPoints(cubicBezier(draw.anchors));
  if (draw.drawTool === 'drawArc' && draw.points.length >= 3)
    return coordsToPoints(threePointArc(draw.points[0]!, draw.points[1]!, draw.points[2]!));
  if (draw.drawTool === 'drawCatmullRom' && draw.points.length >= 2)
    return coordsToPoints(catmullRom(draw.points));
  return coordsToPoints(draw.points);
}

function extractPolygonPoints(draw: DrawResult): GeoPoint[] {
  if (draw.drawTool === 'drawRotatedRect' && draw.points.length >= 3) {
    const r = rotatedRectFromPoints(draw.points[0]!, draw.points[1]!, draw.points[2]!);
    return coordsToPoints(rectCorners(r.p1, r.p2, r.rotation));
  }
  return coordsToPoints(draw.points);
}

function buildSourceInfo(d: DrawResult): SourceDrawInfo | undefined {
  if (d.drawTool === 'drawBezier' && d.anchors.length >= 2) {
    return { drawTool: d.drawTool, anchors: d.anchors.map(anchorToData) };
  }
  if (d.drawTool === 'drawArc' && d.points.length >= 3) {
    return {
      drawTool: d.drawTool,
      arcPoints: [toGeoPoint(d.points[0]!), toGeoPoint(d.points[1]!), toGeoPoint(d.points[2]!)],
    };
  }
  return undefined;
}

function buildRectInfo(d: DrawResult): SourceRectInfo | undefined {
  if (d.drawTool === 'drawRotatedRect' && d.points.length >= 3) {
    const r = rotatedRectFromPoints(d.points[0]!, d.points[1]!, d.points[2]!);
    return { p1: toGeoPoint(r.p1), p2: toGeoPoint(r.p2), rotation: r.rotation };
  }
  return undefined;
}

export function inferLaneTurn(centerPts: GeoPoint[]): LaneTurn {
  if (centerPts.length < 2) return 'NO_TURN';
  const midLat = centerPts.reduce((sum, p) => sum + p.y, 0) / centerPts.length;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const proj = centerPts.map((p) => projectPoint(p, cosLat));

  const start = proj[0]!;
  const afterStart = proj[1]!;
  const end = proj[proj.length - 1]!;
  const beforeEnd = proj[proj.length - 2]!;

  const startHeading = Math.atan2(afterStart.y - start.y, afterStart.x - start.x);
  const endHeading = Math.atan2(end.y - beforeEnd.y, end.x - beforeEnd.x);

  let delta = endHeading - startHeading;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;

  const absDelta = Math.abs(delta);
  if (absDelta < TURN_INFER_NO_TURN_RAD) return 'NO_TURN';
  if (absDelta >= TURN_INFER_U_TURN_RAD) return 'U_TURN';
  return delta > 0 ? 'LEFT_TURN' : 'RIGHT_TURN';
}

function createLane(id: string, d: DrawResult): LaneEntity {
  const source = buildSourceInfo(d);
  const hw = d.laneHalfWidth ?? DEFAULT_LANE_HALF_WIDTH;
  const centerPts = extractLinePoints(d);
  const seedBoundaryType = [{ s: 0, types: [DEFAULT_LANE_BOUNDARY_TYPE] }];
  return {
    id,
    entityType: 'lane',
    centralCurve: pointsToCurve(centerPts),
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: seedBoundaryType },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: seedBoundaryType },
    length: polylineLengthMeters(centerPts),
    type: 'CITY_DRIVING',
    turn: inferLaneTurn(centerPts),
    direction: 'FORWARD',
    speedLimit: DEFAULT_LANE_SPEED_LIMIT_MPS,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [{ s: 0, width: hw }],
    rightSamples: [{ s: 0, width: hw }],
    leftRoadSamples: [],
    rightRoadSamples: [],
    ...(source ? { _source: source } : {}),
  };
}

function createJunction(id: string, d: DrawResult): JunctionEntity {
  return {
    id,
    entityType: 'junction',
    polygon: pointsToPolygon(extractPolygonPoints(d)),
    type: 'CROSS_ROAD',
    overlapIds: [],
  };
}

function createPNCJunction(id: string, d: DrawResult): PNCJunctionEntity {
  return {
    id,
    entityType: 'pncJunction',
    polygon: pointsToPolygon(extractPolygonPoints(d)),
    overlapIds: [],
    passageGroups: [],
  };
}

function createParkingSpace(id: string, d: DrawResult): ParkingSpaceEntity {
  const rect = buildRectInfo(d);
  return {
    id,
    entityType: 'parkingSpace',
    polygon: pointsToPolygon(extractPolygonPoints(d)),
    heading: 0,
    overlapIds: [],
    ...(rect ? { _sourceRect: rect } : {}),
  };
}

function createCrosswalk(id: string, d: DrawResult): CrosswalkEntity {
  const rect = buildRectInfo(d);
  return {
    id,
    entityType: 'crosswalk',
    polygon: pointsToPolygon(extractPolygonPoints(d)),
    overlapIds: [],
    ...(rect ? { _sourceRect: rect } : {}),
  };
}

function createSignal(id: string, d: DrawResult): SignalEntity {
  const source = buildSourceInfo(d);
  const linePts = extractLinePoints(d);
  const type: SignalEntity['type'] = 'MIX_3_VERTICAL';
  let boundary = pointsToPolygon([]);
  let subsignals: SignalEntity['subsignals'] = [];
  if (linePts.length >= 2) {
    const first = linePts[0]!;
    const last = linePts[linePts.length - 1]!;
    const anchor: GeoPoint = {
      x: (first.x + last.x) / 2,
      y: (first.y + last.y) / 2,
    };
    const heading = Math.atan2(last.y - first.y, last.x - first.x);
    const tpl = buildSignalTemplate({ type, anchor, heading });
    boundary = tpl.boundary;
    subsignals = tpl.subsignals;
  }
  return {
    id,
    entityType: 'signal',
    boundary,
    subsignals,
    type,
    overlapIds: [],
    stopLines: [pointsToCurve(linePts)],
    signInfo: [],
    ...(source ? { _source: source } : {}),
  };
}

function createStopSign(id: string, d: DrawResult): StopSignEntity {
  const source = buildSourceInfo(d);
  return {
    id,
    entityType: 'stopSign',
    stopLines: [pointsToCurve(extractLinePoints(d))],
    type: 'ONE_WAY',
    overlapIds: [],
    ...(source ? { _source: source } : {}),
  };
}

function createSpeedBump(id: string, d: DrawResult): SpeedBumpEntity {
  const source = buildSourceInfo(d);
  return {
    id,
    entityType: 'speedBump',
    position: [pointsToCurve(extractLinePoints(d))],
    overlapIds: [],
    ...(source ? { _source: source } : {}),
  };
}

function createYieldSign(id: string, d: DrawResult): YieldSignEntity {
  const source = buildSourceInfo(d);
  return {
    id,
    entityType: 'yieldSign',
    stopLines: [pointsToCurve(extractLinePoints(d))],
    overlapIds: [],
    ...(source ? { _source: source } : {}),
  };
}

function createClearArea(id: string, d: DrawResult): ClearAreaEntity {
  const rect = buildRectInfo(d);
  return {
    id,
    entityType: 'clearArea',
    polygon: pointsToPolygon(extractPolygonPoints(d)),
    overlapIds: [],
    ...(rect ? { _sourceRect: rect } : {}),
  };
}

function createBarrierGate(id: string, d: DrawResult): BarrierGateEntity {
  const source = buildSourceInfo(d);
  return {
    id,
    entityType: 'barrierGate',
    type: 'ROD',
    polygon: pointsToPolygon([]),
    stopLines: [pointsToCurve(extractLinePoints(d))],
    overlapIds: [],
    ...(source ? { _source: source } : {}),
  };
}

function createArea(id: string, d: DrawResult): AreaEntity {
  return {
    id,
    entityType: 'area',
    type: 'Driveable',
    polygon: pointsToPolygon(extractPolygonPoints(d)),
    overlapIds: [],
  };
}

const FACTORY_MAP: Record<MapElementType, (id: string, d: DrawResult) => ApolloEntity> = {
  lane: createLane,
  junction: createJunction,
  pncJunction: createPNCJunction,
  parkingSpace: createParkingSpace,
  crosswalk: createCrosswalk,
  signal: createSignal,
  stopSign: createStopSign,
  speedBump: createSpeedBump,
  yieldSign: createYieldSign,
  clearArea: createClearArea,
  barrierGate: createBarrierGate,
  area: createArea,
};

export function createApolloEntity(
  elementType: MapElementType,
  drawTool: string,
  points: LngLat[],
  anchors: BezierAnchor[],
  options?: { laneHalfWidth?: number; entities?: ReadonlyMap<string, MapEntity> },
): ApolloEntity {
  const id = nextEntityId(elementType, options?.entities);
  return FACTORY_MAP[elementType](id, {
    drawTool,
    points,
    anchors,
    laneHalfWidth: options?.laneHalfWidth,
  });
}
