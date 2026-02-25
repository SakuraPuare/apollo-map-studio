import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { BoundaryType, LaneDirection, LaneTurn, LaneType } from '../../types/apollo-map'
import { Button } from '@/components/ui/button'
import type { LaneFeature } from '../../types/editor'

interface Props {
  lane: LaneFeature
}

export default function LaneProperties({ lane }: Props) {
  const updateElement = useMapStore((s) => s.updateElement)
  const removeElement = useMapStore((s) => s.removeElement)
  const roads = useMapStore((s) => s.roads)
  const assignLaneToRoad = useMapStore((s) => s.assignLaneToRoad)
  const unassignLaneFromRoad = useMapStore((s) => s.unassignLaneFromRoad)
  const { setSelected } = useUIStore()

  const update = (patch: Partial<LaneFeature>) => {
    updateElement({ ...lane, ...patch })
  }

  const handleDelete = () => {
    removeElement(lane.id, 'lane')
    setSelected([])
  }

  return (
    <div className="p-4 text-xs">
      <div className="mb-1 text-muted-foreground text-[11px]">LANE</div>
      <div className="mb-2.5 font-semibold text-xs text-accent-foreground font-mono break-all">
        {lane.id}
      </div>

      <div className="flex flex-col gap-3">
        <Field label="Speed Limit (km/h)">
          <input
            type="number"
            min={0}
            max={360}
            step={1}
            defaultValue={Math.round(lane.speedLimit * 3.6)}
            key={`${lane.id}-speed`}
            onBlur={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 0) update({ speedLimit: v / 3.6 })
            }}
            className="panel-input"
          />
        </Field>

        <Field label="Lane Width (m)">
          <input
            type="number"
            min={0.5}
            max={20}
            step={0.01}
            defaultValue={lane.width}
            key={`${lane.id}-width`}
            onBlur={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 0.5) update({ width: v })
            }}
            className="panel-input"
          />
        </Field>

        <Field label="Type">
          <select
            value={lane.laneType}
            onChange={(e) => update({ laneType: Number(e.target.value) as LaneType })}
            className="panel-select"
          >
            <option value={LaneType.CITY_DRIVING}>City Driving</option>
            <option value={LaneType.BIKING}>Biking</option>
            <option value={LaneType.SIDEWALK}>Sidewalk</option>
            <option value={LaneType.PARKING}>Parking</option>
            <option value={LaneType.SHOULDER}>Shoulder</option>
            <option value={LaneType.SHARED}>Shared</option>
            <option value={LaneType.NONE}>None</option>
          </select>
        </Field>

        <Field label="Turn">
          <select
            value={lane.turn}
            onChange={(e) => update({ turn: Number(e.target.value) as LaneTurn })}
            className="panel-select"
          >
            <option value={LaneTurn.NO_TURN}>No Turn</option>
            <option value={LaneTurn.LEFT_TURN}>Left Turn</option>
            <option value={LaneTurn.RIGHT_TURN}>Right Turn</option>
            <option value={LaneTurn.U_TURN}>U-Turn</option>
          </select>
        </Field>

        <Field label="Direction">
          <select
            value={lane.direction}
            onChange={(e) => update({ direction: Number(e.target.value) as LaneDirection })}
            className="panel-select"
          >
            <option value={LaneDirection.FORWARD}>Forward</option>
            <option value={LaneDirection.BACKWARD}>Backward</option>
            <option value={LaneDirection.BIDIRECTION}>Bidirectional</option>
          </select>
        </Field>

        <Field label="Left Boundary">
          <select
            value={lane.leftBoundaryType}
            onChange={(e) => update({ leftBoundaryType: Number(e.target.value) as BoundaryType })}
            className="panel-select"
          >
            {boundaryOptions}
          </select>
        </Field>

        <Field label="Right Boundary">
          <select
            value={lane.rightBoundaryType}
            onChange={(e) => update({ rightBoundaryType: Number(e.target.value) as BoundaryType })}
            className="panel-select"
          >
            {boundaryOptions}
          </select>
        </Field>
        <Field label="Road">
          <select
            value={lane.roadId ?? ''}
            onChange={(e) => {
              const val = e.target.value
              if (val) {
                assignLaneToRoad(lane.id, val)
              } else {
                unassignLaneFromRoad(lane.id)
              }
            }}
            className="panel-select"
          >
            <option value="">-- None --</option>
            {Object.values(roads).map((road) => (
              <option key={road.id} value={road.id}>
                {road.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Connections */}
      <div className="mt-3 border-t border-border pt-2">
        <div className="text-muted-foreground text-[11px] mb-1.5 tracking-wide font-semibold">
          CONNECTIONS
        </div>
        {lane.predecessorIds.length > 0 && (
          <IdList label="Predecessors" ids={lane.predecessorIds} />
        )}
        {lane.successorIds.length > 0 && <IdList label="Successors" ids={lane.successorIds} />}
        {lane.leftNeighborIds.length > 0 && (
          <IdList label="Left Neighbors" ids={lane.leftNeighborIds} />
        )}
        {lane.rightNeighborIds.length > 0 && (
          <IdList label="Right Neighbors" ids={lane.rightNeighborIds} />
        )}
      </div>

      <Button variant="destructive" className="w-full mt-3" size="sm" onClick={handleDelete}>
        Delete Lane
      </Button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-muted-foreground text-xs font-medium">{label}</label>
      {children}
    </div>
  )
}

function IdList({ label, ids }: { label: string; ids: string[] }) {
  return (
    <div className="mb-1.5">
      <div className="text-muted-foreground text-[11px] uppercase mb-0.5">{label}</div>
      {ids.map((id) => (
        <div
          key={id}
          className="text-[11px] text-foreground pl-1.5 break-all flex items-center gap-1 leading-relaxed"
        >
          <span className="w-[5px] h-[5px] rounded-full bg-primary shrink-0" />
          {id}
        </div>
      ))}
    </div>
  )
}

const boundaryOptions = (
  <>
    <option value={BoundaryType.DOTTED_WHITE}>Dotted White</option>
    <option value={BoundaryType.DOTTED_YELLOW}>Dotted Yellow</option>
    <option value={BoundaryType.SOLID_WHITE}>Solid White</option>
    <option value={BoundaryType.SOLID_YELLOW}>Solid Yellow</option>
    <option value={BoundaryType.DOUBLE_YELLOW}>Double Yellow</option>
    <option value={BoundaryType.CURB}>Curb</option>
    <option value={BoundaryType.UNKNOWN}>Unknown</option>
  </>
)
