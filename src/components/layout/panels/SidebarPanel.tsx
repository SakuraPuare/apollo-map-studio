import { useCallback, useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import { useEditorActor } from '@/context/EditorContext';
import { useSidebar } from '@/context/SidebarContext';
import { useUIStore } from '@/store/uiStore';
import { getDefaultSidebarViewId, getSidebarViewDef } from '@/core/workspaceViews';

interface SidebarPanelContentProps {
  /** Hook to open the global Settings modal when the user clicks the settings tab. */
  onOpenSettings(): void;
}

/**
 * The single Dockview panel that hosts the left sidebar's content.
 * Switches between tabs from the ActivityBar via SidebarContext.
 */
export function SidebarPanelContent({ onOpenSettings }: SidebarPanelContentProps) {
  const { activeTab, setActiveTab } = useSidebar();
  const activeView = getSidebarViewDef(activeTab);
  const actorRef = useEditorActor();
  const selectedId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const requestFocusEntity = useUIStore((s) => s.requestFocusEntity);

  const onOpenSettingsRef = useRef(onOpenSettings);
  onOpenSettingsRef.current = onOpenSettings;

  const handleSelect = useCallback(
    (id: string | null) => {
      if (!id) return;
      actorRef.send({ type: 'SELECT_ENTITY', id });
      requestFocusEntity(id);
    },
    [actorRef, requestFocusEntity],
  );

  // Modal activity entries open outside the sidebar, then restore a panel view
  // so the Dockview sidebar title/content never remains on a non-panel entry.
  useEffect(() => {
    if (activeView?.kind === 'modal') {
      onOpenSettingsRef.current();
      setActiveTab(getDefaultSidebarViewId());
    }
  }, [activeView, setActiveTab]);

  return (
    <div className="h-full bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeView?.render?.({ onSelect: handleSelect, selectedId })}
      </div>
    </div>
  );
}
