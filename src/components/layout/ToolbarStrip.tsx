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
import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ShapeType, getEntriesForShape } from '@/types/shapes'
import type { ToolState } from '@/types/editor'

// --- Domain-specific icons (reused from original) ---

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

// --- Shape definitions for the top row ---

interface ShapeDef {
  shape: ShapeType
  label: string
  icon: React.ReactNode
  shortcut: string
}

const SHAPE_DEFS: ShapeDef[] = [
  { shape: ShapeType.Polyline, label: 'Polyline', icon: <Spline size={16} />, shortcut: '1' },
  {
    shape: ShapeType.RotatableRect,
    label: 'Rectangle',
    icon: <RectangleHorizontal size={16} />,
    shortcut: '2',
  },
  { shape: ShapeType.Polygon, label: 'Polygon', icon: <Pentagon size={16} />, shortcut: '3' },
  { shape: ShapeType.Curve, label: 'Curve', icon: <PenTool size={16} />, shortcut: '4' },
]

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
  const { toolState, setToolState, startDrawing, selectShape } = useUIStore()

  const activeShape = getActiveShape(toolState)
  const activeElementType = getActiveElementType(toolState)

  // Get element entries for the currently active shape
  const elementEntries = activeShape ? getEntriesForShape(activeShape) : []

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
                <span className="hidden lg:inline">Select</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Select <span className="text-muted-foreground">(S)</span>
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
                <span className="hidden lg:inline">Connect</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Connect Lanes <span className="text-muted-foreground">(C)</span>
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
                <span className="hidden lg:inline">Undo</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Undo <span className="text-muted-foreground">(Ctrl+Z)</span>
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
                <span className="hidden lg:inline">Redo</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Redo <span className="text-muted-foreground">(Ctrl+Y)</span>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Bottom row: element types for current shape */}
        {elementEntries.length > 0 && (
          <div className="flex h-9 items-center px-2 gap-0.5 border-t border-border/50 overflow-x-auto">
            {elementEntries.map((entry) => (
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
                    <span>{entry.label}</span>
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {entry.label}
                  {entry.shortcut && (
                    <span className="ml-2 text-muted-foreground">({entry.shortcut})</span>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
