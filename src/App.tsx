import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useUIStore } from './store/uiStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Toaster } from '@/components/ui/sonner'
import AppMenuBar from './components/layout/MenuBar'
import ToolbarStrip from './components/layout/ToolbarStrip'
import MapEditor from './components/MapEditor/MapEditor'
import PropertiesPanel from './components/PropertiesPanel/PropertiesPanel'
import ElementListPanel from './components/ElementListPanel/ElementListPanel'
import StatusBar from './components/StatusBar/StatusBar'
import NewProjectDialog from './components/NewProjectDialog/NewProjectDialog'

const ExportDialog = lazy(() => import('./components/ExportDialog/ExportDialog'))
const ImportDialog = lazy(() => import('./components/ImportDialog/ImportDialog'))
const ValidationDialog = lazy(() => import('./components/ValidationDialog/ValidationDialog'))

function getMapFile(dt: DataTransfer): File | null {
  for (const file of dt.files) {
    if (file.name.endsWith('.bin') || file.name.endsWith('.txt')) return file
  }
  return null
}

/** Global drag-and-drop: drop a .bin/.txt file anywhere to trigger import */
function useGlobalFileDrop() {
  const [dragOver, setDragOver] = useState(false)
  const dragCounter = useRef(0)

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current++
      if (dragCounter.current === 1) {
        // Check that there's at least one file item
        if (e.dataTransfer && Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) {
          setDragOver(true)
        }
      }
    }

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current--
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        setDragOver(false)
      }
    }

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setDragOver(false)

      if (!e.dataTransfer) return
      const { showImportDialog, setPendingImportFile, setShowImportDialog } = useUIStore.getState()
      if (showImportDialog) return

      const file = getMapFile(e.dataTransfer)
      if (file) {
        setPendingImportFile(file)
        setShowImportDialog(true)
      }
    }

    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

  return dragOver
}

export default function App() {
  const {
    showNewProjectDialog,
    showExportDialog,
    showImportDialog,
    showValidationDialog,
    showElementListPanel,
    showPropertiesPanel,
  } = useUIStore()

  useKeyboardShortcuts()
  const dragOver = useGlobalFileDrop()

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden relative">
      {/* Menu Bar */}
      <AppMenuBar />

      {/* Toolbar Strip */}
      <ToolbarStrip />

      {/* Main workspace */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* Explorer Panel */}
        {showElementListPanel && (
          <>
            <ResizablePanel id="explorer" defaultSize="220px" minSize="150px" maxSize="400px">
              <ElementListPanel />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        {/* Map Canvas */}
        <ResizablePanel id="map">
          <div className="h-full w-full relative overflow-hidden">
            <MapEditor />
          </div>
        </ResizablePanel>

        {/* Properties Panel */}
        {showPropertiesPanel && (
          <>
            <ResizableHandle />
            <ResizablePanel id="properties" defaultSize="300px" minSize="200px" maxSize="500px">
              <PropertiesPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Status Bar */}
      <StatusBar />

      {/* Dialogs */}
      {showNewProjectDialog && <NewProjectDialog />}
      <Suspense>
        {showExportDialog && <ExportDialog />}
        {showImportDialog && <ImportDialog />}
        {showValidationDialog && <ValidationDialog />}
      </Suspense>

      {/* Toast notifications */}
      <Toaster position="bottom-right" richColors />

      {/* Global drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-primary rounded-xl p-12 text-center">
            <div className="text-lg font-medium text-primary">Drop map file to import</div>
            <div className="text-sm text-muted-foreground mt-1">.bin or .txt</div>
          </div>
        </div>
      )}
    </div>
  )
}
