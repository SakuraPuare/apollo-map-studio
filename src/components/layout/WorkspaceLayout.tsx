import { Suspense, useRef, useCallback, useEffect, useState } from 'react';
import { DockviewReact, type DockviewReadyEvent, type DockviewApi } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { ToolStrip } from './ToolStrip';
import { ActivityBar } from './ActivityBar';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { EditorProvider, useEditorActor } from '@/context/EditorContext';
import { SidebarProvider, useSidebar } from '@/context/SidebarContext';
import { useActionDispatcher } from '@/hooks/useActionDispatcher';

import { useActorRef, useSelector } from '@xstate/react';
import { editorMachine, type DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';
import {
  createDefaultLayout,
  clearSavedLayout,
  loadLayout,
  saveLayout,
} from './WorkspaceLayout/dockviewLayout';
import {
  InspectorPanelContent,
  LazyCommandPalette,
  LazyProjPickerDialog,
  LazySettingsPanel,
  MapPanelContent,
  OverlayFallback,
  TimelinePanelContent,
  makeSidebarPanel,
} from './WorkspaceLayout/lazyPanels';

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
      clearSavedLayout(appMode);
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
