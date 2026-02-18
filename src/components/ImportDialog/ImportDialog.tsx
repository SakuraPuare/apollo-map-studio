import { useState, useRef } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { parseBaseMap } from '../../import/parseBaseMap'
import { Overlay, Dialog } from '../ExportDialog/ExportDialog'

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
    <Overlay>
      <Dialog title="Import base_map.bin" onClose={() => setShowImportDialog(false)}>
        <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: 12 }}>
          Load an existing Apollo HD Map binary file to edit it.
        </p>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{
            border: '2px dashed #334155',
            borderRadius: 8,
            padding: 32,
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: 12,
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#334155')}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <div style={{ fontSize: 13, color: '#e2e8f0' }}>Drop base_map.bin here</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>or click to browse</div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".bin"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />

        {/* Status */}
        {status !== 'idle' && (
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: 10,
              marginBottom: 12,
              fontSize: 11,
              color: status === 'error' ? '#f87171' : status === 'done' ? '#4ade80' : '#93c5fd',
            }}
          >
            {status === 'loading' && '⏳ '}
            {status === 'done' && '✓ '}
            {status === 'error' && '✗ '}
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowImportDialog(false)}
            style={{
              background: '#374151',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 12,
              cursor: 'pointer',
              color: '#f1f5f9',
            }}
          >
            {status === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </Dialog>
    </Overlay>
  )
}
