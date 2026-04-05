import {
  MousePointer,
  Link2,
  Hexagon,
  Octagon,
  SquareX,
  Waves,
  RotateCcw,
  RotateCw,
  Spline,
  RectangleHorizontal,
  Pentagon,
  PenTool,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ShapeType, getEntriesForShape } from '@/types/shapes'
import type { ToolState } from '@/types/editor'

// --- Domain-specific icons ---

const LaneIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M2 14L14 2" />
    <circle cx="2" cy="14" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="14" cy="2" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

const CrosswalkIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <line x1="5" y1="3" x2="5" y2="13" />
    <line x1="8" y1="3" x2="8" y2="13" />
    <line x1="11" y1="3" x2="11" y2="13" />
  </svg>
)

const SignalIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="5" y="1" width="6" height="14" rx="1.5" />
    <circle cx="8" cy="4.5" r="1.2" />
    <circle cx="8" cy="8" r="1.2" />
    <circle cx="8" cy="11.5" r="1.2" />
  </svg>
)

const ParkingIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="2" y="2" width="12" height="12" rx="2" />
    <path d="M6 12V4H9.5C11.157 4 12.5 5.343 12.5 7C12.5 8.657 11.157 10 9.5 10H6" fill="none" />
  </svg>
)

// --- Icon mapping for element types ---

const ELEMENT_ICONS: Record<string, React.ReactNode> = {
  lane: <LaneIcon />,
  signal: <SignalIcon />,
  stop_sign: <Octagon size={16} />,
  speed_bump: <Waves size={16} />,
  crosswalk: <CrosswalkIcon />,
  parking: <ParkingIcon />,
  junction: <Hexagon size={16} />,
  clear_area: <SquareX size={16} />,
  lane_curve: <LaneIcon />,
}

// i18n key mapping for element types
const ELEMENT_TYPE_KEYS: Record<string, string> = {
  lane: 'toolbar.element.lane',
  signal: 'toolbar.element.signal',
  stop_sign: 'toolbar.element.stopSign',
  speed_bump: 'toolbar.element.speedBump',
  crosswalk: 'toolbar.element.crosswalk',
  parking_space: 'toolbar.element.parking',
  junction: 'toolbar.element.junction',
  clear_area: 'toolbar.element.clearArea',
  lane_curve: 'toolbar.element.laneCurve',
}

// --- Helpers ---

function getActiveShape(ts: ToolState): ShapeType | null {
  if (ts.kind === 'draw') return ts.intent.shape
  return null
}

function getActiveElementType(ts: ToolState): string | null {
  if (ts.kind === 'draw') return ts.intent.elementType
  return null
}

// --- Component ---

export default function ToolbarStrip() {
  const { t } = useTranslation()
  const { toolState, setToolState, startDrawing, selectShape } = useUIStore()

  const activeShape = getActiveShape(toolState)
  const activeElementType = getActiveElementType(toolState)

  const elementEntries = activeShape ? getEntriesForShape(activeShape) : []

  const SHAPE_DEFS = [
    {
      shape: ShapeType.Polyline,
      label: t('toolbar.shape.polyline'),
      icon: <Spline size={16} />,
      shortcut: '1',
    },
    {
      shape: ShapeType.RotatableRect,
      label: t('toolbar.shape.rectangle'),
      icon: <RectangleHorizontal size={16} />,
      shortcut: '2',
    },
    {
      shape: ShapeType.Polygon,
      label: t('toolbar.shape.polygon'),
      icon: <Pentagon size={16} />,
      shortcut: '3',
    },
    {
      shape: ShapeType.Curve,
      label: t('toolbar.shape.curve'),
      icon: <PenTool size={16} />,
      shortcut: '4',
    },
  ]

  const handleUndo = () => {
    const temporal = (
      useMapStore as unknown as { temporal?: { getState: () => { undo: () => void } } }
    ).temporal?.getState()
    temporal?.undo()
  }

  const handleRedo = () => {
    const temporal = (
      useMapStore as unknown as { temporal?: { getState: () => { redo: () => void } } }
    ).temporal?.getState()
    temporal?.redo()
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col bg-[#262626] border-b border-border shrink-0 select-none">
        {/* Top row: shape tools */}
        <div className="flex h-9 items-center px-2 gap-0.5 overflow-x-auto">
          {/* Select */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={toolState.kind === 'select'}
                onPressedChange={() => setToolState({ kind: 'select' })}
                className="h-7 px-2 gap-1.5 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary shrink-0"
              >
                <MousePointer size={16} />
                <span className="hidden lg:inline">{t('toolbar.select')}</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t('toolbar.select')} <span className="text-muted-foreground">(S)</span>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Shape tools */}
          {SHAPE_DEFS.map((def) => (
            <Tooltip key={def.shape}>
              <TooltipTrigger asChild>
                <Toggle
                  size="sm"
                  pressed={activeShape === def.shape}
                  onPressedChange={() => selectShape(def.shape)}
                  className="h-7 px-2 gap-1.5 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary shrink-0"
                >
                  {def.icon}
                  <span className="hidden lg:inline">{def.label}</span>
                </Toggle>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {def.label} <span className="text-muted-foreground">({def.shortcut})</span>
              </TooltipContent>
            </Tooltip>
          ))}

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Connect tool */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={toolState.kind === 'connect_lanes'}
                onPressedChange={() => setToolState({ kind: 'connect_lanes' })}
                className="h-7 px-2 gap-1.5 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary shrink-0"
              >
                <Link2 size={16} />
                <span className="hidden lg:inline">{t('toolbar.connect')}</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t('toolbar.connectLanes')} <span className="text-muted-foreground">(C)</span>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Undo / Redo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={handleUndo}
                className="h-7 px-2 gap-1.5 text-xs shrink-0"
              >
                <RotateCcw size={14} />
                <span className="hidden lg:inline">{t('toolbar.undo')}</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t('toolbar.undo')} <span className="text-muted-foreground">(Ctrl+Z)</span>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={false}
                onPressedChange={handleRedo}
                className="h-7 px-2 gap-1.5 text-xs shrink-0"
              >
                <RotateCw size={14} />
                <span className="hidden lg:inline">{t('toolbar.redo')}</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {t('toolbar.redo')} <span className="text-muted-foreground">(Ctrl+Y)</span>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Bottom row: element types for current shape */}
        {elementEntries.length > 0 && (
          <div className="flex h-9 items-center px-2 gap-0.5 border-t border-border/50 overflow-x-auto">
            {elementEntries.map((entry) => {
              const label = t(ELEMENT_TYPE_KEYS[entry.elementType] ?? entry.elementType, {
                defaultValue: entry.label,
              })
              return (
                <Tooltip key={`${entry.shape}-${entry.elementType}`}>
                  <TooltipTrigger asChild>
                    <Toggle
                      size="sm"
                      pressed={activeElementType === entry.elementType}
                      onPressedChange={() =>
                        startDrawing({ shape: entry.shape, elementType: entry.elementType })
                      }
                      className="h-7 px-2 gap-1.5 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary shrink-0"
                    >
                      {ELEMENT_ICONS[entry.icon] ?? null}
                      <span>{label}</span>
                    </Toggle>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {label}
                    {entry.shortcut && (
                      <span className="ml-2 text-muted-foreground">({entry.shortcut})</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
