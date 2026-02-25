import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import LaneProperties from './LaneProperties'
import { Button } from '@/components/ui/button'
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
    roads,
  } = useMapStore()

  if (selectedIds.length === 0) {
    return (
      <div className="w-[300px] bg-card border-l border-border overflow-y-auto p-4 text-[11px] text-muted-foreground">
        Select an element to view properties.
      </div>
    )
  }

  // Find the selected element
  const id = selectedIds[0]

  // Check if it's a road
  const road = roads[id]
  if (road) {
    return (
      <div className="w-[300px] bg-card border-l border-border overflow-y-auto flex flex-col">
        <div className="py-2.5 px-4 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-background shrink-0">
          Properties
        </div>
        <RoadProperties roadId={id} />
      </div>
    )
  }

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
      <div className="w-[300px] bg-card border-l border-border p-3 text-[11px] text-[#5a5a5a]">
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
    <div className="w-[300px] bg-card border-l border-border overflow-y-auto flex flex-col">
      <div className="py-2.5 px-4 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-background shrink-0">
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
    <div className="p-4 text-xs">
      <div className="mb-1 text-muted-foreground text-[11px]">{type.toUpperCase()}</div>
      <div className="text-xs text-accent-foreground font-mono break-all mb-3">{id}</div>
      <Button
        variant="destructive"
        size="sm"
        className="w-full"
        onClick={() => {
          onDelete()
          setSelected([])
        }}
      >
        Delete
      </Button>
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

function RoadProperties({ roadId }: { roadId: string }) {
  const { roads, lanes, updateRoad, removeRoad } = useMapStore()
  const { setSelected } = useUIStore()
  const road = roads[roadId]
  if (!road) return null

  const laneCount = Object.values(lanes).filter((l) => l.roadId === roadId).length

  return (
    <div className="p-4 text-xs flex flex-col gap-2">
      <div className="mb-1 text-muted-foreground text-[11px]">ROAD</div>
      <div className="text-xs text-accent-foreground font-mono break-all">{road.id}</div>
      <label className="text-muted-foreground text-[11px]">Name</label>
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
      <label className="text-muted-foreground text-[11px]">Type</label>
      <select
        value={road.type}
        onChange={(e) => updateRoad({ ...road, type: Number(e.target.value) })}
        className="panel-select"
      >
        <option value={0}>UNKNOWN</option>
        <option value={1}>HIGHWAY</option>
        <option value={2}>CITY_ROAD</option>
        <option value={3}>PARK</option>
      </select>
      <div className="text-muted-foreground text-[11px]">Lanes: {laneCount}</div>
      <Button
        variant="destructive"
        size="sm"
        className="w-full mt-1"
        onClick={() => {
          removeRoad(roadId)
          setSelected([])
        }}
      >
        Delete Road
      </Button>
    </div>
  )
}
