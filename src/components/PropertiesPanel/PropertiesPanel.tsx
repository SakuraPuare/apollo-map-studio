import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import LaneProperties from './LaneProperties'
import RoadManager from './RoadManager'
import type { MapElement } from '../../types/editor'

export default function PropertiesPanel() {
  const { selectedIds } = useUIStore()
  const {
    lanes,
    junctions,
    signals,
    stopSigns,
    crosswalks,
    clearAreas,
    speedBumps,
    parkingSpaces,
  } = useMapStore()

  if (selectedIds.length === 0) {
    return (
      <div
        style={{
          width: 240,
          background: '#1e293b',
          borderLeft: '1px solid #334155',
          overflowY: 'auto',
        }}
      >
        <RoadManager />
      </div>
    )
  }

  // Find the selected element
  const id = selectedIds[0]
  const element: MapElement | undefined =
    lanes[id] ??
    junctions[id] ??
    signals[id] ??
    stopSigns[id] ??
    crosswalks[id] ??
    clearAreas[id] ??
    speedBumps[id] ??
    parkingSpaces[id]

  if (!element) {
    return (
      <div
        style={{
          width: 240,
          background: '#1e293b',
          borderLeft: '1px solid #334155',
          padding: 12,
          fontSize: 11,
          color: '#475569',
        }}
      >
        Element not found: {id}
      </div>
    )
  }

  function renderContent(el: MapElement) {
    switch (el.type) {
      case 'lane':
        return <LaneProperties lane={el} />
      case 'junction':
        return (
          <GenericProperties
            type="Junction"
            id={el.id}
            onDelete={() => useMapStore.getState().removeElement(id, 'junction')}
          />
        )
      case 'signal':
        return <SignalPropertiesSimple id={el.id} />
      case 'stop_sign':
        return (
          <GenericProperties
            type="Stop Sign"
            id={el.id}
            onDelete={() => useMapStore.getState().removeElement(id, 'stop_sign')}
          />
        )
      case 'crosswalk':
        return (
          <GenericProperties
            type="Crosswalk"
            id={el.id}
            onDelete={() => useMapStore.getState().removeElement(id, 'crosswalk')}
          />
        )
      case 'clear_area':
        return (
          <GenericProperties
            type="Clear Area"
            id={el.id}
            onDelete={() => useMapStore.getState().removeElement(id, 'clear_area')}
          />
        )
      case 'speed_bump':
        return (
          <GenericProperties
            type="Speed Bump"
            id={el.id}
            onDelete={() => useMapStore.getState().removeElement(id, 'speed_bump')}
          />
        )
      case 'parking_space':
        return (
          <GenericProperties
            type="Parking Space"
            id={el.id}
            onDelete={() => useMapStore.getState().removeElement(id, 'parking_space')}
          />
        )
      default:
        return null
    }
  }

  return (
    <div
      style={{
        width: 240,
        background: '#1e293b',
        borderLeft: '1px solid #334155',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #334155',
          fontSize: 10,
          fontWeight: 600,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}
      >
        Properties
      </div>
      {renderContent(element)}
    </div>
  )
}

function GenericProperties({
  type,
  id,
  onDelete,
}: {
  type: string
  id: string
  onDelete: () => void
}) {
  const { setSelected } = useUIStore()
  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div style={{ marginBottom: 4, color: '#94a3b8', fontSize: 10 }}>{type.toUpperCase()}</div>
      <div style={{ fontSize: 11, color: '#e2e8f0', wordBreak: 'break-all', marginBottom: 12 }}>
        {id}
      </div>
      <button
        onClick={() => {
          onDelete()
          setSelected([])
        }}
        style={{
          background: 'transparent',
          border: '1px solid #dc2626',
          borderRadius: 4,
          color: '#f87171',
          padding: '6px 8px',
          fontSize: 11,
          cursor: 'pointer',
          width: '100%',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#dc2626'
          e.currentTarget.style.color = '#ffffff'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = '#f87171'
        }}
      >
        Delete
      </button>
    </div>
  )
}

function SignalPropertiesSimple({ id }: { id: string }) {
  const { removeElement } = useMapStore()
  const { setSelected } = useUIStore()
  return (
    <GenericProperties
      type="Traffic Signal"
      id={id}
      onDelete={() => {
        removeElement(id, 'signal')
        setSelected([])
      }}
    />
  )
}
