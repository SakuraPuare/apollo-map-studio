import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import { Badge } from '@/components/ui/badge'
import type { ToolState } from '@/types/editor'

function getToolLabel(ts: ToolState): string {
  if (ts.kind === 'select') return 'Select'
  if (ts.kind === 'connect_lanes') return 'Connect Lanes'
  const { shape, elementType } = ts.intent
  const elLabels: Record<string, string> = {
    lane: 'Lane',
    junction: 'Junction',
    crosswalk: 'Crosswalk',
    clear_area: 'Clear Area',
    speed_bump: 'Speed Bump',
    parking_space: 'Parking Space',
    signal: 'Signal',
    stop_sign: 'Stop Sign',
  }
  const shapeLabels: Record<string, string> = {
    point: 'Point',
    polyline: 'Polyline',
    rotatable_rect: 'Rect',
    polygon: 'Polygon',
    curve: 'Curve',
  }
  return `Draw ${elLabels[elementType] ?? elementType} (${shapeLabels[shape] ?? shape})`
}

export default function StatusBar() {
  const { statusMessage, toolState, selectedIds } = useUIStore()
  const { lanes, project } = useMapStore()

  const laneCount = Object.keys(lanes).length

  return (
    <div className="flex h-6 items-center px-3 gap-3 text-[11px] bg-[#007acc] text-white shrink-0 select-none">
      {/* Mode pill */}
      <Badge
        variant="secondary"
        className="h-4 px-1.5 text-[10px] font-medium bg-white/20 text-white hover:bg-white/25 border-none rounded-sm"
      >
        {getToolLabel(toolState)}
      </Badge>

      {/* Element count */}
      <span className="text-white/80">{laneCount} lanes</span>

      {/* Selection */}
      {selectedIds.length > 0 && (
        <span className="text-yellow-200">{selectedIds.length} selected</span>
      )}

      <span className="flex-1" />

      {/* Project info */}
      {project && (
        <span className="text-white/70 text-[10px]">
          {project.name} · {project.originLat.toFixed(6)}, {project.originLon.toFixed(6)}
        </span>
      )}

      {/* Status message */}
      {statusMessage && statusMessage !== 'Ready' && (
        <span className="text-white/90">{statusMessage}</span>
      )}
    </div>
  )
}
