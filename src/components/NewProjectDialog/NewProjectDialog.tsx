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
      <Dialog title="New Map Project" onClose={() => setShowNewProjectDialog(false)}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
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

          <p style={{ margin: 0, color: '#64748b', fontSize: 10 }}>
            Tip: Set the origin to the center of your map area. This determines the local coordinate
            system used in the exported .bin files.
          </p>

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
