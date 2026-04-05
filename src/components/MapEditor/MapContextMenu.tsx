import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMapStore } from '@/store/mapStore'
import { useUIStore } from '@/store/uiStore'

interface ContextMenuState {
  x: number
  y: number
  elementId: string
  elementType: string
}

interface Props {
  menu: ContextMenuState | null
  onClose: () => void
}

export default function MapContextMenu({ menu, onClose }: Props) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu, onClose])

  if (!menu) return null

  const handleSelect = () => {
    useUIStore.getState().setSelected([menu.elementId])
    onClose()
  }

  const handleDelete = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useMapStore.getState().removeElement(menu.elementId, menu.elementType as any)
    useUIStore.getState().setSelected([])
    onClose()
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(menu.elementId)
    useUIStore.getState().setStatus(t('status.copiedId', { id: menu.elementId }))
    onClose()
  }

  const handleZoomTo = () => {
    useUIStore.getState().setSelected([menu.elementId])
    // The selection will trigger flyTo via the element list click behavior
    onClose()
  }

  const handleEditCurve = () => {
    useUIStore.getState().setToolState({
      kind: 'edit_bezier',
      laneId: menu.elementId,
    })
    onClose()
  }

  const lane = menu.elementType === 'lane' ? useMapStore.getState().lanes[menu.elementId] : null
  const hasBezier = !!lane?.bezierAnchors

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px] text-xs"
      style={{ left: menu.x, top: menu.y }}
    >
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
        {menu.elementType.replace('_', ' ')}
      </div>
      <div className="h-px bg-border my-0.5" />
      <MenuItem onClick={handleSelect}>{t('contextmenu.select')}</MenuItem>
      <MenuItem onClick={handleZoomTo}>{t('contextmenu.zoomTo')}</MenuItem>
      {hasBezier && <MenuItem onClick={handleEditCurve}>{t('contextmenu.editCurve')}</MenuItem>}
      <MenuItem onClick={handleCopyId}>{t('contextmenu.copyId')}</MenuItem>
      <div className="h-px bg-border my-0.5" />
      <MenuItem onClick={handleDelete} destructive>
        {t('contextmenu.delete')}
      </MenuItem>
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs bg-transparent border-none cursor-pointer transition-colors ${
        destructive ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  )
}

export type { ContextMenuState }
