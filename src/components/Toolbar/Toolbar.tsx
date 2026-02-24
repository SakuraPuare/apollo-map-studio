import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import type { DrawMode } from '../../types/editor'

interface Tool {
  mode: DrawMode
  label: string
  icon: React.ReactNode
  shortcut?: string
}

// SVG icon helpers (16x16, stroke-based, inherits currentColor)
const icon = (d: string, extra?: React.ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
    {extra}
  </svg>
)

const DRAW_TOOLS: Tool[] = [
  {
    mode: 'select',
    label: 'Select',
    shortcut: 'S',
    icon: icon('M3.5 2L7.5 14L9.5 9L14.5 7L3.5 2Z'),
  },
  {
    mode: 'draw_lane',
    label: 'Lane',
    shortcut: 'L',
    icon: (
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
    ),
  },
  {
    mode: 'connect_lanes',
    label: 'Connect',
    shortcut: 'C',
    icon: icon('M2 8H11M8 4.5L12 8L8 11.5'),
  },
  {
    mode: 'draw_junction',
    label: 'Junction',
    shortcut: 'J',
    icon: icon('M8 1.5L14 4.75V11.25L8 14.5L2 11.25V4.75Z'),
  },
  {
    mode: 'draw_crosswalk',
    label: 'Crosswalk',
    shortcut: 'W',
    icon: (
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
    ),
  },
  {
    mode: 'draw_signal',
    label: 'Signal',
    shortcut: 'T',
    icon: (
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
    ),
  },
  {
    mode: 'draw_stop_sign',
    label: 'Stop Sign',
    shortcut: 'P',
    icon: icon('M5.5 1.5L10.5 1.5L14.5 5.5L14.5 10.5L10.5 14.5L5.5 14.5L1.5 10.5L1.5 5.5Z'),
  },
  {
    mode: 'draw_clear_area',
    label: 'Clear Area',
    shortcut: 'A',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <rect x="2" y="2" width="12" height="12" rx="1" />
        <line x1="5" y1="5" x2="11" y2="11" />
        <line x1="11" y1="5" x2="5" y2="11" />
      </svg>
    ),
  },
  {
    mode: 'draw_speed_bump',
    label: 'Speed Bump',
    shortcut: 'B',
    icon: icon('M1 11C3 11 3.5 5 5.5 5S7 11 8 11S9.5 5 10.5 5S12 11 15 11'),
  },
  {
    mode: 'draw_parking_space',
    label: 'Parking',
    shortcut: 'K',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <path
          d="M6 12V4H9.5C11.157 4 12.5 5.343 12.5 7C12.5 8.657 11.157 10 9.5 10H6"
          fill="none"
        />
      </svg>
    ),
  },
]

const LAYER_GROUPS = [
  { key: 'lanes', label: 'Lanes' },
  { key: 'boundaries', label: 'Boundaries' },
  { key: 'junctions', label: 'Junctions' },
  { key: 'signals', label: 'Signals' },
  { key: 'crosswalks', label: 'Crosswalks' },
  { key: 'stopSigns', label: 'Stop Signs' },
  { key: 'clearAreas', label: 'Clear Areas' },
  { key: 'speedBumps', label: 'Speed Bumps' },
  { key: 'parkingSpaces', label: 'Parking' },
]

// SVG icons for edit/file tools
const undoIcon = icon('M3 8H13M3 8L6.5 4.5M3 8L6.5 11.5')
const redoIcon = icon('M13 8H3M13 8L9.5 4.5M13 8L9.5 11.5')
const newIcon = icon('M8 3V13M3 8H13')
const openIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 13V4C2 3.448 2.448 3 3 3H6L8 5H13C13.552 5 14 5.448 14 6V13C14 13.552 13.552 14 13 14H3C2.448 14 2 13.552 2 13Z" />
  </svg>
)
const exportIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 2V10M8 10L5 7M8 10L11 7" />
    <path d="M3 12V13H13V12" />
  </svg>
)
const validateIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 8.5L6.5 12L13 4" />
  </svg>
)

export default function Toolbar() {
  const {
    drawMode,
    setDrawMode,
    setShowNewProjectDialog,
    setShowExportDialog,
    setShowImportDialog,
    setShowValidationDialog,
    layerVisibility,
    toggleLayer,
  } = useUIStore()
  const { project } = useMapStore()

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
    <div
      style={{
        width: 68,
        background: '#1e293b',
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        gap: 3,
        zIndex: 10,
        overflowY: 'auto',
      }}
    >
      {/* Project name */}
      <div
        style={{
          fontSize: 9,
          color: '#64748b',
          textAlign: 'center',
          padding: '0 6px 8px',
          borderBottom: '1px solid #334155',
          width: '100%',
          wordBreak: 'break-all',
        }}
      >
        {project?.name ?? 'No Project'}
      </div>

      {/* Section label */}
      <div
        style={{
          fontSize: 8,
          color: '#475569',
          textAlign: 'center',
          marginTop: 4,
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
        }}
      >
        Tools
      </div>

      {/* Draw tools */}
      {DRAW_TOOLS.map((tool) => (
        <ToolButton
          key={tool.mode}
          active={drawMode === tool.mode}
          onClick={() => setDrawMode(tool.mode)}
          title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
          icon={tool.icon}
          label={tool.label}
        />
      ))}

      <div style={{ flex: 1 }} />

      {/* Divider */}
      <Divider />

      {/* Edit tools */}
      <ToolButton icon={undoIcon} label="Undo" title="Undo (Ctrl+Z)" onClick={handleUndo} />
      <ToolButton icon={redoIcon} label="Redo" title="Redo (Ctrl+Y)" onClick={handleRedo} />

      <Divider />

      {/* File tools */}
      <ToolButton
        icon={newIcon}
        label="New"
        title="New Project"
        onClick={() => setShowNewProjectDialog(true)}
      />
      <ToolButton
        icon={openIcon}
        label="Open"
        title="Import base_map.bin"
        onClick={() => setShowImportDialog(true)}
      />
      <ToolButton
        icon={exportIcon}
        label="Export"
        title="Export .bin files"
        onClick={() => setShowExportDialog(true)}
      />
      <ToolButton
        icon={validateIcon}
        label="Validate"
        title="Validate map"
        onClick={() => setShowValidationDialog(true)}
      />

      {/* Layer toggles */}
      <Divider />
      <div
        style={{
          fontSize: 8,
          color: '#475569',
          textAlign: 'center',
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
        }}
      >
        Layers
      </div>
      {LAYER_GROUPS.map((layer) => {
        const visible = layerVisibility[layer.key] !== false
        return (
          <button
            key={layer.key}
            onClick={() => toggleLayer(layer.key)}
            title={`Toggle ${layer.label}`}
            style={{
              width: 52,
              padding: '3px 0',
              fontSize: 9,
              borderRadius: 4,
              border: 'none',
              background: visible ? '#1d4ed8' : '#374151',
              color: '#f1f5f9',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: visible ? '#93c5fd' : '#6b7280',
                flexShrink: 0,
              }}
            />
            {layer.label}
          </button>
        )
      })}
    </div>
  )
}

function Divider() {
  return <div style={{ width: '80%', height: 1, background: '#334155', margin: '4px 0' }} />
}

interface ToolButtonProps {
  icon: React.ReactNode
  label: string
  title: string
  onClick: () => void
  active?: boolean
}

function ToolButton({ icon, label, title, onClick, active }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 52,
        height: 42,
        borderRadius: 6,
        border: active ? '1px solid #3b82f6' : '1px solid transparent',
        background: active ? '#1d4ed8' : 'transparent',
        color: active ? '#f1f5f9' : '#94a3b8',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        fontSize: 14,
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = '#334155'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 9, lineHeight: 1, color: active ? '#e2e8f0' : '#64748b' }}>
        {label}
      </span>
    </button>
  )
}
