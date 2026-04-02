import { useState, useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { downloadBinary, downloadText } from '../../proto/codec'
import type { WorkerOutMessage, ExportPayload } from '../../workers/exportWorker'
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

  const workerRef = useRef<Worker | null>(null)

  // Create the worker lazily (on first export) and terminate on unmount
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../../workers/exportWorker.ts', import.meta.url), {
        type: 'module',
      })
    }
    return workerRef.current
  }, [])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const handleExport = () => {
    if (!store.project) {
      setError('No project configured. Please create a new project first.')
      return
    }

    const lanes = Object.values(store.lanes)
    if (lanes.length === 0) {
      setError('No lanes found. Draw at least one lane before exporting.')
      return
    }

    setStep('building_base')
    setError('')
    setStats(null)

    const payload: ExportPayload = {
      project: store.project,
      lanes,
      junctions: Object.values(store.junctions),
      signals: Object.values(store.signals),
      stopSigns: Object.values(store.stopSigns),
      crosswalks: Object.values(store.crosswalks),
      clearAreas: Object.values(store.clearAreas),
      speedBumps: Object.values(store.speedBumps),
      parkingSpaces: Object.values(store.parkingSpaces),
      roads: Object.values(store.roads),
      options: { exportBase, exportSim, exportRouting, exportTxt },
    }

    const worker = getWorker()

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data

      switch (msg.type) {
        case 'progress':
          if (msg.step === 'done') {
            setStep('done')
          } else {
            setStep(msg.step)
          }
          if (msg.stats) {
            setStats(msg.stats)
          }
          break

        case 'result':
          if (msg.data instanceof Uint8Array) {
            downloadBinary(msg.data, msg.file)
          } else {
            downloadText(msg.data, msg.file)
          }
          break

        case 'error':
          setError(msg.message)
          setStep('error')
          break
      }
    }

    worker.onerror = (e) => {
      setError(e.message || 'Worker error')
      setStep('error')
      console.error('Export worker error:', e)
    }

    worker.postMessage({ type: 'export', payload })
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
