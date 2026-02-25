import { useState } from 'react'
import { useMapStore } from '../../store/mapStore'
import { RoadType } from '../../types/apollo-map'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
    <div className="p-3 text-xs">
      <div className="flex justify-between items-center mb-2">
        <div className="text-muted-foreground text-[11px] font-semibold">ROADS</div>
        <Button size="xs" onClick={handleCreate} title="Create Road">
          + New
        </Button>
      </div>

      {roadList.length === 0 && (
        <div className="text-[#5a5a5a] text-xs py-2">
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
      className={cn(
        'border rounded-md mb-1.5 overflow-hidden',
        isEditing ? 'border-border' : 'border-border'
      )}
      style={isEditing ? { borderColor: color } : undefined}
    >
      <div
        onClick={onToggleEdit}
        className={cn(
          'flex items-center gap-2 py-2 px-2.5 cursor-pointer',
          isEditing ? 'bg-background' : 'bg-transparent'
        )}
      >
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        <span className="flex-1 text-accent-foreground text-[13px]">{road.name}</span>
        <span className="text-muted-foreground text-[11px]">{laneCount}</span>
      </div>

      {isEditing && (
        <div className="px-2.5 pt-1.5 pb-2.5 flex flex-col gap-2">
          <input
            defaultValue={road.name}
            key={`${road.id}-name`}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v) updateRoad({ ...road, name: v })
            }}
            className="panel-input"
            placeholder="Road name"
          />
          <select
            value={road.type}
            onChange={(e) => updateRoad({ ...road, type: Number(e.target.value) as RoadType })}
            className="panel-select"
          >
            <option value={RoadType.HIGHWAY}>Highway</option>
            <option value={RoadType.CITY_ROAD}>City Road</option>
            <option value={RoadType.PARK}>Park</option>
            <option value={RoadType.UNKNOWN}>Unknown</option>
          </select>
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => {
              removeRoad(road.id)
              onClearEditing()
            }}
          >
            Delete Road
          </Button>
        </div>
      )}
    </div>
  )
}
