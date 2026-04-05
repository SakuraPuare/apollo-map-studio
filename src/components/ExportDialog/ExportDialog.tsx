import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      setError(t('dialogs.export.noProject'))
      return
    }

    const lanes = Object.values(store.lanes)
    if (lanes.length === 0) {
      setError(t('dialogs.export.noLanes'))
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
    idle: t('dialogs.export.step.idle'),
    building_base: t('dialogs.export.step.building_base'),
    building_sim: t('dialogs.export.step.building_sim'),
    building_routing: t('dialogs.export.step.building_routing'),
    encoding: t('dialogs.export.step.encoding'),
    done: t('dialogs.export.step.done'),
    error: t('dialogs.export.step.error'),
  }

  const isExporting = step !== 'idle' && step !== 'done' && step !== 'error'

  return (
    <Dialog open onOpenChange={() => setShowExportDialog(false)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('dialogs.export.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.export.description')}</DialogDescription>
        </DialogHeader>

        {/* File selection */}
        <div className="flex flex-col gap-2">
          <CheckItem
            checked={exportBase}
            onChange={setExportBase}
            label={t('dialogs.export.base.label')}
            desc={t('dialogs.export.base.desc')}
          />
          <CheckItem
            checked={exportSim}
            onChange={setExportSim}
            label={t('dialogs.export.sim.label')}
            desc={t('dialogs.export.sim.desc')}
          />
          <CheckItem
            checked={exportRouting}
            onChange={setExportRouting}
            label={t('dialogs.export.routing.label')}
            desc={t('dialogs.export.routing.desc')}
          />
          <CheckItem
            checked={exportTxt}
            onChange={setExportTxt}
            label={t('dialogs.export.txt.label')}
            desc={t('dialogs.export.txt.desc')}
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
                {stats.nodes > 0
                  ? t('dialogs.export.statsWithGraph', {
                      lanes: stats.lanes,
                      roads: stats.roads,
                      nodes: stats.nodes,
                      edges: stats.edges,
                    })
                  : t('dialogs.export.stats', { lanes: stats.lanes, roads: stats.roads })}
              </div>
            )}
            {error && <div className="text-destructive text-[11px] mt-1 break-all">{error}</div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowExportDialog(false)}>
            {t('common.close')}
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {step === 'done' ? t('dialogs.export.exportAgain') : t('common.export')}
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
