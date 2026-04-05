import { useMemo } from 'react'
import { Layers, SlidersHorizontal, MousePointerClick } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import LaneProperties from './LaneProperties'
import LayersTab from './LayersTab'
import type { MapElement } from '@/types/editor'

export default function PropertiesPanel() {
  const { t } = useTranslation()
  const { selectedIds } = useUIStore()

  const id = selectedIds[0] ?? ''
  const roads = useMapStore((s) => s.roads)
  const element = useMapStore((s) => {
    if (!id) return undefined
    return (
      s.lanes[id] ??
      s.junctions[id] ??
      s.signals[id] ??
      s.stopSigns[id] ??
      s.crosswalks[id] ??
      s.clearAreas[id] ??
      s.speedBumps[id] ??
      s.parkingSpaces[id]
    )
  })

  return (
    <div className="h-full bg-card border-l border-border flex flex-col overflow-hidden">
      <Tabs defaultValue="properties" className="flex flex-col h-full">
        <TabsList className="w-full rounded-none border-b border-border bg-background h-8 p-0 shrink-0">
          <TabsTrigger
            value="properties"
            className="flex-1 rounded-none h-8 text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            <SlidersHorizontal size={13} />
            {t('properties.tab.properties')}
          </TabsTrigger>
          <TabsTrigger
            value="layers"
            className="flex-1 rounded-none h-8 text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            <Layers size={13} />
            {t('properties.tab.layers')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="flex-1 overflow-y-auto mt-0">
          <PropertiesContent selectedIds={selectedIds} id={id} roads={roads} element={element} />
        </TabsContent>

        <TabsContent value="layers" className="flex-1 overflow-y-auto mt-0">
          <LayersTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PropertiesContent({
  selectedIds,
  id,
  roads,
  element,
}: {
  selectedIds: string[]
  id: string
  roads: ReturnType<typeof useMapStore.getState>['roads']
  element: MapElement | undefined
}) {
  const { t } = useTranslation()

  if (selectedIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <MousePointerClick size={32} className="text-muted-foreground/40 mb-3" />
        <p className="text-xs text-muted-foreground">{t('properties.emptyState')}</p>
      </div>
    )
  }

  if (roads[id]) {
    return <RoadProperties roadId={id} />
  }

  if (!element) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        {t('properties.elementNotFound')} <span className="font-mono">{id}</span>
      </div>
    )
  }

  switch (element.type) {
    case 'lane':
      return <LaneProperties lane={element} />
    case 'signal':
      return (
        <GenericProperties
          type={t('properties.type.trafficSignal')}
          id={element.id}
          onDelete={() => {
            useMapStore.getState().removeElement(element.id, 'signal')
            useUIStore.getState().setSelected([])
          }}
        />
      )
    default:
      return (
        <GenericProperties
          type={element.type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          id={element.id}
          onDelete={() => {
            useMapStore.getState().removeElement(id, element.type)
            useUIStore.getState().setSelected([])
          }}
        />
      )
  }
}

function GenericProperties({
  type,
  id,
  onDelete,
}: {
  type: string
  id: string
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="p-4 text-xs">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {type}
      </div>
      <div className="text-xs text-accent-foreground font-mono break-all mb-4 bg-muted/50 px-2 py-1.5 rounded">
        {id}
      </div>
      <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
        {t('properties.generic.delete')}
      </Button>
    </div>
  )
}

function RoadProperties({ roadId }: { roadId: string }) {
  const { t } = useTranslation()
  const roads = useMapStore((s) => s.roads)
  const lanes = useMapStore((s) => s.lanes)
  const updateRoad = useMapStore((s) => s.updateRoad)
  const removeRoad = useMapStore((s) => s.removeRoad)
  const autoComputeNeighbors = useMapStore((s) => s.autoComputeNeighbors)
  const { setSelected, setStatus } = useUIStore()
  const road = roads[roadId]

  const laneCount = useMemo(
    () => Object.values(lanes).filter((l) => l.roadId === roadId).length,
    [lanes, roadId]
  )

  if (!road) return null

  const handleAutoNeighbors = async () => {
    const count = await autoComputeNeighbors(roadId)
    setStatus(t('status.autoNeighbors', { count, name: road.name }))
  }

  return (
    <div className="p-4 text-xs flex flex-col gap-3">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {t('properties.type.road')}
      </div>
      <div className="text-xs text-accent-foreground font-mono break-all bg-muted/50 px-2 py-1.5 rounded">
        {road.id}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground font-medium">
          {t('properties.road.name')}
        </label>
        <Input
          defaultValue={road.name}
          key={`${road.id}-name`}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v) updateRoad({ ...road, name: v })
          }}
          placeholder={t('properties.road.namePlaceholder')}
          className="h-7 text-xs"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground font-medium">
          {t('properties.road.type')}
        </label>
        <Select
          value={String(road.type)}
          onValueChange={(v) => updateRoad({ ...road, type: Number(v) })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t('properties.road.type.unknown')}</SelectItem>
            <SelectItem value="1">{t('properties.road.type.highway')}</SelectItem>
            <SelectItem value="2">{t('properties.road.type.cityRoad')}</SelectItem>
            <SelectItem value="3">{t('properties.road.type.park')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground">
        {t('properties.road.lanes', { count: laneCount })}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleAutoNeighbors}
        disabled={laneCount < 2}
      >
        {t('properties.road.autoNeighbors')}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        className="w-full"
        onClick={() => {
          removeRoad(roadId)
          setSelected([])
        }}
      >
        {t('properties.road.deleteRoad')}
      </Button>
    </div>
  )
}
