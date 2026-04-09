/**
 * Apollo HD Map TypeScript Type Definitions
 *
 * Generated from Apollo proto definitions at:
 *   modules/common_msgs/map_msgs/*.proto
 *   modules/common_msgs/basic_msgs/geometry.proto
 *
 * Proto source files are copied to: src/proto/
 */

import type { GeoPoint, BezierAnchorData } from './entities';

// Re-export for Apollo context
export type PointENU = GeoPoint;

/**
 * 编辑器扩展字段：保存原始绘制工具和锚点，
 * 使贝塞尔/圆弧/样条绘制的曲线元素在选中后仍可编辑原始控制柄
 */
export interface SourceDrawInfo {
  drawTool: string;
  anchors?: BezierAnchorData[];
  arcPoints?: [GeoPoint, GeoPoint, GeoPoint];
}

/** 编辑器扩展：保存矩形绘制参数以支持旋转编辑 */
export interface SourceRectInfo {
  p1: GeoPoint;
  p2: GeoPoint;
  rotation: number;
}

// ─── map_geometry.proto ──────────────────────────────────────────────

/** Polygon, not necessarily convex */
export interface ApolloPolygon {
  points: PointENU[];
}

/** Straight line segment */
export interface LineSegment {
  points: PointENU[];
}

/** Generalization of a line segment (oneof curve_type) */
export interface CurveSegment {
  lineSegment: LineSegment;
  /** start position (s-coordinate) */
  s: number;
  startPosition: PointENU;
  /** start orientation (radians) */
  heading: number;
  /** segment length (meters) */
  length: number;
}

/** An object similar to a line but that need not be straight */
export interface Curve {
  segments: CurveSegment[];
}

// ─── map_lane.proto ──────────────────────────────────────────────────

export type BoundaryLineType =
  | 'UNKNOWN'
  | 'DOTTED_YELLOW'
  | 'DOTTED_WHITE'
  | 'SOLID_YELLOW'
  | 'SOLID_WHITE'
  | 'DOUBLE_YELLOW'
  | 'CURB';

export interface LaneBoundaryTypeEntry {
  /** offset relative to the starting point of boundary */
  s: number;
  types: BoundaryLineType[];
}

export interface LaneBoundary {
  curve: Curve;
  length: number;
  /** indicate whether the lane boundary exists in real world */
  virtual?: boolean;
  /** in ascending order of s */
  boundaryType: LaneBoundaryTypeEntry[];
}

/** Association between central point to closest boundary */
export interface LaneSampleAssociation {
  s: number;
  width: number;
}

export type LaneType =
  | 'NONE'
  | 'CITY_DRIVING'
  | 'BIKING'
  | 'SIDEWALK'
  | 'PARKING'
  | 'SHOULDER'
  | 'SHARED';

export type LaneTurn =
  | 'NO_TURN'
  | 'LEFT_TURN'
  | 'RIGHT_TURN'
  | 'U_TURN';

export type LaneDirection =
  | 'FORWARD'
  | 'BACKWARD'
  | 'BIDIRECTION';

export interface LaneEntity {
  id: string;
  entityType: 'lane';

  // geometry
  centralCurve: Curve;
  leftBoundary: LaneBoundary;
  rightBoundary: LaneBoundary;
  length: number;

  // attributes
  type: LaneType;
  turn: LaneTurn;
  direction: LaneDirection;
  /** speed limit in m/s */
  speedLimit: number;

  // topology (flat ID references)
  predecessorIds: string[];
  successorIds: string[];
  leftNeighborForwardIds: string[];
  rightNeighborForwardIds: string[];
  leftNeighborReverseIds: string[];
  rightNeighborReverseIds: string[];
  selfReverseLaneIds: string[];
  junctionId: string | null;
  overlapIds: string[];

  // width samples
  leftSamples: LaneSampleAssociation[];
  rightSamples: LaneSampleAssociation[];
  leftRoadSamples: LaneSampleAssociation[];
  rightRoadSamples: LaneSampleAssociation[];

  /** 编辑器扩展：保存原始绘制信息以支持曲线编辑 */
  _source?: SourceDrawInfo;
}

// ─── map_junction.proto ──────────────────────────────────────────────

export type JunctionType =
  | 'UNKNOWN'
  | 'IN_ROAD'
  | 'CROSS_ROAD'
  | 'FORK_ROAD'
  | 'MAIN_SIDE'
  | 'DEAD_END';

export interface JunctionEntity {
  id: string;
  entityType: 'junction';
  polygon: ApolloPolygon;
  type: JunctionType;
  overlapIds: string[];
}

// ─── map_parking_space.proto ─────────────────────────────────────────

export interface ParkingSpaceEntity {
  id: string;
  entityType: 'parkingSpace';
  polygon: ApolloPolygon;
  heading: number;
  overlapIds: string[];
  _sourceRect?: SourceRectInfo;
}

export interface ParkingLotEntity {
  id: string;
  entityType: 'parkingLot';
  polygon: ApolloPolygon;
  overlapIds: string[];
}

// ─── map_signal.proto ────────────────────────────────────────────────

export type SubsignalType =
  | 'UNKNOWN_SUBSIGNAL'
  | 'CIRCLE'
  | 'ARROW_LEFT'
  | 'ARROW_FORWARD'
  | 'ARROW_RIGHT'
  | 'ARROW_LEFT_AND_FORWARD'
  | 'ARROW_RIGHT_AND_FORWARD'
  | 'ARROW_U_TURN';

export interface Subsignal {
  id: string;
  type: SubsignalType;
  location: PointENU;
}

export type SignInfoType =
  | 'None'
  | 'NO_RIGHT_TURN_ON_RED';

export interface SignInfo {
  type: SignInfoType;
}

export type SignalType =
  | 'UNKNOWN_SIGNAL'
  | 'MIX_2_HORIZONTAL'
  | 'MIX_2_VERTICAL'
  | 'MIX_3_HORIZONTAL'
  | 'MIX_3_VERTICAL'
  | 'SINGLE';

export interface SignalEntity {
  id: string;
  entityType: 'signal';
  boundary: ApolloPolygon;
  subsignals: Subsignal[];
  type: SignalType;
  overlapIds: string[];
  stopLines: Curve[];
  signInfo: SignInfo[];
  _source?: SourceDrawInfo;
}

// ─── map_crosswalk.proto ─────────────────────────────────────────────

export interface CrosswalkEntity {
  id: string;
  entityType: 'crosswalk';
  polygon: ApolloPolygon;
  overlapIds: string[];
  _sourceRect?: SourceRectInfo;
}

// ─── map_stop_sign.proto ─────────────────────────────────────────────

export type StopSignType =
  | 'UNKNOWN_STOP_SIGN'
  | 'ONE_WAY'
  | 'TWO_WAY'
  | 'THREE_WAY'
  | 'FOUR_WAY'
  | 'ALL_WAY';

export interface StopSignEntity {
  id: string;
  entityType: 'stopSign';
  stopLines: Curve[];
  type: StopSignType;
  overlapIds: string[];
  _source?: SourceDrawInfo;
}

// ─── map_speed_bump.proto ────────────────────────────────────────────

export interface SpeedBumpEntity {
  id: string;
  entityType: 'speedBump';
  position: Curve[];
  overlapIds: string[];
  _source?: SourceDrawInfo;
}

// ─── map_yield_sign.proto ────────────────────────────────────────────

export interface YieldSignEntity {
  id: string;
  entityType: 'yieldSign';
  stopLines: Curve[];
  overlapIds: string[];
  _source?: SourceDrawInfo;
}

// ─── map_clear_area.proto ────────────────────────────────────────────

export interface ClearAreaEntity {
  id: string;
  entityType: 'clearArea';
  polygon: ApolloPolygon;
  overlapIds: string[];
  _sourceRect?: SourceRectInfo;
}

// ─── map_road.proto ──────────────────────────────────────────────────

export interface BoundaryEdge {
  curve: Curve;
  type: 'UNKNOWN' | 'NORMAL' | 'LEFT_BOUNDARY' | 'RIGHT_BOUNDARY';
}

export interface BoundaryPolygon {
  edges: BoundaryEdge[];
}

export interface RoadBoundary {
  outerPolygon: BoundaryPolygon;
  holes: BoundaryPolygon[];
}

export interface RoadSection {
  id: string;
  laneIds: string[];
  boundary?: RoadBoundary;
}

export type RoadType =
  | 'UNKNOWN_ROAD'
  | 'HIGHWAY'
  | 'CITY_ROAD'
  | 'PARK';

export interface RoadEntity {
  id: string;
  entityType: 'road';
  sections: RoadSection[];
  junctionId: string | null;
  type: RoadType;
}

// ─── map_overlap.proto ───────────────────────────────────────────────

export interface LaneOverlapInfo {
  startS: number;
  endS: number;
  isMerge?: boolean;
  regionOverlapId?: string;
}

export interface RegionOverlapInfo {
  id: string;
  polygons: ApolloPolygon[];
}

export type ObjectOverlapInfo =
  | { objectType: 'lane'; objectId: string; laneOverlapInfo: LaneOverlapInfo }
  | { objectType: 'signal'; objectId: string }
  | { objectType: 'stopSign'; objectId: string }
  | { objectType: 'crosswalk'; objectId: string; regionOverlapId?: string }
  | { objectType: 'junction'; objectId: string }
  | { objectType: 'yieldSign'; objectId: string }
  | { objectType: 'clearArea'; objectId: string }
  | { objectType: 'speedBump'; objectId: string }
  | { objectType: 'parkingSpace'; objectId: string }
  | { objectType: 'pncJunction'; objectId: string }
  | { objectType: 'rsu'; objectId: string }
  | { objectType: 'area'; objectId: string }
  | { objectType: 'barrierGate'; objectId: string };

export interface OverlapEntity {
  id: string;
  entityType: 'overlap';
  objects: ObjectOverlapInfo[];
  regionOverlaps: RegionOverlapInfo[];
}

// ─── map_pnc_junction.proto ──────────────────────────────────────────

export type PassageType = 'UNKNOWN_PASSAGE' | 'ENTRANCE' | 'EXIT';

export interface Passage {
  id: string;
  signalIds: string[];
  yieldIds: string[];
  stopSignIds: string[];
  laneIds: string[];
  type: PassageType;
}

export interface PassageGroup {
  id: string;
  passages: Passage[];
}

export interface PNCJunctionEntity {
  id: string;
  entityType: 'pncJunction';
  polygon: ApolloPolygon;
  overlapIds: string[];
  passageGroups: PassageGroup[];
}

// ─── map_barrier_gate.proto ──────────────────────────────────────────

export type BarrierGateType =
  | 'ROD'
  | 'FENCE'
  | 'ADVERTISING'
  | 'TELESCOPIC'
  | 'OTHER';

export interface BarrierGateEntity {
  id: string;
  entityType: 'barrierGate';
  type: BarrierGateType;
  polygon: ApolloPolygon;
  stopLines: Curve[];
  overlapIds: string[];
  _source?: SourceDrawInfo;
}

// ─── map_rsu.proto ───────────────────────────────────────────────────

export interface RSUEntity {
  id: string;
  entityType: 'rsu';
  junctionId: string | null;
  overlapIds: string[];
}

// ─── map_area.proto ──────────────────────────────────────────────────

export type AreaType =
  | 'Driveable'
  | 'UnDriveable'
  | 'Custom1'
  | 'Custom2'
  | 'Custom3';

export interface AreaEntity {
  id: string;
  entityType: 'area';
  type: AreaType;
  polygon: ApolloPolygon;
  overlapIds: string[];
  name?: string;
}

// ─── map_speed_control.proto ─────────────────────────────────────────

export interface SpeedControlEntity {
  id: string;
  entityType: 'speedControl';
  name: string;
  polygon: ApolloPolygon;
  /** speed limit in m/s */
  speedLimit: number;
}

// ─── Apollo entity union & map ───────────────────────────────────────

/** All Apollo HD Map entity types */
export type ApolloEntity =
  | LaneEntity
  | JunctionEntity
  | ParkingSpaceEntity
  | ParkingLotEntity
  | SignalEntity
  | CrosswalkEntity
  | StopSignEntity
  | SpeedBumpEntity
  | YieldSignEntity
  | ClearAreaEntity
  | RoadEntity
  | OverlapEntity
  | PNCJunctionEntity
  | BarrierGateEntity
  | RSUEntity
  | AreaEntity
  | SpeedControlEntity;

/** All Apollo entity type discriminators */
export type ApolloEntityType = ApolloEntity['entityType'];

// ─── map.proto (top-level Map container) ─────────────────────────────

export interface MapProjection {
  /** PROJ.4 projection string */
  proj: string;
}

export interface MapHeader {
  version?: string;
  date?: string;
  projection?: MapProjection;
  district?: string;
  generation?: string;
  revMajor?: string;
  revMinor?: string;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  vendor?: string;
}

/** Top-level Apollo HD Map container — matches map.proto Map message */
export interface ApolloMapProto {
  header?: MapHeader;
  crosswalks: CrosswalkEntity[];
  junctions: JunctionEntity[];
  lanes: LaneEntity[];
  stopSigns: StopSignEntity[];
  signals: SignalEntity[];
  yieldSigns: YieldSignEntity[];
  overlaps: OverlapEntity[];
  clearAreas: ClearAreaEntity[];
  speedBumps: SpeedBumpEntity[];
  roads: RoadEntity[];
  parkingSpaces: ParkingSpaceEntity[];
  pncJunctions: PNCJunctionEntity[];
  rsus: RSUEntity[];
  areas: AreaEntity[];
  barrierGates: BarrierGateEntity[];
}
