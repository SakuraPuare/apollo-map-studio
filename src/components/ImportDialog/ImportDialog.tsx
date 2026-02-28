import { useState, useRef } from 'react'
import { Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { parseBaseMap, parseBaseMapFromObject } from '../../import/parseBaseMap'
import type { ApolloMap } from '../../types/apollo-map'
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
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    try {
      setStatus('loading')
      const isTxt = file.name.endsWith('.txt')
      setMessage(isTxt ? 'Parsing base_map.txt...' : 'Parsing base_map.bin...')

      let parsed
      if (isTxt) {
        const text = await file.text()
        const obj = JSON.parse(text) as ApolloMap
        parsed = await parseBaseMapFromObject(obj)
      } else {
        const buffer = await file.arrayBuffer()
        parsed = await parseBaseMap(new Uint8Array(buffer))
      }

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
            Load a base_map.bin (binary protobuf) or base_map.txt (JSON) file to edit it.
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
