import {
  MousePointer,
  Link2,
  Hexagon,
  Octagon,
  SquareX,
  Waves,
  RotateCcw,
  RotateCw,
  Plus,
  FolderOpen,
  Download,
  Check,
  ListTree,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import { cn } from '@/lib/utils'
import type { MapElement } from '../../types/editor'
import { getDrawingController } from '../../drawing/controllerRef'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface DrawTool {
  id: string
  elementType?: MapElement['type']
  special?: 'select' | 'connect'
  label: string
  icon: React.ReactNode
  shortcut?: string
}

// Domain-specific icons that don't have lucide equivalents
const LaneIcon = () => (
  <svg
    width="20"
    height="20"
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
    width="20"
    height="20"
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
    width="20"
    height="20"
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
    width="20"
    height="20"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="2" y="2" width="12" height="12" rx="2" />
    <path d="M6 12V4H9.5C11.157 4 12.5 5.343 12.5 7C12.5 8.657 11.157 10 9.5 10H6" fill="none" />
  </svg>
)

const DRAW_TOOLS: DrawTool[] = [
  {
    id: 'select',
    special: 'select',
    label: 'Select',
    shortcut: 'S',
    icon: <MousePointer size={20} />,
  },
  { id: 'lane', elementType: 'lane', label: 'Lane', shortcut: 'L', icon: <LaneIcon /> },
  { id: 'connect', special: 'connect', label: 'Connect', shortcut: 'C', icon: <Link2 size={20} /> },
  {
    id: 'junction',
    elementType: 'junction',
    label: 'Junction',
    shortcut: 'J',
    icon: <Hexagon size={20} />,
  },
  {
    id: 'crosswalk',
    elementType: 'crosswalk',
    label: 'Crosswalk',
    shortcut: 'W',
    icon: <CrosswalkIcon />,
  },
  { id: 'signal', elementType: 'signal', label: 'Signal', shortcut: 'T', icon: <SignalIcon /> },
  {
    id: 'stop_sign',
    elementType: 'stop_sign',
    label: 'Stop Sign',
    shortcut: 'P',
    icon: <Octagon size={20} />,
  },
  {
    id: 'clear_area',
    elementType: 'clear_area',
    label: 'Clear Area',
    shortcut: 'A',
    icon: <SquareX size={20} />,
  },
  {
    id: 'speed_bump',
    elementType: 'speed_bump',
    label: 'Speed Bump',
    shortcut: 'B',
    icon: <Waves size={20} />,
  },
  {
    id: 'parking_space',
    elementType: 'parking_space',
    label: 'Parking',
    shortcut: 'K',
    icon: <ParkingIcon />,
  },
]

const LAYER_GROUPS: { key: string; label: string; abbrev: string; color: string }[] = [
  { key: 'lanes', label: 'Lanes', abbrev: 'Lns', color: '#4fc3f7' },
  { key: 'boundaries', label: 'Boundaries', abbrev: 'Bnd', color: '#81c784' },
  { key: 'junctions', label: 'Junctions', abbrev: 'Jnc', color: '#ffb74d' },
  { key: 'signals', label: 'Signals', abbrev: 'Sig', color: '#e57373' },
  { key: 'crosswalks', label: 'Crosswalks', abbrev: 'Cwk', color: '#ba68c8' },
  { key: 'stopSigns', label: 'Stop Signs', abbrev: 'Stp', color: '#ff8a65' },
  { key: 'clearAreas', label: 'Clear Areas', abbrev: 'Clr', color: '#fff176' },
  { key: 'speedBumps', label: 'Speed Bumps', abbrev: 'Spd', color: '#a1887f' },
  { key: 'parkingSpaces', label: 'Parking', abbrev: 'Prk', color: '#90a4ae' },
]

export default function Toolbar(): React.ReactElement {
  const {
    drawMode,
    activeCreation,
    setDrawMode,
    setShowNewProjectDialog,
    setShowExportDialog,
    setShowImportDialog,
    setShowValidationDialog,
    layerVisibility,
    toggleLayer,
    showElementListPanel,
    setShowElementListPanel,
  } = useUIStore()

  const handleToolClick = (tool: DrawTool) => {
    if (tool.special === 'select') {
      setDrawMode('select')
    } else if (tool.special === 'connect') {
      setDrawMode('connect_lanes')
    } else if (tool.elementType) {
      getDrawingController()?.startCreation(tool.elementType)
    }
  }

  const isToolActive = (tool: DrawTool): boolean => {
    if (tool.special === 'select') return drawMode === 'select'
    if (tool.special === 'connect') return drawMode === 'connect_lanes'
    return drawMode === 'creating' && activeCreation?.elementType === tool.elementType
  }

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
    <TooltipProvider>
      <div className="flex w-12 flex-col items-center bg-[#333333] z-10 overflow-y-auto">
        {/* Draw tools */}
        {DRAW_TOOLS.map((tool) => (
          <ToolButton
            key={tool.id}
            active={isToolActive(tool)}
            onClick={() => handleToolClick(tool)}
            tooltip={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
            icon={tool.icon}
          />
        ))}

        <Divider />

        <ToolButton
          icon={<ListTree size={20} />}
          tooltip="Element List"
          active={showElementListPanel}
          onClick={() => setShowElementListPanel(!showElementListPanel)}
        />

        <div className="flex-1" />

        <Divider />

        {/* Edit tools */}
        <ToolButton icon={<RotateCcw size={20} />} tooltip="Undo (Ctrl+Z)" onClick={handleUndo} />
        <ToolButton icon={<RotateCw size={20} />} tooltip="Redo (Ctrl+Y)" onClick={handleRedo} />

        <Divider />

        {/* File tools */}
        <ToolButton
          icon={<Plus size={20} />}
          tooltip="New Project"
          onClick={() => setShowNewProjectDialog(true)}
        />
        <ToolButton
          icon={<FolderOpen size={20} />}
          tooltip="Import base_map.bin"
          onClick={() => setShowImportDialog(true)}
        />
        <ToolButton
          icon={<Download size={20} />}
          tooltip="Export .bin files"
          onClick={() => setShowExportDialog(true)}
        />
        <ToolButton
          icon={<Check size={20} />}
          tooltip="Validate map"
          onClick={() => setShowValidationDialog(true)}
        />

        {/* Layer toggles */}
        <Divider />
        {LAYER_GROUPS.map((layer) => {
          const visible = layerVisibility[layer.key] !== false
          return (
            <button
              key={layer.key}
              onClick={() => toggleLayer(layer.key)}
              title={`Toggle ${layer.label}`}
              className="flex w-12 h-[22px] items-center justify-center gap-1 border-none bg-transparent cursor-pointer p-0 hover:bg-[#2a2d2e]"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: visible ? layer.color : '#5a5a5a' }}
              />
              <span
                className="text-[10px] leading-none"
                style={{ color: visible ? '#cccccc' : '#5a5a5a' }}
              >
                {layer.abbrev}
              </span>
            </button>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

function Divider(): React.ReactElement {
  return <div className="w-full h-px bg-[#3c3c3c] my-0.5" />
}

interface ToolButtonProps {
  icon: React.ReactNode
  tooltip: string
  onClick: () => void
  active?: boolean
}

function ToolButton({ icon, tooltip, onClick, active }: ToolButtonProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'flex w-12 h-10 items-center justify-center border-none cursor-pointer p-0 rounded-none border-l-2',
            active
              ? 'border-l-[#007acc] bg-[#37373d] text-white'
              : 'border-l-transparent bg-transparent text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]'
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  )
}
