import { lazy, Suspense } from 'react'
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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
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
    </div>
  )
}
