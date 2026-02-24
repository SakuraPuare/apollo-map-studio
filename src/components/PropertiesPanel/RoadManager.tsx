import { useState } from 'react'
import { useMapStore } from '../../store/mapStore'
import { RoadType } from '../../types/apollo-map'
import type { RoadDefinition } from '../../types/editor'
import { getRoadColor } from '../../utils/roadColors'

let roadCounter = 0
function nextRoadId(): string {
  return `road_${Date.now()}_${++roadCounter}`
}

export default function RoadManager() {
  const { roads, lanes, addRoad } = useMapStore()
  const [editingId, setEditingId] = useState<string | null>(null)

  const roadList = Object.values(roads)

  const handleCreate = () => {
    const id = nextRoadId()
    addRoad({
      id,
      name: `Road ${roadList.length + 1}`,
      type: RoadType.CITY_ROAD,
    })
    setEditingId(id)
  }

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div style={{ color: '#94a3b8', fontSize: 10 }}>ROADS</div>
        <button onClick={handleCreate} style={addBtnStyle} title="Create Road">
          + New
        </button>
      </div>

      {roadList.length === 0 && (
        <div style={{ color: '#475569', fontSize: 11, padding: '8px 0' }}>
          No roads defined. Create a road to group lanes.
        </div>
      )}

      {roadList.map((road) => (
        <RoadItem
          key={road.id}
          road={road}
          color={getRoadColor(road.id, roads)}
          laneCount={Object.values(lanes).filter((l) => l.roadId === road.id).length}
          isEditing={editingId === road.id}
          onToggleEdit={() => setEditingId(editingId === road.id ? null : road.id)}
          onClearEditing={() => {
            if (editingId === road.id) setEditingId(null)
          }}
        />
      ))}
    </div>
  )
}

function RoadItem({
  road,
  color,
  laneCount,
  isEditing,
  onToggleEdit,
  onClearEditing,
}: {
  road: RoadDefinition
  color: string
  laneCount: number
  isEditing: boolean
  onToggleEdit: () => void
  onClearEditing: () => void
}) {
  const { updateRoad, removeRoad } = useMapStore()

  return (
    <div
      style={{
        border: `1px solid ${isEditing ? color : '#334155'}`,
        borderRadius: 6,
        marginBottom: 6,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggleEdit}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          cursor: 'pointer',
          background: isEditing ? '#0f172a' : 'transparent',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, color: '#e2e8f0', fontSize: 11 }}>{road.name}</span>
        <span style={{ color: '#64748b', fontSize: 10 }}>{laneCount}</span>
      </div>

      {isEditing && (
        <div style={{ padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            defaultValue={road.name}
            key={`${road.id}-name`}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v) updateRoad({ ...road, name: v })
            }}
            style={inputStyle}
            placeholder="Road name"
          />
          <select
            value={road.type}
            onChange={(e) => updateRoad({ ...road, type: Number(e.target.value) as RoadType })}
            style={inputStyle}
          >
            <option value={RoadType.HIGHWAY}>Highway</option>
            <option value={RoadType.CITY_ROAD}>City Road</option>
            <option value={RoadType.PARK}>Park</option>
            <option value={RoadType.UNKNOWN}>Unknown</option>
          </select>
          <button
            onClick={() => {
              removeRoad(road.id)
              onClearEditing()
            }}
            style={deleteBtnStyle}
          >
            Delete Road
          </button>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#f1f5f9',
  padding: '4px 6px',
  fontSize: 11,
  width: '100%',
}

const addBtnStyle: React.CSSProperties = {
  background: '#1d4ed8',
  border: 'none',
  borderRadius: 4,
  color: '#f1f5f9',
  padding: '3px 8px',
  fontSize: 10,
  cursor: 'pointer',
}

const deleteBtnStyle: React.CSSProperties = {
  background: '#7f1d1d',
  border: 'none',
  borderRadius: 4,
  color: '#f1f5f9',
  padding: '4px 8px',
  fontSize: 10,
  cursor: 'pointer',
  width: '100%',
}
