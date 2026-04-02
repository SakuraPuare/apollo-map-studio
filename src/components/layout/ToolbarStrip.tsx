import {
  MousePointer,
  Link2,
  Hexagon,
  Octagon,
  SquareX,
  Waves,
  RotateCcw,
  RotateCw,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { DrawMode } from '@/types/editor'

// Domain-specific icons
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

interface Tool {
  mode: DrawMode
  label: string
  icon: React.ReactNode
  shortcut?: string
}

const DRAW_TOOLS: Tool[] = [
  { mode: 'select', label: 'Select', shortcut: 'S', icon: <MousePointer size={16} /> },
  { mode: 'draw_lane', label: 'Lane', shortcut: 'L', icon: <LaneIcon /> },
  { mode: 'connect_lanes', label: 'Connect', shortcut: 'C', icon: <Link2 size={16} /> },
  { mode: 'draw_junction', label: 'Junction', shortcut: 'J', icon: <Hexagon size={16} /> },
  { mode: 'draw_crosswalk', label: 'Crosswalk', shortcut: 'W', icon: <CrosswalkIcon /> },
  { mode: 'draw_signal', label: 'Signal', shortcut: 'T', icon: <SignalIcon /> },
  { mode: 'draw_stop_sign', label: 'Stop Sign', shortcut: 'P', icon: <Octagon size={16} /> },
  { mode: 'draw_clear_area', label: 'Clear Area', shortcut: 'A', icon: <SquareX size={16} /> },
  { mode: 'draw_speed_bump', label: 'Speed Bump', shortcut: 'B', icon: <Waves size={16} /> },
  { mode: 'draw_parking_space', label: 'Parking', shortcut: 'K', icon: <ParkingIcon /> },
]

export default function ToolbarStrip() {
  const { drawMode, setDrawMode } = useUIStore()

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
      <div className="flex h-9 items-center bg-[#262626] border-b border-border px-2 gap-0.5 shrink-0 select-none overflow-x-auto">
        {/* Draw tools */}
        {DRAW_TOOLS.map((tool) => (
          <Tooltip key={tool.mode}>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={drawMode === tool.mode}
                onPressedChange={() => setDrawMode(tool.mode)}
                className="h-7 px-2 gap-1.5 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary shrink-0"
              >
                {tool.icon}
                <span className="hidden lg:inline">{tool.label}</span>
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {tool.label}
              {tool.shortcut && (
                <span className="ml-2 text-muted-foreground">({tool.shortcut})</span>
              )}
            </TooltipContent>
          </Tooltip>
        ))}

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Edit tools */}
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
    </TooltipProvider>
  )
}
