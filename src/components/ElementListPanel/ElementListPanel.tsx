import { useState, useMemo, useDeferredValue, memo, useCallback } from 'react'
import { ChevronRight, ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMapStore } from '@/store/mapStore'
import { useShallow } from 'zustand/react/shallow'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { MapElement, LaneFeature, RoadDefinition } from '@/types/editor'

type StoreKeys =
  | 'roads'
  | 'lanes'
  | 'junctions'
  | 'signals'
  | 'stopSigns'
  | 'crosswalks'
  | 'clearAreas'
  | 'speedBumps'
  | 'parkingSpaces'

const ELEMENT_GROUPS: { storeKey: StoreKeys; labelKey: string; color: string }[] = [
  { storeKey: 'roads', labelKey: 'elements.roads', color: '#81c784' },
  { storeKey: 'lanes', labelKey: 'elements.lanes', color: '#4fc3f7' },
  { storeKey: 'junctions', labelKey: 'elements.junctions', color: '#ffb74d' },
  { storeKey: 'signals', labelKey: 'elements.signals', color: '#e57373' },
  { storeKey: 'stopSigns', labelKey: 'elements.stopSigns', color: '#ff8a65' },
  { storeKey: 'crosswalks', labelKey: 'elements.crosswalks', color: '#ba68c8' },
  { storeKey: 'clearAreas', labelKey: 'elements.clearAreas', color: '#fff176' },
  { storeKey: 'speedBumps', labelKey: 'elements.speedBumps', color: '#a1887f' },
  { storeKey: 'parkingSpaces', labelKey: 'elements.parking', color: '#90a4ae' },
]

const MAX_VISIBLE = 200

// Single selector — one subscription, one re-render per store update
const selectElementCounts = (s: {
  lanes: Record<string, LaneFeature>
  roads: Record<string, RoadDefinition>
  junctions: Record<string, unknown>
  signals: Record<string, unknown>
  stopSigns: Record<string, unknown>
  crosswalks: Record<string, unknown>
  clearAreas: Record<string, unknown>
  speedBumps: Record<string, unknown>
  parkingSpaces: Record<string, unknown>
}) => ({
  lanes: s.lanes,
  roads: s.roads,
  junctions: s.junctions,
  signals: s.signals,
  stopSigns: s.stopSigns,
  crosswalks: s.crosswalks,
  clearAreas: s.clearAreas,
  speedBumps: s.speedBumps,
  parkingSpaces: s.parkingSpaces,
})

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

/** Memoized list item — only re-renders when its own selection state changes */
const ElementItem = memo(function ElementItem({
  id,
  isSelected,
  onClick,
}: {
  id: string
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'px-7 py-1 text-[11px] font-mono cursor-pointer truncate transition-colors',
        isSelected
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
      )}
    >
      {id}
    </div>
  )
})

export default function ElementListPanel() {
  const { t } = useTranslation()
  const storeData = useMapStore(useShallow(selectElementCounts))
  const { lanes } = storeData

  const { selectedIds, setSelected, requestFlyTo } = useUIStore()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['lanes']))
  const [showAll, setShowAll] = useState<Set<string>>(() => new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery)

  // O(1) lookup instead of selectedIds.includes() O(n)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // Only compute element counts (cheap) — defer full filtering to expanded groups
  const groupMeta = useMemo(() => {
    return ELEMENT_GROUPS.map((g) => {
      const count = Object.keys(storeData[g.storeKey]).length
      return { ...g, totalCount: count }
    })
  }, [storeData])

  // Filtered elements only for expanded groups (avoid work for collapsed groups)
  const expandedGroupElements = useMemo(() => {
    const query = deferredQuery.toLowerCase()
    const result = new Map<string, (MapElement | { id: string })[]>()
    for (const g of ELEMENT_GROUPS) {
      if (!expanded.has(g.storeKey) && !query) continue
      const elements = Object.values(storeData[g.storeKey]) as (MapElement | { id: string })[]
      const filtered = query
        ? elements.filter((el) => el.id.toLowerCase().includes(query))
        : elements
      result.set(g.storeKey, filtered)
    }
    return result
  }, [storeData, deferredQuery, expanded])

  // Road center cache — single pass O(lanes) instead of O(roads × lanes)
  const roadCenterCache = useMemo(() => {
    const cache = new Map<string, [number, number]>()
    const bboxes = new Map<string, [number, number, number, number]>()

    // Single pass: group bbox computation by roadId
    for (const lane of Object.values(lanes)) {
      if (!lane.roadId) continue
      let bbox = bboxes.get(lane.roadId)
      if (!bbox) {
        bbox = [Infinity, Infinity, -Infinity, -Infinity]
        bboxes.set(lane.roadId, bbox)
      }
      for (const [lng, lat] of lane.centerLine.geometry.coordinates) {
        if (lng < bbox[0]) bbox[0] = lng
        if (lat < bbox[1]) bbox[1] = lat
        if (lng > bbox[2]) bbox[2] = lng
        if (lat > bbox[3]) bbox[3] = lat
      }
    }

    for (const [roadId, bbox] of bboxes) {
      cache.set(roadId, [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2])
    }
    return cache
  }, [lanes])

  const handleClick = useCallback(
    (el: MapElement | { id: string }, storeKey: string) => {
      setSelected([el.id])
      if (storeKey === 'roads') {
        const center = roadCenterCache.get(el.id)
        if (center) requestFlyTo(center[0], center[1])
      } else {
        const [lng, lat] = getElementCenter(el as MapElement)
        requestFlyTo(lng, lat)
      }
    },
    [setSelected, requestFlyTo, roadCenterCache]
  )

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
            placeholder={t('elementList.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {groupMeta.map((group) => {
          const elements = expandedGroupElements.get(group.storeKey)
          const count = elements?.length ?? group.totalCount
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
                  {t(group.labelKey)}
                </span>
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                  {count}
                </Badge>
              </CollapsibleTrigger>

              <CollapsibleContent>
                {!elements || count === 0 ? (
                  <div className="px-7 py-2 text-[10px] text-muted-foreground italic">
                    {t('elementList.noMatches')}
                  </div>
                ) : (
                  <>
                    {elements.slice(0, visibleLimit).map((el) => (
                      <ElementItem
                        key={el.id}
                        id={el.id}
                        isSelected={selectedSet.has(el.id)}
                        onClick={() => handleClick(el, group.storeKey)}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        onClick={() => handleShowAll(group.storeKey)}
                        className="px-7 py-1.5 text-[10px] text-primary hover:text-primary/80 cursor-pointer bg-transparent border-none text-left w-full"
                      >
                        {t('elementList.showMore', { count: hiddenCount })}
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
