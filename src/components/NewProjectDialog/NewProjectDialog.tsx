import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
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

type FormData = {
  name: string
  originLat: number
  originLon: number
}

// Example locations for quick setup
const PRESETS = [
  { name: 'Borregas Ave (Sunnyvale)', lat: 37.4153, lon: -122.0119 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { name: 'Beijing', lat: 39.9042, lon: 116.4074 },
  { name: 'Shanghai', lat: 31.2304, lon: 121.4737 },
]

export default function NewProjectDialog() {
  const { t } = useTranslation()
  const { setShowNewProjectDialog } = useUIStore()
  const { setProject, clear } = useMapStore()

  const schema = z.object({
    name: z.string().min(1, t('common.nameRequired')),
    originLat: z.number().min(-90).max(90),
    originLon: z.number().min(-180).max(180),
  })

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
    clear()
    setGlobalProjection(data.originLat, data.originLon)
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

  const tags = [
    t('dialogs.newProject.intro.tag.laneEditing'),
    t('dialogs.newProject.intro.tag.topology'),
    t('dialogs.newProject.intro.tag.junctions'),
    t('dialogs.newProject.intro.tag.protobuf'),
  ]

  return (
    <Dialog open onOpenChange={() => setShowNewProjectDialog(false)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('dialogs.newProject.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.newProject.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          {/* Introduction card */}
          <div className="bg-background border border-border rounded-lg p-4">
            <div className="text-[13px] font-semibold text-accent-foreground mb-1.5">
              {t('dialogs.newProject.intro.heading')}
            </div>
            <p className="m-0 text-muted-foreground text-xs leading-relaxed">
              {t('dialogs.newProject.intro.body')}
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {tags.map((tag) => (
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
            {t('dialogs.newProject.coordinateHint')}
          </p>

          {/* Quick presets */}
          <div>
            <div className="text-[10px] text-muted-foreground mb-1.5">
              {t('dialogs.newProject.presets.label')}
            </div>
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

          <Field label={t('dialogs.newProject.field.projectName')} error={errors.name?.message}>
            <Input
              {...register('name')}
              placeholder={t('dialogs.newProject.field.projectNamePlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field
              label={t('dialogs.newProject.field.originLat')}
              error={errors.originLat?.message}
            >
              <Input
                type="number"
                step="0.000001"
                {...register('originLat', { valueAsNumber: true })}
              />
            </Field>
            <Field
              label={t('dialogs.newProject.field.originLon')}
              error={errors.originLon?.message}
            >
              <Input
                type="number"
                step="0.000001"
                {...register('originLon', { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="border-l-[3px] border-l-primary bg-background py-2 px-3 rounded-r text-[11px] text-muted-foreground leading-relaxed">
            {t('dialogs.newProject.hint')}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowNewProjectDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('dialogs.newProject.createProject')}</Button>
          </DialogFooter>

          {/* Import hint */}
          <div className="border-t border-border mt-1 pt-3 text-[11px] text-muted-foreground text-center">
            {t('dialogs.newProject.importHint')}
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
