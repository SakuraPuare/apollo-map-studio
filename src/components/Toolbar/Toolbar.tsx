import { useUIStore } from '../../store/uiStore'
import { useMapStore } from '../../store/mapStore'
import type { DrawMode } from '../../types/editor'

interface Tool {
  mode: DrawMode
  label: string
  icon: string
  shortcut?: string
}

const DRAW_TOOLS: Tool[] = [
  { mode: 'select', label: 'Select', icon: '↖', shortcut: 'S' },
  { mode: 'draw_lane', label: 'Lane', icon: '━', shortcut: 'L' },
  { mode: 'connect_lanes', label: 'Connect', icon: '→', shortcut: 'C' },
  { mode: 'draw_junction', label: 'Junction', icon: '⬡', shortcut: 'J' },
  { mode: 'draw_crosswalk', label: 'Crosswalk', icon: '▦', shortcut: 'W' },
  { mode: 'draw_signal', label: 'Signal', icon: '🚦', shortcut: 'T' },
  { mode: 'draw_stop_sign', label: 'Stop Sign', icon: '🛑', shortcut: 'P' },
  { mode: 'draw_clear_area', label: 'Clear Area', icon: '⬜', shortcut: 'A' },
  { mode: 'draw_speed_bump', label: 'Speed Bump', icon: '〰', shortcut: 'B' },
  { mode: 'draw_parking_space', label: 'Parking', icon: '🅿', shortcut: 'K' },
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

export default function Toolbar() {
  const {
    drawMode,
    setDrawMode,
    setShowNewProjectDialog,
    setShowExportDialog,
    setShowImportDialog,
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
        width: 64,
        background: '#1e293b',
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        gap: 4,
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
          padding: '0 4px 8px',
          borderBottom: '1px solid #334155',
          width: '100%',
          wordBreak: 'break-all',
        }}
      >
        {project?.name ?? 'No Project'}
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
      <div style={{ width: '80%', height: 1, background: '#334155', margin: '4px 0' }} />

      {/* Edit tools */}
      <ToolButton icon="↩" label="Undo" title="Undo (Ctrl+Z)" onClick={handleUndo} />
      <ToolButton icon="↪" label="Redo" title="Redo (Ctrl+Y)" onClick={handleRedo} />

      <div style={{ width: '80%', height: 1, background: '#334155', margin: '4px 0' }} />

      {/* File tools */}
      <ToolButton
        icon="+"
        label="New"
        title="New Project"
        onClick={() => setShowNewProjectDialog(true)}
      />
      <ToolButton
        icon="📂"
        label="Open"
        title="Import base_map.bin"
        onClick={() => setShowImportDialog(true)}
      />
      <ToolButton
        icon="💾"
        label="Export"
        title="Export .bin files"
        onClick={() => setShowExportDialog(true)}
      />

      {/* Layer toggles */}
      <div style={{ width: '80%', height: 1, background: '#334155', margin: '4px 0' }} />
      <div style={{ fontSize: 9, color: '#64748b', textAlign: 'center' }}>Layers</div>
      {LAYER_GROUPS.map((layer) => (
        <button
          key={layer.key}
          onClick={() => toggleLayer(layer.key)}
          title={`Toggle ${layer.label}`}
          style={{
            width: 48,
            padding: '2px 0',
            fontSize: 8,
            borderRadius: 4,
            border: 'none',
            background: layerVisibility[layer.key] !== false ? '#1d4ed8' : '#374151',
            color: '#f1f5f9',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {layer.label}
        </button>
      ))}
    </div>
  )
}

interface ToolButtonProps {
  icon: string
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
        width: 48,
        height: 40,
        borderRadius: 6,
        border: active ? '1px solid #3b82f6' : '1px solid transparent',
        background: active ? '#1d4ed8' : 'transparent',
        color: active ? '#f1f5f9' : '#94a3b8',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
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
      <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 8, lineHeight: 1, color: '#64748b' }}>{label}</span>
    </button>
  )
}
