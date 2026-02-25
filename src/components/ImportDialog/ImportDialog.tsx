import { useState, useRef } from 'react'
import { Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { parseBaseMap } from '../../import/parseBaseMap'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function ImportDialog() {
  const { setShowImportDialog } = useUIStore()
  const { setProject, loadState } = useMapStore()

  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    try {
      setStatus('loading')
      setMessage('Parsing base_map.bin...')

      const buffer = await file.arrayBuffer()
      const parsed = await parseBaseMap(new Uint8Array(buffer))

      // Update store
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

      setMessage(
        `Loaded: ${parsed.lanes.length} lanes, ${parsed.junctions.length} junctions, ` +
          `${parsed.signals.length} signals, ${parsed.crosswalks.length} crosswalks`
      )
      setStatus('done')
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
          <DialogTitle>Import base_map.bin</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-[13px] m-0">
          Load an existing Apollo HD Map binary file to edit it.
        </p>

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
          <div className="text-sm text-accent-foreground">Drop base_map.bin here</div>
          <div className="text-[11px] text-muted-foreground mt-1">or click to browse</div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".bin"
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Status */}
        {status !== 'idle' && (
          <div
            className={cn(
              'bg-background border border-border rounded-md p-2.5 text-xs flex items-center gap-1.5',
              status === 'error' && 'text-destructive',
              status === 'done' && 'text-chart-2',
              status === 'loading' && 'text-chart-5'
            )}
          >
            {status === 'loading' && <Loader2 size={14} className="animate-spin" />}
            {status === 'done' && <CheckCircle size={14} />}
            {status === 'error' && <XCircle size={14} />}
            {message}
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
