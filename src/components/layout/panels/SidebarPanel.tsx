import { Suspense, lazy, useCallback, useEffect } from 'react';
import { useSelector } from '@xstate/react';
import { useEditorActor } from '@/context/EditorContext';
import { useSidebar } from '@/context/SidebarContext';
import { useUIStore } from '@/store/uiStore';
import {
  getDefaultSidebarViewId,
  getSidebarViewDef,
  type SidebarRendererId,
} from '@/core/workspaceViews';

const LazyLayerTree = lazy(async () => {
  const m = await import('./LayerTree');
  return { default: m.LayerTree };
});
const LazyMapOutline = lazy(async () => {
  const m = await import('./MapOutline');
  return { default: m.MapOutline };
});
const LazySearchPanel = lazy(async () => {
  const m = await import('./SearchPanel');
  return { default: m.SearchPanel };
});
const LazyTimelinePanel = lazy(async () => {
  const m = await import('./TimelinePanel');
  return { default: m.TimelinePanel };
});

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500">
      {label}
    </div>
  );
}

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
      onOpenSettings();
      setActiveTab(getDefaultSidebarViewId());
    }
  }, [activeView, onOpenSettings, setActiveTab]);

  return (
    <div className="h-full bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <SidebarRenderer
          renderer={activeView?.renderer}
          onSelect={handleSelect}
          selectedId={selectedId}
        />
      </div>
    </div>
  );
}

function SidebarRenderer({
  renderer,
  onSelect,
  selectedId,
}: {
  renderer?: SidebarRendererId;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}) {
  switch (renderer) {
    case 'layers':
      return (
        <Suspense fallback={<PanelFallback label="Loading layers..." />}>
          <LazyLayerTree onSelect={onSelect} selectedId={selectedId} />
        </Suspense>
      );
    case 'outline':
      return (
        <Suspense fallback={<PanelFallback label="Loading outline..." />}>
          <LazyMapOutline />
        </Suspense>
      );
    case 'search':
      return (
        <Suspense fallback={<PanelFallback label="Loading search..." />}>
          <LazySearchPanel onSelect={onSelect} selectedId={selectedId} />
        </Suspense>
      );
    case 'timeline':
      return (
        <Suspense fallback={<PanelFallback label="Loading timeline..." />}>
          <LazyTimelinePanel />
        </Suspense>
      );
    default:
      return null;
  }
}
