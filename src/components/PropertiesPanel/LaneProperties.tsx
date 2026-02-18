import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { BoundaryType, LaneDirection, LaneTurn, LaneType } from '../../types/apollo-map'
import type { LaneFeature } from '../../types/editor'

interface Props {
  lane: LaneFeature
}

export default function LaneProperties({ lane }: Props) {
  const updateElement = useMapStore((s) => s.updateElement)
  const removeElement = useMapStore((s) => s.removeElement)
  const { setSelected } = useUIStore()

  const update = (patch: Partial<LaneFeature>) => {
    updateElement({ ...lane, ...patch })
  }

  const handleDelete = () => {
    removeElement(lane.id, 'lane')
    setSelected([])
  }

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div style={{ marginBottom: 4, color: '#94a3b8', fontSize: 10 }}>LANE</div>
      <div
        style={{
          marginBottom: 10,
          fontWeight: 600,
          fontSize: 11,
          color: '#e2e8f0',
          wordBreak: 'break-all',
        }}
      >
        {lane.id}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Field label="Speed Limit (km/h)">
          <input
            type="number"
            min={0}
            max={360}
            step={1}
            // Display km/h, store m/s
            defaultValue={Math.round(lane.speedLimit * 3.6)}
            key={`${lane.id}-speed`}
            onBlur={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 0) update({ speedLimit: v / 3.6 })
            }}
            style={inputStyle}
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
            style={inputStyle}
          />
        </Field>

        <Field label="Type">
          <select
            value={lane.laneType}
            onChange={(e) => update({ laneType: Number(e.target.value) as LaneType })}
            style={inputStyle}
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
            style={inputStyle}
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
            style={inputStyle}
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
            style={inputStyle}
          >
            {boundaryOptions}
          </select>
        </Field>

        <Field label="Right Boundary">
          <select
            value={lane.rightBoundaryType}
            onChange={(e) => update({ rightBoundaryType: Number(e.target.value) as BoundaryType })}
            style={inputStyle}
          >
            {boundaryOptions}
          </select>
        </Field>
      </div>

      {/* Connections */}
      <div style={{ marginTop: 12, borderTop: '1px solid #334155', paddingTop: 8 }}>
        <div style={{ color: '#64748b', fontSize: 10, marginBottom: 4 }}>CONNECTIONS</div>
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

      <button onClick={handleDelete} style={{ ...deleteButtonStyle, marginTop: 12 }}>
        Delete Lane
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label style={{ color: '#94a3b8', fontSize: 10 }}>{label}</label>
      {children}
    </div>
  )
}

function IdList({ label, ids }: { label: string; ids: string[] }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase' }}>{label}</div>
      {ids.map((id) => (
        <div
          key={id}
          style={{ fontSize: 9, color: '#94a3b8', paddingLeft: 4, wordBreak: 'break-all' }}
        >
          • {id}
        </div>
      ))}
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

const deleteButtonStyle: React.CSSProperties = {
  background: '#7f1d1d',
  border: 'none',
  borderRadius: 4,
  color: '#f1f5f9',
  padding: '6px 8px',
  fontSize: 11,
  cursor: 'pointer',
  width: '100%',
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
