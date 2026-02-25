import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <Dialog open onOpenChange={() => setShowNewProjectDialog(false)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Welcome to Apollo Map Studio</DialogTitle>
          <DialogDescription>
            Create a new HD map project by setting the map name and coordinate origin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          {/* Introduction card */}
          <div className="bg-background border border-border rounded-lg p-4">
            <div className="text-[13px] font-semibold text-accent-foreground mb-1.5">
              Browser-based HD Map Editor for Apollo
            </div>
            <p className="m-0 text-muted-foreground text-xs leading-relaxed">
              Create and edit high-definition maps for the Apollo autonomous driving platform. Draw
              lanes, junctions, signals, crosswalks, and other map elements, then export to{' '}
              <span className="text-chart-5">base_map.bin</span>,{' '}
              <span className="text-chart-5">sim_map.bin</span>, and{' '}
              <span className="text-chart-5">routing_map.bin</span>.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {['Lane Editing', 'Topology', 'Junctions', 'Protobuf Export'].map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] text-chart-5 bg-[#1a3a5c] px-2 py-0.5 rounded-full border border-primary/30"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <p className="m-0 text-muted-foreground text-xs">
            Set the map name and coordinate origin. All ENU coordinates will be relative to this
            origin.
          </p>

          {/* Quick presets */}
          <div>
            <div className="text-[10px] text-muted-foreground mb-1.5">QUICK PRESETS</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.name}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handlePreset(preset)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>

          <Field label="Project Name" error={errors.name?.message}>
            <Input {...register('name')} placeholder="My Map" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Origin Latitude" error={errors.originLat?.message}>
              <Input
                type="number"
                step="0.000001"
                {...register('originLat', { valueAsNumber: true })}
              />
            </Field>
            <Field label="Origin Longitude" error={errors.originLon?.message}>
              <Input
                type="number"
                step="0.000001"
                {...register('originLon', { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="border-l-[3px] border-l-primary bg-background py-2 px-3 rounded-r text-[11px] text-muted-foreground leading-relaxed">
            Set the origin to the center of your map area. This determines the local coordinate
            system used in the exported .bin files.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowNewProjectDialog(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Project</Button>
          </DialogFooter>

          {/* Import hint */}
          <div className="border-t border-border mt-1 pt-3 text-[11px] text-muted-foreground text-center">
            Have an existing map? Close this dialog and use{' '}
            <span className="text-primary">Import</span> to load a base_map.bin file.
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
    <div className="flex flex-col gap-1">
      <Label className="text-[10px]">{label}</Label>
      {children}
      {error && <span className="text-destructive text-[10px]">{error}</span>}
    </div>
  )
}
