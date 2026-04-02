import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'
import { useMapStore } from '../store/mapStore'

export function useKeyboardShortcuts() {
  const setDrawMode = useUIStore((s) => s.setDrawMode)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
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
                useMapStore as unknown as {
                  temporal?: { getState: () => { redo: () => void } }
                }
              ).temporal?.getState()
              temporal?.redo()
            } else {
              const temporal = (
                useMapStore as unknown as {
                  temporal?: { getState: () => { undo: () => void } }
                }
              ).temporal?.getState()
              temporal?.undo()
            }
            e.preventDefault()
            break
          case 'y': {
            const temporal = (
              useMapStore as unknown as {
                temporal?: { getState: () => { redo: () => void } }
              }
            ).temporal?.getState()
            temporal?.redo()
            e.preventDefault()
            break
          }
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
}
