import { Suspense, lazy, useRef, useCallback, useEffect, useState } from 'react';
import { DockviewReact, DockviewReadyEvent, DockviewApi } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { ToolStrip } from './ToolStrip';
import { ActivityBar } from './ActivityBar';
import { useMapStore } from '@/store/mapStore';
import { useUIStore, type AppMode } from '@/store/uiStore';
import { EditorProvider, useEditorActor } from '@/context/EditorContext';
import { SidebarProvider, useSidebar } from '@/context/SidebarContext';
import { useActionDispatcher } from '@/hooks/useActionDispatcher';

import { useActorRef, useSelector } from '@xstate/react';
import { editorMachine, type DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';

const LazyMapCanvas = lazy(async () => {
  const module = await import('@/components/map/MapCanvas');
  return { default: module.MapCanvas };
});

const LazySidebarPanel = lazy(async () => {
  const module = await import('./panels/SidebarPanel');
  return { default: module.SidebarPanelContent };
});

const LazyTimelinePanel = lazy(async () => {
  const module = await import('./panels/TimelinePanel');
  return { default: module.TimelinePanel };
});

const LazyCommandPalette = lazy(async () => {
  const module = await import('./panels/CommandPalette');
  return { default: module.CommandPalette };
});

const LazySettingsPanel = lazy(async () => {
  const module = await import('./panels/SettingsPanel');
  return { default: module.SettingsPanel };
});

const LazyProjPickerDialog = lazy(async () => {
  const module = await import('@/components/dialogs/ProjPickerDialog');
  return { default: module.ProjPickerDialog };
});

const LazyEntityForm = lazy(async () => {
  const module = await import('./panels/InspectorForms');
  return { default: module.EntityForm };
});

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500">
      {label}
    </div>
  );
}

function OverlayFallback({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 text-xs text-zinc-300">
      {label}
    </div>
  );
}

// ─── Panel Components for Dockview ─────────────────────────

function MapPanelContent() {
  const actorRef = useEditorActor();
  return (
    <Suspense fallback={<PanelFallback label="Loading map..." />}>
      <div className="w-full h-full">
        <LazyMapCanvas actorRef={actorRef} />
      </div>
    </Suspense>
  );
}

/**
 * The left side panel is a single Dockview slot whose content swaps based
 * on the ActivityBar tab (read from SidebarContext). The actual switch
 * logic lives in `SidebarPanelContent`; the parent wires it up by passing
 * a ref to the Settings modal opener.
 */
function makeSidebarPanel(onOpenSettings: () => void) {
  return function SidebarSlot() {
    return (
      <Suspense fallback={<PanelFallback label="Loading sidebar..." />}>
        <LazySidebarPanel onOpenSettings={onOpenSettings} />
      </Suspense>
    );
  };
}

function InspectorPanelContent() {
  const actorRef = useEditorActor();
  const selectedId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const entity = useMapStore((s) => (selectedId ? s.entities.get(selectedId) : undefined));

  return (
    <div className="h-full bg-zinc-900/50 overflow-y-auto">
      <div className="px-3 py-2 border-b border-white/[0.07]">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Inspector</h2>
      </div>
      <div className="p-3">
        {entity ? (
          <>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
              <span className="font-medium text-sm text-cyan-400">
                {entity.entityType.charAt(0).toUpperCase() + entity.entityType.slice(1)}
              </span>
              <span className="text-[10px] font-mono text-zinc-600" title={entity.id}>
                {entity.id.length > 16 ? `...${entity.id.slice(-12)}` : entity.id}
              </span>
            </div>
            <Suspense fallback={<PanelFallback label="Loading inspector..." />}>
              <LazyEntityForm entity={entity} />
            </Suspense>
          </>
        ) : (
          <div className="py-8 text-center text-zinc-600 text-xs">
            Select an entity to view properties
          </div>
        )}
      </div>
    </div>
  );
}

function TimelinePanelContent() {
  return (
    <Suspense fallback={<PanelFallback label="Loading timeline..." />}>
      <LazyTimelinePanel />
    </Suspense>
  );
}

// ─── Layout Persistence ─────────────────────────────────

// Per-mode layout keys so drawing and scene layouts don't clobber each other.
// Bumped to v3 because the left-panel id moved from `layers` → `sidebar`.
const LAYOUT_KEY_BY_MODE: Record<AppMode, string> = {
  drawing: 'ams-layout-v3-drawing',
  scene: 'ams-layout-v3-scene',
};

function saveLayout(api: DockviewApi, mode: AppMode) {
  try {
    localStorage.setItem(LAYOUT_KEY_BY_MODE[mode], JSON.stringify(api.toJSON()));
  } catch {
    /* ignore */
  }
}

function loadLayout(api: DockviewApi, mode: AppMode): boolean {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY_BY_MODE[mode]);
    if (saved) {
      api.fromJSON(JSON.parse(saved));
      return true;
    }
  } catch {
    localStorage.removeItem(LAYOUT_KEY_BY_MODE[mode]);
  }
  return false;
}

function createDefaultLayout(api: DockviewApi, mode: AppMode) {
  const mapPanel = api.addPanel({ id: 'map', component: 'map', title: 'Map Editor' });
  api.addPanel({
    id: 'sidebar',
    component: 'sidebar',
    title: 'Sidebar',
    position: { referencePanel: mapPanel, direction: 'left' },
  });
  api.addPanel({
    id: 'inspector',
    component: 'inspector',
    title: 'Inspector',
    position: { referencePanel: mapPanel, direction: 'right' },
  });
  api.getPanel('sidebar')?.api.setSize({ width: 240 });
  api.getPanel('inspector')?.api.setSize({ width: 280 });

  // Timeline only shows in scene mode — drawing mode keeps the map full-height.
  if (mode === 'scene') {
    api.addPanel({
      id: 'timeline',
      component: 'timeline',
      title: 'Timeline',
      position: { referencePanel: mapPanel, direction: 'below' },
    });
    api.getPanel('timeline')?.api.setSize({ height: 180 });
  }
}

// ─── Inner Layout ─────────────────────────────────────────

function WorkspaceLayoutInner() {
  const actorRef = useEditorActor();
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const activeElement = useSelector(actorRef, (s) => s.context.activeElement);
  const entityCount = useMapStore((s) => s.entities.size);
  const appMode = useUIStore((s) => s.appMode);

  const { activeTab, setActiveTab } = useSidebar();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const apiRef = useRef<DockviewApi | null>(null);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  // Dockview component map needs to be stable; rebuild only when openSettings changes.
  const components = useRef({
    map: MapPanelContent,
    sidebar: makeSidebarPanel(openSettings),
    inspector: InspectorPanelContent,
    timeline: TimelinePanelContent,
  }).current;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }

      if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset layout handler (needs apiRef + current mode)
  const handleResetLayout = useCallback(() => {
    if (apiRef.current) {
      localStorage.removeItem(LAYOUT_KEY_BY_MODE[appMode]);
      apiRef.current.clear();
      createDefaultLayout(apiRef.current, appMode);
    }
  }, [appMode]);

  // Action dispatcher — single source of all action handling + keyboard shortcuts
  const { execute, getToggleState } = useActionDispatcher({
    actorRef,
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
    onOpenSettings: () => setSettingsOpen(true),
    onResetLayout: handleResetLayout,
  });

  // Tool selection (for ToolStrip which needs element param)
  const handleSelectTool = useCallback(
    (tool: string, element?: MapElementType) => {
      actorRef.send({ type: 'SELECT_TOOL', tool: tool as DrawTool, element });
    },
    [actorRef],
  );

  // Dockview ready — closure captures the current appMode, and since we key the
  // Dockview on appMode a new instance re-runs this with the fresh mode.
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      if (!loadLayout(event.api, appMode)) {
        createDefaultLayout(event.api, appMode);
      }
      event.api.onDidLayoutChange(() => saveLayout(event.api, appMode));
    },
    [appMode],
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Menu Bar — reads from Action Registry */}
      <MenuBar onExecute={execute} getToggleState={getToggleState} />

      {/* Tool Strip */}
      <ToolStrip
        currentTool={currentState}
        currentElement={activeElement as MapElementType | null}
        onSelectTool={handleSelectTool}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onExecuteAction={execute}
        getToggleState={getToggleState}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex-1">
          <DockviewReact
            key={appMode}
            components={components}
            onReady={onReady}
            className="dockview-theme-dark"
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar mode={currentState} entityCount={entityCount} />

      {/* Command Palette — reads from Action Registry */}
      {commandPaletteOpen && (
        <Suspense fallback={<OverlayFallback label="Loading command palette..." />}>
          <LazyCommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
            onExecute={execute}
            getToggleState={getToggleState}
          />
        </Suspense>
      )}

      {/* Settings */}
      {settingsOpen && (
        <Suspense fallback={<OverlayFallback label="Loading settings..." />}>
          <LazySettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}

      {/* PROJ picker — opens automatically when an Apollo map is imported
          without a Header.projection.proj field. */}
      <Suspense fallback={null}>
        <LazyProjPickerDialog />
      </Suspense>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export function WorkspaceLayout() {
  const actorRef = useActorRef(editorMachine);
  return (
    <EditorProvider actorRef={actorRef}>
      <SidebarProvider>
        <WorkspaceLayoutInner />
      </SidebarProvider>
    </EditorProvider>
  );
}
