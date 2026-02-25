// Editor-internal types (GeoJSON-based, WGS84 coordinates)

import {
  BoundaryType,
  LaneDirection,
  LaneTurn,
  LaneType,
  RoadType,
  SignalType,
  StopSignType,
} from './apollo-map'
import type { Feature, LineString, Point, Polygon } from 'geojson'

export type DrawMode = 'select' | 'creating' | 'connect_lanes'

export interface LaneFeature {
  id: string
  type: 'lane'
  centerLine: Feature<LineString> // WGS84
  width: number // meters, default 3.75
  speedLimit: number // m/s
  laneType: LaneType
  turn: LaneTurn
  direction: LaneDirection
  leftBoundaryType: BoundaryType
  rightBoundaryType: BoundaryType
  predecessorIds: string[]
  successorIds: string[]
  leftNeighborIds: string[]
  rightNeighborIds: string[]
  junctionId?: string
  roadId?: string
}

export interface JunctionFeature {
  id: string
  type: 'junction'
  polygon: Feature<Polygon> // WGS84
}

export interface SignalFeature {
  id: string
  type: 'signal'
  position: Feature<Point> // WGS84 - center of signal
  stopLine: Feature<LineString> // WGS84
  signalType: SignalType
}

export interface StopSignFeature {
  id: string
  type: 'stop_sign'
  stopLine: Feature<LineString> // WGS84
  stopSignType: StopSignType
}

export interface CrosswalkFeature {
  id: string
  type: 'crosswalk'
  polygon: Feature<Polygon> // WGS84
}

export interface ClearAreaFeature {
  id: string
  type: 'clear_area'
  polygon: Feature<Polygon> // WGS84
}

export interface SpeedBumpFeature {
  id: string
  type: 'speed_bump'
  line: Feature<LineString> // WGS84
}

export interface ParkingSpaceFeature {
  id: string
  type: 'parking_space'
  polygon: Feature<Polygon> // WGS84
  heading?: number
}

export type MapElement =
  | LaneFeature
  | JunctionFeature
  | SignalFeature
  | StopSignFeature
  | CrosswalkFeature
  | ClearAreaFeature
  | SpeedBumpFeature
  | ParkingSpaceFeature

export interface ProjectConfig {
  name: string
  originLat: number
  originLon: number
  version: string
  date: string
}

export interface RoadDefinition {
  id: string
  name: string
  type: RoadType
}
