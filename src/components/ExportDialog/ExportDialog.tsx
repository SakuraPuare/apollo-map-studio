import { useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { buildBaseMap } from '../../export/buildBaseMap'
import { buildSimMap } from '../../export/buildSimMap'
import { buildRoutingMap } from '../../export/buildRoutingMap'
import { encodeMap, encodeGraph, downloadBinary } from '../../proto/codec'
import { setGlobalProjection } from '../../geo/projection'

type ExportStep =
  | 'idle'
  | 'building_base'
  | 'building_sim'
  | 'building_routing'
  | 'encoding'
  | 'done'
  | 'error'

export default function ExportDialog() {
  const { setShowExportDialog } = useUIStore()
  const store = useMapStore()

  const [step, setStep] = useState<ExportStep>('idle')
  const [error, setError] = useState<string>('')
  const [stats, setStats] = useState<{
    lanes: number
    roads: number
    nodes: number
    edges: number
  } | null>(null)

  const [exportBase, setExportBase] = useState(true)
  const [exportSim, setExportSim] = useState(true)
  const [exportRouting, setExportRouting] = useState(true)

  const handleExport = async () => {
    try {
      if (!store.project) {
        setError('No project configured. Please create a new project first.')
        return
      }

      // Initialize projection
      setGlobalProjection(store.project.originLat, store.project.originLon)

      const lanes = Object.values(store.lanes)
      const junctions = Object.values(store.junctions)
      const signals = Object.values(store.signals)
      const stopSigns = Object.values(store.stopSigns)
      const crosswalks = Object.values(store.crosswalks)
      const clearAreas = Object.values(store.clearAreas)
      const speedBumps = Object.values(store.speedBumps)
      const parkingSpaces = Object.values(store.parkingSpaces)

      // Validate
      if (lanes.length === 0) {
        setError('No lanes found. Draw at least one lane before exporting.')
        return
      }

      setStep('building_base')
      setError('')

      // Build base map
      const baseMap = await buildBaseMap({
        project: store.project,
        lanes,
        junctions,
        signals,
        stopSigns,
        crosswalks,
        clearAreas,
        speedBumps,
        parkingSpaces,
        roads: Object.values(store.roads),
      })

      setStats({
        lanes: baseMap.lane.length,
        roads: baseMap.road.length,
        nodes: 0,
        edges: 0,
      })

      setStep('encoding')

      // Export base_map.bin
      if (exportBase) {
        const baseData = await encodeMap(baseMap)
        downloadBinary(baseData, 'base_map.bin')
      }

      // Export sim_map.bin
      if (exportSim) {
        setStep('building_sim')
        const simMap = buildSimMap(baseMap)
        const simData = await encodeMap(simMap)
        downloadBinary(simData, 'sim_map.bin')
      }

      // Export routing_map.bin
      if (exportRouting) {
        setStep('building_routing')
        const routingGraph = buildRoutingMap(baseMap)
        setStats((s) =>
          s ? { ...s, nodes: routingGraph.node.length, edges: routingGraph.edge.length } : null
        )
        const routingData = await encodeGraph(routingGraph)
        downloadBinary(routingData, 'routing_map.bin')
      }

      setStep('done')
    } catch (err) {
      setError(String(err))
      setStep('error')
      console.error('Export failed:', err)
    }
  }

  const stepLabels: Record<ExportStep, string> = {
    idle: 'Ready to export',
    building_base: 'Building base_map...',
    building_sim: 'Building sim_map...',
    building_routing: 'Building routing_map...',
    encoding: 'Encoding protobuf...',
    done: 'Export complete!',
    error: 'Export failed',
  }

  return (
    <Overlay>
      <Dialog title="Export Map Files" onClose={() => setShowExportDialog(false)}>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 16px' }}>
          Exports Apollo HD Map binary files to your downloads folder.
        </p>

        {/* File selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <CheckItem
            checked={exportBase}
            onChange={setExportBase}
            label="base_map.bin"
            desc="Complete HD map with all elements"
          />
          <CheckItem
            checked={exportSim}
            onChange={setExportSim}
            label="sim_map.bin"
            desc="Downsampled visualization map"
          />
          <CheckItem
            checked={exportRouting}
            onChange={setExportRouting}
            label="routing_map.bin"
            desc="Routing topology graph"
          />
        </div>

        {/* Progress */}
        {step !== 'idle' && (
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: 12,
              marginBottom: 12,
              fontSize: 12,
            }}
          >
            <div
              style={{
                color: step === 'error' ? '#f87171' : step === 'done' ? '#4ade80' : '#93c5fd',
                marginBottom: 4,
              }}
            >
              {stepLabels[step]}
            </div>
            {stats && (
              <div style={{ color: '#64748b', fontSize: 11 }}>
                {stats.lanes} lanes · {stats.roads} roads
                {stats.nodes > 0 && ` · ${stats.nodes} nodes · ${stats.edges} edges`}
              </div>
            )}
            {error && (
              <div style={{ color: '#f87171', fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
                {error}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowExportDialog(false)}
            style={{ ...btnStyle, background: '#374151' }}
          >
            Close
          </button>
          <button
            onClick={handleExport}
            disabled={step !== 'idle' && step !== 'done' && step !== 'error'}
            style={{
              ...btnStyle,
              background: '#1d4ed8',
              opacity: step !== 'idle' && step !== 'done' && step !== 'error' ? 0.5 : 1,
            }}
          >
            {step === 'done' ? 'Export Again' : 'Export'}
          </button>
        </div>
      </Dialog>
    </Overlay>
  )
}

function CheckItem({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc: string
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 8,
        cursor: 'pointer',
        alignItems: 'flex-start',
        padding: 8,
        borderRadius: 6,
        border: `1px solid ${checked ? '#1d4ed8' : '#334155'}`,
        background: checked ? '#1e3a8a20' : 'transparent',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 1 }}
      />
      <div>
        <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>{desc}</div>
      </div>
    </label>
  )
}

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 12,
  cursor: 'pointer',
  color: '#f1f5f9',
}

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      {children}
    </div>
  )
}

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: 24,
        width: 480,
        maxWidth: '95vw',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, color: '#f1f5f9' }}>{title}</h2>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      {children}
    </div>
  )
}
