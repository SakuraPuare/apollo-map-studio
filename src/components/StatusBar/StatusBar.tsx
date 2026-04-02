import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import { Badge } from '@/components/ui/badge'

const MODE_LABELS: Record<string, string> = {
  select: 'Select',
  draw_lane: 'Draw Lane',
  connect_lanes: 'Connect Lanes',
  draw_junction: 'Draw Junction',
  draw_crosswalk: 'Draw Crosswalk',
  draw_clear_area: 'Draw Clear Area',
  draw_speed_bump: 'Draw Speed Bump',
  draw_parking_space: 'Draw Parking Space',
  draw_signal: 'Draw Signal',
  draw_stop_sign: 'Draw Stop Sign',
}

export default function StatusBar() {
  const { statusMessage, drawMode, selectedIds } = useUIStore()
  const { lanes, project } = useMapStore()

  const laneCount = Object.keys(lanes).length

  return (
    <div className="flex h-6 items-center px-3 gap-3 text-[11px] bg-[#007acc] text-white shrink-0 select-none">
      {/* Mode pill */}
      <Badge
        variant="secondary"
        className="h-4 px-1.5 text-[10px] font-medium bg-white/20 text-white hover:bg-white/25 border-none rounded-sm"
      >
        {MODE_LABELS[drawMode] ?? drawMode}
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
