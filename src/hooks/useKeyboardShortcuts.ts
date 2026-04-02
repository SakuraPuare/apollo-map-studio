import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'
import { useMapStore } from '../store/mapStore'
import { ShapeType, ElementType } from '../types/shapes'

/** After undo/redo, prune selectedIds that no longer exist in mapStore. */
function pruneStaleSelection() {
  const { selectedIds, setSelected } = useUIStore.getState()
  if (selectedIds.length === 0) return
  const s = useMapStore.getState()
  const valid = selectedIds.filter(
    (id) =>
      s.lanes[id] ||
      s.roads[id] ||
      s.junctions[id] ||
      s.signals[id] ||
      s.stopSigns[id] ||
      s.crosswalks[id] ||
      s.clearAreas[id] ||
      s.speedBumps[id] ||
      s.parkingSpaces[id]
  )
  if (valid.length !== selectedIds.length) {
    setSelected(valid)
  }
}

export function useKeyboardShortcuts() {
  const startDrawing = useUIStore((s) => s.startDrawing)
  const setToolState = useUIStore((s) => s.setToolState)
  const selectShape = useUIStore((s) => s.selectShape)

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
              pruneStaleSelection()
            } else {
              const temporal = (
                useMapStore as unknown as {
                  temporal?: { getState: () => { undo: () => void } }
                }
              ).temporal?.getState()
              temporal?.undo()
              pruneStaleSelection()
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
            pruneStaleSelection()
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
        // Select & Connect
        case 's':
          setToolState({ kind: 'select' })
          break
        case 'c':
          setToolState({ kind: 'connect_lanes' })
          break

        // Direct element type shortcuts (set both shape + element)
        case 'l':
          startDrawing({ shape: ShapeType.Polyline, elementType: ElementType.Lane })
          break
        case 't':
          startDrawing({ shape: ShapeType.Polyline, elementType: ElementType.Signal })
          break
        case 'p':
          startDrawing({ shape: ShapeType.Polyline, elementType: ElementType.StopSign })
          break
        case 'b':
          startDrawing({ shape: ShapeType.Polyline, elementType: ElementType.SpeedBump })
          break
        case 'w':
          startDrawing({ shape: ShapeType.RotatableRect, elementType: ElementType.Crosswalk })
          break
        case 'k':
          startDrawing({ shape: ShapeType.RotatableRect, elementType: ElementType.ParkingSpace })
          break
        case 'j':
          startDrawing({ shape: ShapeType.Polygon, elementType: ElementType.Junction })
          break
        case 'a':
          startDrawing({ shape: ShapeType.Polygon, elementType: ElementType.ClearArea })
          break

        // Number keys: switch shape (restore last element type)
        case '1':
          selectShape(ShapeType.Polyline)
          break
        case '2':
          selectShape(ShapeType.RotatableRect)
          break
        case '3':
          selectShape(ShapeType.Polygon)
          break
        case '4':
          selectShape(ShapeType.Curve)
          break

        case 'escape':
          setToolState({ kind: 'select' })
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [startDrawing, setToolState, selectShape])
}
