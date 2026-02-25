import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { cn } from '@/lib/utils'
import type { MapElement } from '../../types/editor'

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
  const store = useMapStore()
  const { selectedIds, setSelected, requestFlyTo } = useUIStore()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['lanes']))

  const groups = useMemo(() => {
    return ELEMENT_GROUPS.map((g) => ({
      ...g,
      elements: Object.values(store[g.storeKey]) as (MapElement | { id: string })[],
    }))
  }, [store])

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const getRoadCenter = (roadId: string): [number, number] | null => {
    const roadLanes = Object.values(store.lanes).filter((l) => l.roadId === roadId)
    if (roadLanes.length === 0) return null
    const allCoords = roadLanes.flatMap((l) => l.centerLine.geometry.coordinates)
    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity
    for (const [lng, lat] of allCoords) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
    return [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
  }

  const handleClick = (el: MapElement | { id: string }, storeKey: string) => {
    setSelected([el.id])
    if (storeKey === 'roads') {
      const center = getRoadCenter(el.id)
      if (center) requestFlyTo(center[0], center[1])
    } else {
      const [lng, lat] = getElementCenter(el as MapElement)
      requestFlyTo(lng, lat)
    }
  }

  return (
    <div className="flex flex-col w-[220px] bg-card border-r border-border shrink-0 min-h-0 overflow-hidden">
      <div className="py-2.5 px-4 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-background">
        Explorer
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {groups.map((group) => {
          const isExpanded = expanded.has(group.storeKey)
          const count = group.elements.length
          if (count === 0) return null

          return (
            <div key={group.storeKey}>
              <button
                onClick={() => toggleGroup(group.storeKey)}
                className="flex w-full items-center gap-1.5 px-2 py-1.5 border-none bg-transparent cursor-pointer text-left hover:bg-[#2a2d2e]"
              >
                {isExpanded ? (
                  <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                )}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: group.color }}
                />
                <span className="text-[11px] font-semibold text-accent-foreground">
                  {group.label}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">{count}</span>
              </button>

              {isExpanded &&
                group.elements.map((el) => {
                  const isSelected = selectedIds.includes(el.id)
                  return (
                    <div
                      key={el.id}
                      onClick={() => handleClick(el, group.storeKey)}
                      className={cn(
                        'px-7 py-1 text-[11px] font-mono cursor-pointer truncate',
                        isSelected
                          ? 'bg-[#37373d] text-white'
                          : 'text-muted-foreground hover:bg-[#2a2d2e] hover:text-accent-foreground'
                      )}
                    >
                      {el.id}
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
