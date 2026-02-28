import { useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { buildBaseMap } from '../../export/buildBaseMap'
import { buildSimMap } from '../../export/buildSimMap'
import { buildRoutingMap } from '../../export/buildRoutingMap'
import { encodeMap, encodeGraph, downloadBinary, downloadText } from '../../proto/codec'
import { setGlobalProjection } from '../../geo/projection'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

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
  const [exportTxt, setExportTxt] = useState(false)

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

      // Export TXT files
      if (exportTxt) {
        setStep('encoding')
        downloadText(JSON.stringify(baseMap, null, 2), 'base_map.txt')
        const simMapForTxt = buildSimMap(baseMap)
        downloadText(JSON.stringify(simMapForTxt, null, 2), 'sim_map.txt')
        const routingGraphForTxt = buildRoutingMap(baseMap)
        downloadText(JSON.stringify(routingGraphForTxt, null, 2), 'routing_map.txt')
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

  const isExporting = step !== 'idle' && step !== 'done' && step !== 'error'

  return (
    <Dialog open onOpenChange={() => setShowExportDialog(false)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Export Map Files</DialogTitle>
          <DialogDescription>
            Export Apollo HD Map files (.bin binary or .txt JSON) to your downloads folder.
          </DialogDescription>
        </DialogHeader>

        {/* File selection */}
        <div className="flex flex-col gap-2">
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
          <CheckItem
            checked={exportTxt}
            onChange={setExportTxt}
            label="Also export as TXT (JSON)"
            desc="Downloads base_map.txt, sim_map.txt, routing_map.txt as human-readable JSON"
          />
        </div>

        {/* Progress */}
        {step !== 'idle' && (
          <div className="bg-background border border-border rounded p-3 text-xs">
            <div
              className={cn(
                'mb-1',
                step === 'error' && 'text-destructive',
                step === 'done' && 'text-chart-2',
                step !== 'error' && step !== 'done' && 'text-chart-5'
              )}
            >
              {stepLabels[step]}
            </div>
            {stats && (
              <div className="text-muted-foreground text-[11px]">
                {stats.lanes} lanes · {stats.roads} roads
                {stats.nodes > 0 && ` · ${stats.nodes} nodes · ${stats.edges} edges`}
              </div>
            )}
            {error && <div className="text-destructive text-[11px] mt-1 break-all">{error}</div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowExportDialog(false)}>
            Close
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {step === 'done' ? 'Export Again' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      className={cn(
        'flex gap-2 cursor-pointer items-start p-2 rounded border transition-colors',
        checked ? 'border-primary bg-primary/10' : 'border-border bg-transparent'
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <div>
        <div className="text-xs text-accent-foreground font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{desc}</div>
      </div>
    </label>
  )
}
