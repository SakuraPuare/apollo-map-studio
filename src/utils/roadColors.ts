import type { RoadDefinition } from '../types/editor'

const ROAD_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#f97316', // orange
]

export function getRoadColor(roadId: string, roads: Record<string, RoadDefinition>): string {
  const ids = Object.keys(roads).sort()
  const index = ids.indexOf(roadId)
  return index >= 0 ? ROAD_COLORS[index % ROAD_COLORS.length] : '#475569'
}
