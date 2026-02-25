import type { MapInstance, OnCompleteCallback, OnCancelCallback, PrimitiveTool } from './types'
import { BasePrimitiveTool } from './BasePrimitiveTool'
import { PointTool } from './PointTool'
import { LineTool } from './LineTool'
import { BezierTool } from './BezierTool'
import { RotatableRectTool } from './RotatableRectTool'
import { PolygonTool } from './PolygonTool'

export { BasePrimitiveTool, addDrawingPreviewLayers } from './BasePrimitiveTool'
export { PointTool } from './PointTool'
export { LineTool } from './LineTool'
export { BezierTool } from './BezierTool'
export { RotatableRectTool } from './RotatableRectTool'
export { PolygonTool } from './PolygonTool'
export type {
  PrimitiveTool,
  PrimitiveResult,
  ToolMeta,
  CreationStep,
  ElementBlueprint,
  CreationSession,
} from './types'

type ToolConstructor = new (
  map: MapInstance,
  onComplete: OnCompleteCallback,
  onCancel: OnCancelCallback
) => BasePrimitiveTool

const TOOL_REGISTRY: Record<PrimitiveTool, ToolConstructor> = {
  point: PointTool,
  line: LineTool,
  bezier: BezierTool,
  rotatable_rect: RotatableRectTool,
  polygon: PolygonTool,
}

/** Create a primitive tool instance by tool type name */
export function createPrimitiveTool(
  toolType: PrimitiveTool,
  map: MapInstance,
  onComplete: OnCompleteCallback,
  onCancel: OnCancelCallback
): BasePrimitiveTool {
  const Ctor = TOOL_REGISTRY[toolType]
  return new Ctor(map, onComplete, onCancel)
}
