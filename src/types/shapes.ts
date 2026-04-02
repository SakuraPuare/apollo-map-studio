// Base shape types and element type registry for the drawing system.
// Shapes define HOW the user draws; element types define WHAT gets created.

export enum ShapeType {
  Point = 'point',
  Polyline = 'polyline',
  RotatableRect = 'rotatable_rect',
  Polygon = 'polygon',
  Curve = 'curve',
}

export enum ElementType {
  Lane = 'lane',
  Junction = 'junction',
  Crosswalk = 'crosswalk',
  ClearArea = 'clear_area',
  SpeedBump = 'speed_bump',
  ParkingSpace = 'parking_space',
  Signal = 'signal',
  StopSign = 'stop_sign',
}

export interface ShapeElementEntry {
  shape: ShapeType
  elementType: ElementType
  label: string
  shortcut?: string
  icon: string
}

export const SHAPE_ELEMENT_REGISTRY: ShapeElementEntry[] = [
  // Polyline shape → line-based elements
  {
    shape: ShapeType.Polyline,
    elementType: ElementType.Lane,
    label: 'Lane',
    shortcut: 'L',
    icon: 'lane',
  },
  {
    shape: ShapeType.Polyline,
    elementType: ElementType.Signal,
    label: 'Signal',
    shortcut: 'T',
    icon: 'signal',
  },
  {
    shape: ShapeType.Polyline,
    elementType: ElementType.StopSign,
    label: 'Stop Sign',
    shortcut: 'P',
    icon: 'stop_sign',
  },
  {
    shape: ShapeType.Polyline,
    elementType: ElementType.SpeedBump,
    label: 'Speed Bump',
    shortcut: 'B',
    icon: 'speed_bump',
  },
  // RotatableRect shape → rectangular elements
  {
    shape: ShapeType.RotatableRect,
    elementType: ElementType.Crosswalk,
    label: 'Crosswalk',
    shortcut: 'W',
    icon: 'crosswalk',
  },
  {
    shape: ShapeType.RotatableRect,
    elementType: ElementType.ParkingSpace,
    label: 'Parking',
    shortcut: 'K',
    icon: 'parking',
  },
  // Polygon shape → freeform area elements
  {
    shape: ShapeType.Polygon,
    elementType: ElementType.Junction,
    label: 'Junction',
    shortcut: 'J',
    icon: 'junction',
  },
  {
    shape: ShapeType.Polygon,
    elementType: ElementType.ClearArea,
    label: 'Clear Area',
    shortcut: 'A',
    icon: 'clear_area',
  },
  // Curve shape → smooth line elements (placeholder, simplified in phase 1)
  {
    shape: ShapeType.Curve,
    elementType: ElementType.Lane,
    label: 'Lane (Curve)',
    icon: 'lane_curve',
  },
]

export function getEntriesForShape(shape: ShapeType): ShapeElementEntry[] {
  return SHAPE_ELEMENT_REGISTRY.filter((e) => e.shape === shape)
}

export function getDefaultElementForShape(shape: ShapeType): ElementType {
  const entry = SHAPE_ELEMENT_REGISTRY.find((e) => e.shape === shape)
  return entry?.elementType ?? ElementType.Lane
}

/** Shapes that have drawing tools in the toolbar (Point excluded for now) */
export const DRAWABLE_SHAPES = [
  ShapeType.Polyline,
  ShapeType.RotatableRect,
  ShapeType.Polygon,
  ShapeType.Curve,
] as const
