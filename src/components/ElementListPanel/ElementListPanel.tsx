import { useState, useMemo, useDeferredValue } from 'react'
import { ChevronRight, ChevronDown, Search } from 'lucide-react'
import { useMapStore } from '@/store/mapStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { MapElement } from '@/types/editor'

const ELEMENT_GROUPS = [
  { storeKey: 'roads', label: 'Roads', color: '#81c784' },
  { storeKey: 'lanes', label: 'Lanes', color: '#4fc3f7' },
  { storeKey: 'junctions', label: 'Junctions', color: '#ffb74d' },
  { storeKey: 'signals', label: 'Signals', color: '#e57373' },
  { storeKey: 'stopSigns', label: 'Stop Signs', color: '#ff8a65' },
  { storeKey: 'crosswalks', label: 'Crosswalks', color: '#ba68c8' },
  { storeKey: 'clearAreas', label: 'Clear Areas', color: '#fff176' },
  { storeKey: 'speedBumps', label: 'Speed Bumps', color: '#a1887f' },
  { storeKey: 'parkingSpaces', label: 'Parking', color: '#90a4ae' },
] as const

const MAX_VISIBLE = 200

function getElementCenter(el: MapElement): [number, number] {
  if (el.type === 'signal') {
    return el.position.geometry.coordinates as [number, number]
  }

  let coords: number[][]
  switch (el.type) {
    case 'lane':
      coords = el.centerLine.geometry.coordinates
      break
    case 'stop_sign':
      coords = el.stopLine.geometry.coordinates
      break
    case 'speed_bump':
      coords = el.line.geometry.coordinates
      break
    default:
      coords = el.polygon.geometry.coordinates[0]
      break
  }

  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
  return [lng, lat]
}

export default function ElementListPanel() {
  const lanes = useMapStore((s) => s.lanes)
  const roads = useMapStore((s) => s.roads)
  const junctions = useMapStore((s) => s.junctions)
  const signals = useMapStore((s) => s.signals)
  const stopSigns = useMapStore((s) => s.stopSigns)
  const crosswalks = useMapStore((s) => s.crosswalks)
  const clearAreas = useMapStore((s) => s.clearAreas)
  const speedBumps = useMapStore((s) => s.speedBumps)
  const parkingSpaces = useMapStore((s) => s.parkingSpaces)

  const { selectedIds, setSelected, requestFlyTo } = useUIStore()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['lanes']))
  const [showAll, setShowAll] = useState<Set<string>>(() => new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery)

  const storeData: Record<string, Record<string, unknown>> = {
    roads,
    lanes,
    junctions,
    signals,
    stopSigns,
    crosswalks,
    clearAreas,
    speedBumps,
    parkingSpaces,
  }

  const groups = useMemo(() => {
    const query = deferredQuery.toLowerCase()
    return ELEMENT_GROUPS.map((g) => {
      const elements = Object.values(storeData[g.storeKey]) as (MapElement | { id: string })[]
      const filtered = query
        ? elements.filter((el) => el.id.toLowerCase().includes(query))
        : elements
      return { ...g, elements: filtered, totalCount: elements.length }
    })
  }, [
    lanes,
    roads,
    junctions,
    signals,
    stopSigns,
    crosswalks,
    clearAreas,
    speedBumps,
    parkingSpaces,
    deferredQuery,
  ])

  const roadCenterCache = useMemo(() => {
    const cache = new Map<string, [number, number]>()
    for (const roadId of Object.keys(roads)) {
      const roadLanes = Object.values(lanes).filter((l) => l.roadId === roadId)
      if (roadLanes.length === 0) continue
      let minLng = Infinity,
        maxLng = -Infinity,
        minLat = Infinity,
        maxLat = -Infinity
      for (const l of roadLanes) {
        for (const [lng, lat] of l.centerLine.geometry.coordinates) {
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
        }
      }
      cache.set(roadId, [(minLng + maxLng) / 2, (minLat + maxLat) / 2])
    }
    return cache
  }, [lanes, roads])

  const handleClick = (el: MapElement | { id: string }, storeKey: string) => {
    setSelected([el.id])
    if (storeKey === 'roads') {
      const center = roadCenterCache.get(el.id)
      if (center) requestFlyTo(center[0], center[1])
    } else {
      const [lng, lat] = getElementCenter(el as MapElement)
      requestFlyTo(lng, lat)
    }
  }

  const handleShowAll = (storeKey: string) => {
    setShowAll((prev) => {
      const next = new Set(prev)
      next.add(storeKey)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full bg-card border-r border-border min-h-0 overflow-hidden">
      <div className="py-2 px-3 border-b border-border bg-background shrink-0">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search elements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {groups.map((group) => {
          const count = group.elements.length
          if (count === 0 && !searchQuery) return null

          const isExpanded = expanded.has(group.storeKey)
          const isShowAll = showAll.has(group.storeKey)
          const visibleLimit = isShowAll ? count : MAX_VISIBLE
          const hiddenCount = count - visibleLimit

          return (
            <Collapsible
              key={group.storeKey}
              open={isExpanded}
              onOpenChange={(open) => {
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (open) next.add(group.storeKey)
                  else next.delete(group.storeKey)
                  return next
                })
              }}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-3 py-1.5 bg-transparent cursor-pointer text-left hover:bg-accent/50 transition-colors">
                {isExpanded ? (
                  <ChevronDown size={13} className="text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                )}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: group.color }}
                />
                <span className="text-[11px] font-semibold text-accent-foreground flex-1">
                  {group.label}
                </span>
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                  {count}
                </Badge>
              </CollapsibleTrigger>

              <CollapsibleContent>
                {count === 0 ? (
                  <div className="px-7 py-2 text-[10px] text-muted-foreground italic">
                    No matches
                  </div>
                ) : (
                  <>
                    {group.elements.slice(0, visibleLimit).map((el) => {
                      const isSelected = selectedIds.includes(el.id)
                      return (
                        <div
                          key={el.id}
                          onClick={() => handleClick(el, group.storeKey)}
                          className={cn(
                            'px-7 py-1 text-[11px] font-mono cursor-pointer truncate transition-colors',
                            isSelected
                              ? 'bg-primary/15 text-primary'
                              : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                          )}
                        >
                          {el.id}
                        </div>
                      )
                    })}
                    {hiddenCount > 0 && (
                      <button
                        onClick={() => handleShowAll(group.storeKey)}
                        className="px-7 py-1.5 text-[10px] text-primary hover:text-primary/80 cursor-pointer bg-transparent border-none text-left w-full"
                      >
                        Show {hiddenCount} more...
                      </button>
                    )}
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
