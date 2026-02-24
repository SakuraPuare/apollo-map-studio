import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { setGlobalProjection } from '../../geo/projection'
import { Overlay, Dialog } from '../ExportDialog/ExportDialog'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  originLat: z.number().min(-90).max(90),
  originLon: z.number().min(-180).max(180),
})

type FormData = z.infer<typeof schema>

// Example locations for quick setup
const PRESETS = [
  { name: 'Borregas Ave (Sunnyvale)', lat: 37.4153, lon: -122.0119 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { name: 'Beijing', lat: 39.9042, lon: 116.4074 },
  { name: 'Shanghai', lat: 31.2304, lon: 121.4737 },
]

export default function NewProjectDialog() {
  const { setShowNewProjectDialog } = useUIStore()
  const { setProject, clear } = useMapStore()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: 'My Map',
      originLat: 37.4153,
      originLon: -122.0119,
    },
  })

  const onSubmit = (data: FormData) => {
    // Clear existing map data
    clear()

    // Set projection
    setGlobalProjection(data.originLat, data.originLon)

    // Set project config
    setProject({
      name: data.name,
      originLat: data.originLat,
      originLon: data.originLon,
      version: '1.0.0',
      date: new Date().toISOString().slice(0, 10),
    })

    setShowNewProjectDialog(false)
  }

  const handlePreset = (preset: (typeof PRESETS)[0]) => {
    setValue('originLat', preset.lat)
    setValue('originLon', preset.lon)
    setValue('name', preset.name)
  }

  return (
    <Overlay>
      <Dialog title="Welcome to Apollo Map Studio" onClose={() => setShowNewProjectDialog(false)}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {/* Introduction card */}
          <div
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>
              Browser-based HD Map Editor for Apollo
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
              Create and edit high-definition maps for the Apollo autonomous driving platform. Draw
              lanes, junctions, signals, crosswalks, and other map elements, then export to{' '}
              <span style={{ color: '#93c5fd' }}>base_map.bin</span>,{' '}
              <span style={{ color: '#93c5fd' }}>sim_map.bin</span>, and{' '}
              <span style={{ color: '#93c5fd' }}>routing_map.bin</span>.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 12,
                flexWrap: 'wrap',
              }}
            >
              {['Lane Editing', 'Topology', 'Junctions', 'Protobuf Export'].map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 10,
                    color: '#93c5fd',
                    background: '#1e3a5f',
                    padding: '3px 8px',
                    borderRadius: 10,
                    border: '1px solid #2563eb30',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>
            Set the map name and coordinate origin. All ENU coordinates will be relative to this
            origin.
          </p>

          {/* Quick presets */}
          <div>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>QUICK PRESETS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  style={{
                    background: '#334155',
                    border: '1px solid #475569',
                    borderRadius: 4,
                    color: '#e2e8f0',
                    padding: '4px 8px',
                    fontSize: 10,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#475569'
                    e.currentTarget.style.borderColor = '#3b82f6'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#334155'
                    e.currentTarget.style.borderColor = '#475569'
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <Field label="Project Name" error={errors.name?.message}>
            <input {...register('name')} placeholder="My Map" style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Origin Latitude" error={errors.originLat?.message}>
              <input
                type="number"
                step="0.000001"
                {...register('originLat', { valueAsNumber: true })}
                style={inputStyle}
              />
            </Field>
            <Field label="Origin Longitude" error={errors.originLon?.message}>
              <input
                type="number"
                step="0.000001"
                {...register('originLon', { valueAsNumber: true })}
                style={inputStyle}
              />
            </Field>
          </div>

          <div
            style={{
              borderLeft: '3px solid #3b82f6',
              background: '#0f172a',
              padding: '8px 12px',
              borderRadius: '0 4px 4px 0',
              fontSize: 11,
              color: '#94a3b8',
              lineHeight: 1.5,
            }}
          >
            Set the origin to the center of your map area. This determines the local coordinate
            system used in the exported .bin files.
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setShowNewProjectDialog(false)}
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
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: '#1d4ed8',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 12,
                cursor: 'pointer',
                color: '#f1f5f9',
              }}
            >
              Create Project
            </button>
          </div>

          {/* Import hint */}
          <div
            style={{
              borderTop: '1px solid #334155',
              marginTop: 4,
              paddingTop: 12,
              fontSize: 11,
              color: '#64748b',
              textAlign: 'center',
            }}
          >
            Have an existing map? Close this dialog and use{' '}
            <span style={{ color: '#93c5fd' }}>Import</span> to load a base_map.bin file.
          </div>
        </form>
      </Dialog>
    </Overlay>
  )
}

function Field({
  label,
  children,
  error,
}: {
  label: string
  children: React.ReactNode
  error?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ color: '#94a3b8', fontSize: 10 }}>{label}</label>
      {children}
      {error && <span style={{ color: '#f87171', fontSize: 10 }}>{error}</span>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#f1f5f9',
  padding: '6px 8px',
  fontSize: 12,
  width: '100%',
  outline: 'none',
}
