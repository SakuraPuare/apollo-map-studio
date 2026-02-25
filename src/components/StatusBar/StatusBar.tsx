import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'

export default function StatusBar() {
  const { statusMessage, drawMode, activeCreation, selectedIds } = useUIStore()
  const { lanes, project } = useMapStore()

  const laneCount = Object.keys(lanes).length

  const modeLabel: Record<string, string> = {
    select: 'Select',
    creating: activeCreation ? `Creating ${activeCreation.elementType}` : 'Creating',
    connect_lanes: 'Connect Mode (click source lane, then target lane)',
  }

  return (
    <div
      style={{
        height: 22,
        background: project ? '#007acc' : '#333333',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 12,
        fontSize: 12,
        color: '#ffffff',
        flexShrink: 0,
      }}
    >
      <span style={{ color: '#ffffff' }}>{modeLabel[drawMode] ?? drawMode}</span>
      <span>{laneCount} lanes</span>
      {selectedIds.length > 0 && (
        <span style={{ color: '#ffd700' }}>{selectedIds.length} selected</span>
      )}
      <span style={{ flex: 1 }} />
      {project && (
        <span style={{ color: 'rgba(255,255,255,0.7)' }}>
          {project.name} · Origin: {project.originLat.toFixed(6)}, {project.originLon.toFixed(6)}
        </span>
      )}
      <span style={{ color: '#ffffff' }}>{statusMessage}</span>
    </div>
  )
}
