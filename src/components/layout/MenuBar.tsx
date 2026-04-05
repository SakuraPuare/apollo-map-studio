import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
  MenubarCheckboxItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
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
import i18n from '@/i18n/index'

const LAYER_KEYS = [
  { key: 'lanes', labelKey: 'layers.lanes' },
  { key: 'boundaries', labelKey: 'layers.boundaries' },
  { key: 'junctions', labelKey: 'layers.junctions' },
  { key: 'signals', labelKey: 'layers.signals' },
  { key: 'crosswalks', labelKey: 'layers.crosswalks' },
  { key: 'stopSigns', labelKey: 'layers.stopSigns' },
  { key: 'clearAreas', labelKey: 'layers.clearAreas' },
  { key: 'speedBumps', labelKey: 'layers.speedBumps' },
  { key: 'parkingSpaces', labelKey: 'layers.parkingSpaces' },
  { key: 'connections', labelKey: 'layers.connections' },
]

export default function AppMenuBar() {
  const { t } = useTranslation()
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
    setStatus(t('status.mapCleared'))
    setShowClearConfirm(false)
  }

  return (
    <>
      <div className="flex h-8 items-center bg-[#222222] border-b border-border px-1 shrink-0 select-none">
        <Menubar className="border-none bg-transparent shadow-none h-8 p-0 space-x-0">
          <MenubarMenu>
            <MenubarTrigger className="text-xs font-medium px-2.5 py-1 h-7 data-[state=open]:bg-accent">
              {t('menu.file')}
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => setShowNewProjectDialog(true)}>
                {t('menu.file.newProject')}
                <MenubarShortcut>Ctrl+N</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => setShowImportDialog(true)}>
                {t('menu.file.importMap')}
              </MenubarItem>
              <MenubarItem onClick={() => setShowExportDialog(true)}>
                {t('menu.file.exportMap')}
                <MenubarShortcut>Ctrl+S</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowClearConfirm(true)}
              >
                {t('menu.file.clearMap')}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="text-xs font-medium px-2.5 py-1 h-7 data-[state=open]:bg-accent">
              {t('menu.edit')}
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={handleUndo}>
                {t('menu.edit.undo')}
                <MenubarShortcut>Ctrl+Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={handleRedo}>
                {t('menu.edit.redo')}
                <MenubarShortcut>Ctrl+Y</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => useUIStore.getState().clearSelected()}>
                {t('menu.edit.deselectAll')}
                <MenubarShortcut>Esc</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="text-xs font-medium px-2.5 py-1 h-7 data-[state=open]:bg-accent">
              {t('menu.view')}
            </MenubarTrigger>
            <MenubarContent>
              <MenubarCheckboxItem
                checked={showElementListPanel}
                onCheckedChange={(v) => setShowElementListPanel(!!v)}
              >
                {t('menu.view.explorerPanel')}
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={showPropertiesPanel}
                onCheckedChange={(v) => setShowPropertiesPanel(!!v)}
              >
                {t('menu.view.propertiesPanel')}
              </MenubarCheckboxItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger className="text-xs">{t('menu.view.language')}</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarCheckboxItem
                    checked={i18n.language === 'en'}
                    onCheckedChange={() => i18n.changeLanguage('en')}
                  >
                    {t('menu.view.language.en')}
                  </MenubarCheckboxItem>
                  <MenubarCheckboxItem
                    checked={i18n.language === 'zh-CN'}
                    onCheckedChange={() => i18n.changeLanguage('zh-CN')}
                  >
                    {t('menu.view.language.zhCN')}
                  </MenubarCheckboxItem>
                </MenubarSubContent>
              </MenubarSub>
              <MenubarSeparator />
              {LAYER_KEYS.map((layer) => (
                <MenubarCheckboxItem
                  key={layer.key}
                  checked={layerVisibility[layer.key] !== false}
                  onCheckedChange={() => toggleLayer(layer.key)}
                >
                  {t(layer.labelKey)}
                </MenubarCheckboxItem>
              ))}
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="text-xs font-medium px-2.5 py-1 h-7 data-[state=open]:bg-accent">
              {t('menu.tools')}
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => setShowValidationDialog(true)}>
                {t('menu.tools.validateMap')}
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
            {project ? project.name : t('common.noProject')}
          </span>
        </div>
      </div>

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{t('menu.clearMap.title')}</DialogTitle>
            <DialogDescription>{t('menu.clearMap.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleClearMap}>
              {t('menu.clearMap.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
