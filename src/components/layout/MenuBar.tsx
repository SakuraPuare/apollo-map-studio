import { useState } from 'react'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
  MenubarCheckboxItem,
} from '@/components/ui/menubar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/uiStore'
import { useMapStore } from '@/store/mapStore'

const LAYER_GROUPS = [
  { key: 'lanes', label: 'Lanes' },
  { key: 'boundaries', label: 'Boundaries' },
  { key: 'junctions', label: 'Junctions' },
  { key: 'signals', label: 'Signals' },
  { key: 'crosswalks', label: 'Crosswalks' },
  { key: 'stopSigns', label: 'Stop Signs' },
  { key: 'clearAreas', label: 'Clear Areas' },
  { key: 'speedBumps', label: 'Speed Bumps' },
  { key: 'parkingSpaces', label: 'Parking Spaces' },
  { key: 'connections', label: 'Connections' },
]

export default function AppMenuBar() {
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const {
    setShowNewProjectDialog,
    setShowExportDialog,
    setShowImportDialog,
    setShowValidationDialog,
    showElementListPanel,
    setShowElementListPanel,
    showPropertiesPanel,
    setShowPropertiesPanel,
    layerVisibility,
    toggleLayer,
    clearSelected,
    setStatus,
  } = useUIStore()

  const { clear, project } = useMapStore()

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

  const handleClearMap = () => {
    clear()
    clearSelected()
    setStatus('Map cleared')
    setShowClearConfirm(false)
  }

  return (
    <>
      <div className="flex h-8 items-center bg-[#222222] border-b border-border px-1 shrink-0 select-none">
        <Menubar className="border-none bg-transparent shadow-none h-8 p-0 space-x-0">
          <MenubarMenu>
            <MenubarTrigger className="text-xs font-medium px-2.5 py-1 h-7 data-[state=open]:bg-accent">
              File
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => setShowNewProjectDialog(true)}>
                New Project
                <MenubarShortcut>Ctrl+N</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => setShowImportDialog(true)}>Import Map...</MenubarItem>
              <MenubarItem onClick={() => setShowExportDialog(true)}>
                Export Map...
                <MenubarShortcut>Ctrl+S</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowClearConfirm(true)}
              >
                Clear Map
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="text-xs font-medium px-2.5 py-1 h-7 data-[state=open]:bg-accent">
              Edit
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={handleUndo}>
                Undo
                <MenubarShortcut>Ctrl+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={handleRedo}>
                Redo
                <MenubarShortcut>Ctrl+Y</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => useUIStore.getState().clearSelected()}>
                Deselect All
                <MenubarShortcut>Esc</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="text-xs font-medium px-2.5 py-1 h-7 data-[state=open]:bg-accent">
              View
            </MenubarTrigger>
            <MenubarContent>
              <MenubarCheckboxItem
                checked={showElementListPanel}
                onCheckedChange={(v) => setShowElementListPanel(!!v)}
              >
                Explorer Panel
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={showPropertiesPanel}
                onCheckedChange={(v) => setShowPropertiesPanel(!!v)}
              >
                Properties Panel
              </MenubarCheckboxItem>
              <MenubarSeparator />
              {LAYER_GROUPS.map((layer) => (
                <MenubarCheckboxItem
                  key={layer.key}
                  checked={layerVisibility[layer.key] !== false}
                  onCheckedChange={() => toggleLayer(layer.key)}
                >
                  {layer.label}
                </MenubarCheckboxItem>
              ))}
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="text-xs font-medium px-2.5 py-1 h-7 data-[state=open]:bg-accent">
              Tools
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => setShowValidationDialog(true)}>
                Validate Map...
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>

        {/* Right side: logo + project name */}
        <div className="flex-1" />
        <div className="flex items-center gap-2 pr-2">
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none" className="opacity-60">
            <path
              d="M11 2L4 7V15L11 20L18 15V7L11 2Z"
              stroke="#007acc"
              strokeWidth="1.5"
              fill="#007acc10"
            />
            <circle cx="11" cy="12" r="1.5" fill="#007acc" />
          </svg>
          <span className="text-xs text-muted-foreground">
            {project ? project.name : 'No project'}
          </span>
        </div>
      </div>

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Clear Map</DialogTitle>
            <DialogDescription>
              This will permanently delete all map elements. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearMap}>
              Clear Map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
