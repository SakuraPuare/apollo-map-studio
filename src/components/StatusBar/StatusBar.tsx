import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import { Badge } from '@/components/ui/badge'
import type { ToolState } from '@/types/editor'

function useToolLabel(ts: ToolState): string {
  const { t } = useTranslation()
  if (ts.kind === 'select') return t('status.tool.select')
  if (ts.kind === 'connect_lanes') return t('status.tool.connectLanes')
  if (ts.kind === 'edit_bezier') return t('status.tool.editCurve')
  const { shape, elementType } = ts.intent
  const elKeys: Record<string, string> = {
    lane: 'toolbar.element.lane',
    junction: 'toolbar.element.junction',
    crosswalk: 'toolbar.element.crosswalk',
    clear_area: 'toolbar.element.clearArea',
    speed_bump: 'toolbar.element.speedBump',
    parking_space: 'toolbar.element.parking',
    signal: 'toolbar.element.signal',
    stop_sign: 'toolbar.element.stopSign',
  }
  const shapeKeys: Record<string, string> = {
    point: 'toolbar.shape.polyline',
    polyline: 'toolbar.shape.polyline',
    rotatable_rect: 'toolbar.shape.rectangle',
    polygon: 'toolbar.shape.polygon',
    curve: 'toolbar.shape.curve',
  }
  return t('status.tool.draw', {
    element: t(elKeys[elementType] ?? elementType, { defaultValue: elementType }),
    shape: t(shapeKeys[shape] ?? shape, { defaultValue: shape }),
  })
}

export default function StatusBar() {
  const { t } = useTranslation()
  const { statusMessage, toolState, selectedIds } = useUIStore()
  const { lanes, project } = useMapStore()

  const laneCount = Object.keys(lanes).length
  const toolLabel = useToolLabel(toolState)

  return (
    <div className="flex h-6 items-center px-3 gap-3 text-[11px] bg-[#007acc] text-white shrink-0 select-none">
      {/* Mode pill */}
      <Badge
        variant="secondary"
        className="h-4 px-1.5 text-[10px] font-medium bg-white/20 text-white hover:bg-white/25 border-none rounded-sm"
      >
        {toolLabel}
      </Badge>

      {/* Element count */}
      <span className="text-white/80">{t('status.laneCount', { count: laneCount })}</span>

      {/* Selection */}
      {selectedIds.length > 0 && (
        <span className="text-yellow-200">
          {t('status.selectedCount', { count: selectedIds.length })}
        </span>
      )}

      <span className="flex-1" />

      {/* Project info */}
      {project && (
        <span className="text-white/70 text-[10px]">
          {project.name} · {project.originLat.toFixed(6)}, {project.originLon.toFixed(6)}
        </span>
      )}

      {/* Status message */}
      {(statusMessage || undefined) && (
        <span className="text-white/90">{statusMessage || t('status.ready')}</span>
      )}
    </div>
  )
}
