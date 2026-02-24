import { useEffect } from 'react'
import { useUIStore } from './store/uiStore'
import { useMapStore } from './store/mapStore'
import MapEditor from './components/MapEditor/MapEditor'
import Toolbar from './components/Toolbar/Toolbar'
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel'
import StatusBar from './components/StatusBar/StatusBar'
import NewProjectDialog from './components/NewProjectDialog/NewProjectDialog'
import ExportDialog from './components/ExportDialog/ExportDialog'
import ImportDialog from './components/ImportDialog/ImportDialog'
import ValidationDialog from './components/ValidationDialog/ValidationDialog'

export default function App() {
  const {
    showNewProjectDialog,
    showExportDialog,
    showImportDialog,
    showValidationDialog,
    setDrawMode,
  } = useUIStore()
  const { project } = useMapStore()

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ignore when typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      // Ctrl shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            if (e.shiftKey) {
              const temporal = (
                useMapStore as unknown as { temporal?: { getState: () => { redo: () => void } } }
              ).temporal?.getState()
              temporal?.redo()
            } else {
              const temporal = (
                useMapStore as unknown as { temporal?: { getState: () => { undo: () => void } } }
              ).temporal?.getState()
              temporal?.undo()
            }
            e.preventDefault()
            break
          case 'y':
            {
              const temporal = (
                useMapStore as unknown as { temporal?: { getState: () => { redo: () => void } } }
              ).temporal?.getState()
              temporal?.redo()
              e.preventDefault()
            }
            break
          case 's':
            useUIStore.getState().setShowExportDialog(true)
            e.preventDefault()
            break
        }
        return
      }

      // Single key shortcuts
      switch (e.key.toLowerCase()) {
        case 's':
          setDrawMode('select')
          break
        case 'l':
          setDrawMode('draw_lane')
          break
        case 'c':
          setDrawMode('connect_lanes')
          break
        case 'j':
          setDrawMode('draw_junction')
          break
        case 'w':
          setDrawMode('draw_crosswalk')
          break
        case 't':
          setDrawMode('draw_signal')
          break
        case 'p':
          setDrawMode('draw_stop_sign')
          break
        case 'a':
          setDrawMode('draw_clear_area')
          break
        case 'b':
          setDrawMode('draw_speed_bump')
          break
        case 'k':
          setDrawMode('draw_parking_space')
          break
        case 'escape':
          setDrawMode('select')
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setDrawMode])

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a' }}
    >
      {/* Header */}
      <div
        style={{
          height: 44,
          background: '#1e293b',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 10,
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M11 2L4 7V15L11 20L18 15V7L11 2Z"
            stroke="#3b82f6"
            strokeWidth="1.5"
            fill="#3b82f610"
          />
          <path
            d="M11 7V15M7 9.5L11 7L15 9.5"
            stroke="#3b82f6"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="11" cy="12" r="1.5" fill="#3b82f6" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>Apollo Map Studio</span>
        <span
          style={{
            fontSize: 10,
            color: '#64748b',
            background: '#0f172a',
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          v0.1.2
        </span>
        <span style={{ color: '#334155' }}>|</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {project ? project.name : 'No project open'}
        </span>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left toolbar */}
        <Toolbar />

        {/* Map canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <MapEditor />
        </div>

        {/* Right properties panel */}
        <PropertiesPanel />
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Dialogs */}
      {showNewProjectDialog && <NewProjectDialog />}
      {showExportDialog && <ExportDialog />}
      {showImportDialog && <ImportDialog />}
      {showValidationDialog && <ValidationDialog />}
    </div>
  )
}
