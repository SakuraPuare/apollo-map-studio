import { useState, useRef } from 'react'
import { Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { parseBaseMap, parseBaseMapFromObject } from '../../import/parseBaseMap'
import { decodeMapFromText } from '../../proto/codec'
import { clearBoundaryCache, precomputeBoundariesAsync } from '../../geo/boundaryCache'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function ImportDialog() {
  const { setShowImportDialog, requestFitBounds } = useUIStore()
  const { setProject, loadState } = useMapStore()

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    try {
      setStatus('loading')
      setProgress(0)
      const isTxt = file.name.endsWith('.txt')
      setMessage(isTxt ? 'Decoding text format...' : 'Decoding binary format...')

      let parsed
      if (isTxt) {
        const text = await file.text()
        let obj
        try {
          obj = JSON.parse(text)
        } catch {
          // Not JSON – try protobuf text format
          obj = await decodeMapFromText(text)
        }
        setMessage('Parsing map data...')
        setProgress(0.05)
        parsed = await parseBaseMapFromObject(obj, (p) => setProgress(0.05 + p * 0.45))
      } else {
        const buffer = await file.arrayBuffer()
        setProgress(0.05)
        setMessage('Parsing map data...')
        parsed = await parseBaseMap(new Uint8Array(buffer), (p) => setProgress(0.05 + p * 0.45))
      }

      // Pre-warm boundary cache before loading into store.
      // This prevents the initial render from freezing the UI,
      // because updateBoundaryLayers will hit cache for all lanes.
      if (parsed.lanes.length > 0) {
        clearBoundaryCache()
        setMessage(`Computing geometry (${parsed.lanes.length} lanes)...`)
        await precomputeBoundariesAsync(parsed.lanes, (p) => setProgress(0.5 + p * 0.45))
      }

      // Update store — render triggered by subscription will hit warm cache
      setMessage('Loading into editor...')
      setProgress(0.97)
      setProject(parsed.project)
      loadState({
        lanes: Object.fromEntries(parsed.lanes.map((l) => [l.id, l])),
        junctions: Object.fromEntries(parsed.junctions.map((j) => [j.id, j])),
        signals: Object.fromEntries(parsed.signals.map((s) => [s.id, s])),
        stopSigns: Object.fromEntries(parsed.stopSigns.map((ss) => [ss.id, ss])),
        crosswalks: Object.fromEntries(parsed.crosswalks.map((cw) => [cw.id, cw])),
        clearAreas: Object.fromEntries(parsed.clearAreas.map((ca) => [ca.id, ca])),
        speedBumps: Object.fromEntries(parsed.speedBumps.map((sb) => [sb.id, sb])),
        parkingSpaces: Object.fromEntries(parsed.parkingSpaces.map((ps) => [ps.id, ps])),
        roads: Object.fromEntries(parsed.roads.map((r) => [r.id, r])),
      })

      setProgress(1)
      setMessage(
        `Loaded: ${parsed.lanes.length} lanes, ${parsed.junctions.length} junctions, ` +
          `${parsed.signals.length} signals, ${parsed.crosswalks.length} crosswalks`
      )
      setStatus('done')
      requestFitBounds()
    } catch (err) {
      setMessage(String(err))
      setStatus('error')
      console.error('Import failed:', err)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <Dialog open onOpenChange={() => setShowImportDialog(false)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Import Map File</DialogTitle>
          <DialogDescription>
            Load a base_map.bin (binary protobuf) or base_map.txt (text proto / JSON) file to edit
            it.
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer bg-background transition-colors hover:border-primary"
        >
          <div className="mb-2 flex justify-center">
            <Upload size={32} className="text-muted-foreground" />
          </div>
          <div className="text-sm text-accent-foreground">
            Drop base_map.bin or base_map.txt here
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">or click to browse</div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".bin,.txt"
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Status */}
        {status !== 'idle' && (
          <div
            className={cn(
              'bg-background border border-border rounded-md p-2.5 text-xs flex flex-col gap-1.5',
              status === 'error' && 'text-destructive',
              status === 'done' && 'text-chart-2',
              status === 'loading' && 'text-chart-5'
            )}
          >
            <div className="flex items-center gap-1.5">
              {status === 'loading' && <Loader2 size={14} className="animate-spin shrink-0" />}
              {status === 'done' && <CheckCircle size={14} className="shrink-0" />}
              {status === 'error' && <XCircle size={14} className="shrink-0" />}
              {message}
            </div>
            {status === 'loading' && (
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-150"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowImportDialog(false)}>
            {status === 'done' ? 'Close' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
