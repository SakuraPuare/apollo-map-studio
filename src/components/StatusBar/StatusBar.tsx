import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'

export default function StatusBar() {
  const { statusMessage, drawMode, selectedIds } = useUIStore()
  const { lanes, project } = useMapStore()

  const laneCount = Object.keys(lanes).length

  const modeLabel: Record<string, string> = {
    select: 'Select',
    draw_lane: 'Drawing Lane (click to add points, double-click to finish)',
    connect_lanes: 'Connect Mode (click source lane, then target lane)',
    draw_junction: 'Drawing Junction',
    draw_crosswalk: 'Drawing Crosswalk',
    draw_clear_area: 'Drawing Clear Area',
    draw_speed_bump: 'Drawing Speed Bump',
    draw_parking_space: 'Drawing Parking Space',
    draw_signal: 'Drawing Signal Stop Line',
    draw_stop_sign: 'Drawing Stop Sign Line',
  }

  return (
    <div
      style={{
        height: 28,
        background: '#0f172a',
        borderTop: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 16,
        fontSize: 11,
        color: '#64748b',
        flexShrink: 0,
      }}
    >
      <span style={{ color: '#3b82f6' }}>{modeLabel[drawMode] ?? drawMode}</span>
      <span>•</span>
      <span>{laneCount} lanes</span>
      {selectedIds.length > 0 && (
        <>
          <span>•</span>
          <span style={{ color: '#fbbf24' }}>{selectedIds.length} selected</span>
        </>
      )}
      <span style={{ flex: 1 }} />
      {project && (
        <span style={{ color: '#475569' }}>
          {project.name} · Origin: {project.originLat.toFixed(6)}, {project.originLon.toFixed(6)}
        </span>
      )}
      <span>{statusMessage}</span>
    </div>
  )
}
