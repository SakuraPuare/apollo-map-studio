import { Suspense, useRef, useCallback, useEffect, useState } from 'react';
import { DockviewReact, type DockviewReadyEvent, type DockviewApi } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { ToolStrip } from './ToolStrip';
import { ActivityBar, type ActivityTab } from './ActivityBar';
import { TaskProgressOverlay } from './TaskProgressOverlay';
import { AboutDialog } from '@/components/dialogs/AboutDialog';
import { LicenseBanner } from '@/components/license/LicenseBanner';
import { ActivationDialog } from '@/components/license/ActivationDialog';
import { useLicenseSync } from '@/hooks/useLicense';
import { useMapStore } from '@/store/mapStore';
import { useUIStore, type AppMode } from '@/store/uiStore';
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
  useLicenseSync();
  const actorRef = useEditorActor();
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const activeElement = useSelector(actorRef, (s) => s.context.activeElement);
  const entityCount = useMapStore((s) => s.entities.size);
  const appMode = useUIStore((s) => s.appMode);

  const { activeTab, setActiveTab } = useSidebar();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const apiRef = useRef<DockviewApi | null>(null);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openAbout = useCallback(() => setAboutOpen(true), []);
  const components = useDockviewComponents(openSettings);
  useCommandPaletteKeys(setCommandPaletteOpen);

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
    onOpenAbout: openAbout,
    onResetLayout: handleResetLayout,
  });

  // Tool selection (for ToolStrip which needs element param)
  const handleSelectTool = useCallback(
    (tool: string, element?: MapElementType) => {
      actorRef.send({ type: 'SELECT_TOOL', tool: tool as DrawTool, element });
    },
    [actorRef],
  );

  const onReady = useDockviewReady(apiRef, appMode);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100">
      <WorkspaceToolbar
        execute={execute}
        getToggleState={getToggleState}
        currentTool={currentState}
        currentElement={activeElement as MapElementType | null}
        onSelectTool={handleSelectTool}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />
      <WorkspaceMainContent
        appMode={appMode}
        activeTab={activeTab}
        components={components}
        onReady={onReady}
        onTabChange={setActiveTab}
      />
      <StatusBar mode={currentState} entityCount={entityCount} />
      <WorkspaceOverlays
        commandPaletteOpen={commandPaletteOpen}
        settingsOpen={settingsOpen}
        aboutOpen={aboutOpen}
        execute={execute}
        getToggleState={getToggleState}
        onCommandPaletteOpenChange={setCommandPaletteOpen}
        onSettingsClose={() => setSettingsOpen(false)}
        onAboutClose={() => setAboutOpen(false)}
      />
    </div>
  );
}

interface WorkspaceToolbarProps {
  execute: ReturnType<typeof useActionDispatcher>['execute'];
  getToggleState: ReturnType<typeof useActionDispatcher>['getToggleState'];
  currentTool: string;
  currentElement: MapElementType | null;
  onSelectTool: (tool: string, element?: MapElementType) => void;
  onOpenCommandPalette: () => void;
}

function WorkspaceToolbar({
  execute,
  getToggleState,
  currentTool,
  currentElement,
  onSelectTool,
  onOpenCommandPalette,
}: WorkspaceToolbarProps) {
  return (
    <>
      <MenuBar onExecute={execute} getToggleState={getToggleState} />
      <LicenseBanner />
      <ToolStrip
        currentTool={currentTool}
        currentElement={currentElement}
        onSelectTool={onSelectTool}
        onOpenCommandPalette={onOpenCommandPalette}
        onExecuteAction={execute}
        getToggleState={getToggleState}
      />
    </>
  );
}

interface WorkspaceMainContentProps {
  appMode: AppMode;
  activeTab: ActivityTab;
  components: ReturnType<typeof useDockviewComponents>;
  onReady: (event: DockviewReadyEvent) => void;
  onTabChange: (tab: ActivityTab) => void;
}

function WorkspaceMainContent({
  appMode,
  activeTab,
  components,
  onReady,
  onTabChange,
}: WorkspaceMainContentProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      <ActivityBar activeTab={activeTab} onTabChange={onTabChange} />
      <div className="flex-1">
        <DockviewReact
          key={appMode}
          components={components}
          onReady={onReady}
          className="dockview-theme-dark"
        />
      </div>
    </div>
  );
}

function useDockviewComponents(openSettings: () => void) {
  return useRef({
    map: MapPanelContent,
    sidebar: makeSidebarPanel(openSettings),
    inspector: InspectorPanelContent,
    timeline: TimelinePanelContent,
  }).current;
}

function useCommandPaletteKeys(
  setCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>,
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape') setCommandPaletteOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setCommandPaletteOpen]);
}

function useDockviewReady(apiRef: React.RefObject<DockviewApi | null>, appMode: AppMode) {
  return useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      if (!loadLayout(event.api, appMode)) createDefaultLayout(event.api, appMode);
      event.api.onDidLayoutChange(() => saveLayout(event.api, appMode));
    },
    [apiRef, appMode],
  );
}

interface WorkspaceOverlaysProps {
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  aboutOpen: boolean;
  execute: ReturnType<typeof useActionDispatcher>['execute'];
  getToggleState: ReturnType<typeof useActionDispatcher>['getToggleState'];
  onCommandPaletteOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  onSettingsClose: () => void;
  onAboutClose: () => void;
}

function WorkspaceOverlays({
  commandPaletteOpen,
  settingsOpen,
  aboutOpen,
  execute,
  getToggleState,
  onCommandPaletteOpenChange,
  onSettingsClose,
  onAboutClose,
}: WorkspaceOverlaysProps) {
  return (
    <>
      {commandPaletteOpen && (
        <Suspense fallback={<OverlayFallback label="Loading command palette..." />}>
          <LazyCommandPalette
            open={commandPaletteOpen}
            onOpenChange={onCommandPaletteOpenChange}
            onExecute={execute}
            getToggleState={getToggleState}
          />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={<OverlayFallback label="Loading settings..." />}>
          <LazySettingsPanel open={settingsOpen} onClose={onSettingsClose} />
        </Suspense>
      )}
      <AboutDialog open={aboutOpen} onClose={onAboutClose} />
      <Suspense fallback={null}>
        <LazyProjPickerDialog />
      </Suspense>
      <TaskProgressOverlay />
      <ActivationDialog />
    </>
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
