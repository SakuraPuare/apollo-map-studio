import type maplibregl from 'maplibre-gl'

export type PrimitiveTool = 'point' | 'line' | 'bezier' | 'rotatable_rect' | 'polygon'

export interface PrimitiveResult {
  tool: PrimitiveTool
  geometry: GeoJSON.Geometry
  meta: ToolMeta
}

export interface ToolMeta {
  tool: PrimitiveTool
  /** rotatable_rect: rotation angle in radians */
  rotation?: number
  /** rotatable_rect: width in meters */
  width?: number
  /** rotatable_rect: height in meters */
  height?: number
  /** bezier: anchor point coordinates [lng, lat][] */
  bezierAnchors?: [number, number][]
  /**
   * bezier: control point coordinates, 2 per segment.
   * For M segments: [cp1_out_0, cp1_in_1, cp2_out_1, cp2_in_2, ...]
   * Each is [lng, lat].
   */
  bezierControlPoints?: [number, number][]
}

export interface CreationStep {
  primitiveTool: PrimitiveTool
  prompt: string
  optional?: boolean
}

export interface ElementBlueprint {
  steps: CreationStep[]
  /** Alternative primitive tools for the first step */
  variants?: PrimitiveTool[]
}

export interface CreationSession {
  elementType: string
  steps: CreationStep[]
  currentStep: number
  results: PrimitiveResult[]
}

export type OnCompleteCallback = (result: PrimitiveResult) => void
export type OnCancelCallback = () => void

export type MapInstance = maplibregl.Map
