// Apollo HD Map types mirroring the protobuf definitions

export interface ApolloId {
  id: string
}

export interface PointENU {
  x: number // East
  y: number // North
  z: number // Up
}

export interface LineSegment {
  point: PointENU[]
}

export interface CurveSegment {
  lineSegment?: LineSegment
  s?: number
  startPosition?: PointENU
  heading?: number
  length?: number
}

export interface Curve {
  segment: CurveSegment[]
}

export interface Polygon {
  point: PointENU[]
}

// Lane types
export enum LaneType {
  NONE = 1,
  CITY_DRIVING = 2,
  BIKING = 3,
  SIDEWALK = 4,
  PARKING = 5,
  SHOULDER = 6,
  SHARED = 7,
}

export enum LaneTurn {
  NO_TURN = 1,
  LEFT_TURN = 2,
  RIGHT_TURN = 3,
  U_TURN = 4,
}

export enum LaneDirection {
  FORWARD = 1,
  BACKWARD = 2,
  BIDIRECTION = 3,
}

export enum BoundaryType {
  UNKNOWN = 0,
  DOTTED_YELLOW = 1,
  DOTTED_WHITE = 2,
  SOLID_YELLOW = 3,
  SOLID_WHITE = 4,
  DOUBLE_YELLOW = 5,
  CURB = 6,
}

export interface LaneBoundaryType {
  s: number
  types: BoundaryType[]
}

export interface LaneBoundary {
  curve: Curve
  length?: number
  virtual?: boolean
  boundaryType: LaneBoundaryType[]
}

export interface LaneSampleAssociation {
  s: number
  width: number
}

export interface ApolloLane {
  id: ApolloId
  centralCurve: Curve
  leftBoundary: LaneBoundary
  rightBoundary: LaneBoundary
  length: number
  speedLimit: number
  overlapId: ApolloId[]
  predecessorId: ApolloId[]
  successorId: ApolloId[]
  leftNeighborForwardLaneId: ApolloId[]
  rightNeighborForwardLaneId: ApolloId[]
  leftNeighborReverseLaneId: ApolloId[]
  rightNeighborReverseLaneId: ApolloId[]
  type: LaneType
  turn: LaneTurn
  direction: LaneDirection
  junctionId?: ApolloId
  leftSample: LaneSampleAssociation[]
  rightSample: LaneSampleAssociation[]
  leftRoadSample: LaneSampleAssociation[]
  rightRoadSample: LaneSampleAssociation[]
  selfReverseLaneId: ApolloId[]
}

// Road types
export enum RoadType {
  UNKNOWN = 0,
  HIGHWAY = 1,
  CITY_ROAD = 2,
  PARK = 3,
}

export interface BoundaryEdge {
  curve: Curve
  type: 0 | 1 | 2 | 3 // UNKNOWN, NORMAL, LEFT_BOUNDARY, RIGHT_BOUNDARY
}

export interface BoundaryPolygon {
  edge: BoundaryEdge[]
}

export interface RoadBoundary {
  outerPolygon: BoundaryPolygon
  hole: BoundaryPolygon[]
}

export interface RoadSection {
  id: ApolloId
  laneId: ApolloId[]
  boundary?: RoadBoundary
}

export interface ApolloRoad {
  id: ApolloId
  section: RoadSection[]
  junctionId?: ApolloId
  type: RoadType
}

// Junction
export interface ApolloJunction {
  id: ApolloId
  polygon: Polygon
  overlapId: ApolloId[]
}

// Signal
export enum SignalType {
  UNKNOWN = 1,
  MIX_2_HORIZONTAL = 2,
  MIX_2_VERTICAL = 3,
  MIX_3_HORIZONTAL = 4,
  MIX_3_VERTICAL = 5,
  SINGLE = 6,
}

export enum SubsignalType {
  UNKNOWN = 1,
  CIRCLE = 2,
  ARROW_LEFT = 3,
  ARROW_FORWARD = 4,
  ARROW_RIGHT = 5,
  ARROW_LEFT_AND_FORWARD = 6,
  ARROW_RIGHT_AND_FORWARD = 7,
  ARROW_U_TURN = 8,
}

export interface Subsignal {
  id: ApolloId
  type: SubsignalType
  location?: PointENU
}

export interface ApolloSignal {
  id: ApolloId
  boundary: Polygon
  subsignal: Subsignal[]
  overlapId: ApolloId[]
  type: SignalType
  stopLine: Curve[]
}

// StopSign
export enum StopSignType {
  UNKNOWN = 0,
  ONE_WAY = 1,
  TWO_WAY = 2,
  FOUR_WAY = 3,
}

export interface ApolloStopSign {
  id: ApolloId
  stopLine: Curve[]
  overlapId: ApolloId[]
  type: StopSignType
}

// Crosswalk
export interface ApolloCrosswalk {
  id: ApolloId
  polygon: Polygon
  overlapId: ApolloId[]
}

// ClearArea
export interface ApolloClearArea {
  id: ApolloId
  polygon: Polygon
  overlapId: ApolloId[]
}

// SpeedBump
export interface ApolloSpeedBump {
  id: ApolloId
  position: Curve[]
  overlapId: ApolloId[]
}

// ParkingSpace
export interface ApolloParkingSpace {
  id: ApolloId
  polygon: Polygon
  overlapId: ApolloId[]
  heading?: number
}

// Overlap
export interface LaneOverlapInfo {
  startS: number
  endS: number
  isMerge?: boolean
  regionOverlapId?: ApolloId
}

export interface ObjectOverlapInfo {
  id: ApolloId
  laneOverlapInfo?: LaneOverlapInfo
  signalOverlapInfo?: Record<string, never>
  stopSignOverlapInfo?: Record<string, never>
  crosswalkOverlapInfo?: { regionOverlapId?: ApolloId }
  junctionOverlapInfo?: Record<string, never>
  clearAreaOverlapInfo?: Record<string, never>
  speedBumpOverlapInfo?: Record<string, never>
  parkingSpaceOverlapInfo?: Record<string, never>
}

export interface ApolloOverlap {
  id: ApolloId
  object: ObjectOverlapInfo[]
}

// Header
export interface MapProjection {
  proj: string
}

export interface MapHeader {
  version?: string
  date?: string
  projection?: MapProjection
  district?: string
  left?: number
  top?: number
  right?: number
  bottom?: number
  vendor?: string
}

// Complete Map
export interface ApolloMap {
  header?: MapHeader
  crosswalk: ApolloCrosswalk[]
  junction: ApolloJunction[]
  lane: ApolloLane[]
  stopSign: ApolloStopSign[]
  signal: ApolloSignal[]
  overlap: ApolloOverlap[]
  clearArea: ApolloClearArea[]
  speedBump: ApolloSpeedBump[]
  road: ApolloRoad[]
  parkingSpace: ApolloParkingSpace[]
}
