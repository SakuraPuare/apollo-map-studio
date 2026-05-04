import { Suspense, lazy, useCallback, useEffect } from 'react';
import { useSelector } from '@xstate/react';
import { useEditorActor } from '@/context/EditorContext';
import { useSidebar } from '@/context/SidebarContext';

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

const TAB_TITLES: Record<string, string> = {
  explorer: 'Outline',
  layers: 'Layers',
  search: 'Search',
  timeline: 'Timeline',
  settings: 'Settings',
};

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
  const actorRef = useEditorActor();
  const selectedId = useSelector(actorRef, (s) => s.context.selectedEntityId);

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id) actorRef.send({ type: 'SELECT_ENTITY', id });
    },
    [actorRef],
  );

  // Settings is a modal — clicking the tab opens it and snaps back to the
  // default content so the sidebar isn't left blank. Done in an effect so
  // the state update doesn't fire during render.
  useEffect(() => {
    if (activeTab === 'settings') {
      onOpenSettings();
      setActiveTab('explorer');
    }
  }, [activeTab, onOpenSettings, setActiveTab]);

  return (
    <div className="h-full bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-white/[0.07] shrink-0">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          {TAB_TITLES[activeTab] ?? activeTab}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'layers' && (
          <Suspense fallback={<PanelFallback label="Loading layers..." />}>
            <LazyLayerTree onSelect={handleSelect} selectedId={selectedId} />
          </Suspense>
        )}
        {activeTab === 'explorer' && (
          <Suspense fallback={<PanelFallback label="Loading outline..." />}>
            <LazyMapOutline />
          </Suspense>
        )}
        {activeTab === 'search' && (
          <Suspense fallback={<PanelFallback label="Loading search..." />}>
            <LazySearchPanel onSelect={handleSelect} selectedId={selectedId} />
          </Suspense>
        )}
        {activeTab === 'timeline' && (
          <Suspense fallback={<PanelFallback label="Loading timeline..." />}>
            <LazyTimelinePanel />
          </Suspense>
        )}
      </div>
    </div>
  );
}
