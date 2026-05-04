/** 经纬度点 (WGS84) */
export interface GeoPoint {
  x: number; // longitude
  y: number; // latitude
  z?: number;
}

/** 贝塞尔锚点（存储用） */
export interface BezierAnchorData {
  point: GeoPoint;
  handleIn: GeoPoint | null;
  handleOut: GeoPoint | null;
}

/** 多段线实体 */
export interface PolylineEntity {
  id: string;
  entityType: 'polyline';
  points: GeoPoint[];
}

/** Catmull-Rom 样条实体 */
export interface CatmullRomEntity {
  id: string;
  entityType: 'catmullRom';
  points: GeoPoint[];
}

/** 贝塞尔曲线实体 */
export interface BezierEntity {
  id: string;
  entityType: 'bezier';
  anchors: BezierAnchorData[];
}

/** 圆弧实体（三点定弧） */
export interface ArcEntity {
  id: string;
  entityType: 'arc';
  start: GeoPoint;
  mid: GeoPoint;
  end: GeoPoint;
}

/** 可旋转矩形实体（两对角点 + 旋转角度） */
export interface RectEntity {
  id: string;
  entityType: 'rect';
  p1: GeoPoint; // 对角点1
  p2: GeoPoint; // 对角点2
  rotation: number; // 绕中心旋转角度（弧度）
}

/** 多边形实体 */
export interface PolygonEntity {
  id: string;
  entityType: 'polygon';
  points: GeoPoint[];
}

// ─── Apollo HD Map entity re-exports ─────────────────────────────────

export type {
  ApolloEntity,
  ApolloEntityType,
  ApolloMapProto,
  ApolloPolygon,
  AreaEntity,
  AreaType,
  BarrierGateEntity,
  BarrierGateType,
  BoundaryEdge,
  BoundaryPolygon,
  BoundaryLineType,
  ClearAreaEntity,
  CrosswalkEntity,
  Curve,
  CurveSegment,
  JunctionEntity,
  JunctionType,
  LaneBoundary,
  LaneBoundaryTypeEntry,
  LaneDirection,
  LaneEntity,
  LaneSampleAssociation,
  LaneTurn,
  LaneType,
  LineSegment,
  ObjectOverlapInfo,
  OverlapEntity,
  ParkingLotEntity,
  ParkingSpaceEntity,
  PNCJunctionEntity,
  RoadBoundary,
  RoadEntity,
  RoadSection,
  RoadType,
  RSUEntity,
  SignalEntity,
  SignalType,
  SpeedBumpEntity,
  SpeedControlEntity,
  StopSignEntity,
  StopSignType,
  Subsignal,
  SubsignalType,
  YieldSignEntity,
} from './apollo';

import type { ApolloEntity } from './apollo';

/** Drawing primitive entity types (geometry tools) */
export type DrawingEntity =
  | PolylineEntity
  | CatmullRomEntity
  | BezierEntity
  | ArcEntity
  | RectEntity
  | PolygonEntity;

/** All editable entity types — drawing primitives + Apollo HD map elements */
export type MapEntity = DrawingEntity | ApolloEntity;
