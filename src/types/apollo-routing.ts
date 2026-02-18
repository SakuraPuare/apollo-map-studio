// Apollo Routing Graph types mirroring topo_graph.proto

export interface CurvePoint {
  s: number
}

export interface CurveRange {
  start: CurvePoint
  end: CurvePoint
}

export enum EdgeDirection {
  FORWARD = 0,
  LEFT = 1,
  RIGHT = 2,
}

export interface TopoNode {
  laneId: string
  length: number
  leftOut: CurveRange[]
  rightOut: CurveRange[]
  cost: number
  centralCurve?: unknown // Curve from map_geometry
  isVirtual: boolean
  roadId: string
}

export interface TopoEdge {
  fromLaneId: string
  toLaneId: string
  cost: number
  directionType: EdgeDirection
}

export interface TopoGraph {
  hdmapVersion: string
  hdmapDistrict: string
  node: TopoNode[]
  edge: TopoEdge[]
}
