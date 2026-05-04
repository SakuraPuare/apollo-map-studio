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
  closeWorkspacePanel,
  isWorkspacePanelId,
  loadLayout,
  openWorkspacePanel,
  saveLayout,
  type WorkspacePanelId,
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
import type { WorkspaceViewActionId } from '@/core/actions/registry';
import {
  getDefaultSidebarViewId,
  getSidebarViewDef,
  getWorkspaceViewByActionId,
  isSidebarViewAvailable,
} from '@/core/workspaceViews';

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
  const [openPanelIds, setOpenPanelIds] = useState<ReadonlySet<WorkspacePanelId>>(new Set());
  const apiRef = useRef<DockviewApi | null>(null);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openAbout = useCallback(() => setAboutOpen(true), []);
  const components = useDockviewComponents(openSettings);
  useCommandPaletteKeys(setCommandPaletteOpen);
  const refreshOpenPanels = useCallback((api: DockviewApi) => {
    setOpenPanelIds(new Set(api.panels.map((panel) => panel.id).filter(isWorkspacePanelId)));
  }, []);

  // Reset layout handler (needs apiRef + current mode)
  const handleResetLayout = useCallback(() => {
    if (apiRef.current) {
      clearSavedLayout(appMode);
      apiRef.current.clear();
      createDefaultLayout(apiRef.current, appMode);
      refreshOpenPanels(apiRef.current);
    }
  }, [appMode, refreshOpenPanels]);

  const handleWorkspaceViewToggle = useWorkspaceViewToggle({
    apiRef,
    activeTab,
    appMode,
    setActiveTab,
    refreshOpenPanels,
  });

  const getWorkspaceViewState = useCallback(
    (actionId: WorkspaceViewActionId) => {
      const view = getWorkspaceViewByActionId(actionId, appMode);
      if (!view) return false;
      if (view.panelId === 'sidebar') {
        return view.sidebarViewId
          ? openPanelIds.has('sidebar') && activeTab === view.sidebarViewId
          : openPanelIds.has('sidebar');
      }
      return openPanelIds.has(view.panelId);
    },
    [activeTab, appMode, openPanelIds],
  );

  // Action dispatcher — single source of all action handling + keyboard shortcuts
  const { execute, getToggleState } = useActionDispatcher({
    actorRef,
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
    onOpenSettings: () => setSettingsOpen(true),
    onOpenAbout: openAbout,
    onResetLayout: handleResetLayout,
    onToggleWorkspaceView: handleWorkspaceViewToggle,
    getWorkspaceViewState,
  });

  // Tool selection (for ToolStrip which needs element param)
  const handleSelectTool = useCallback(
    (tool: string, element?: MapElementType) => {
      actorRef.send({ type: 'SELECT_TOOL', tool: tool as DrawTool, element });
    },
    [actorRef],
  );

  useEffect(() => {
    apiRef.current?.getPanel('sidebar')?.api.setTitle(getSidebarTitle(activeTab));
  }, [activeTab]);

  useEffect(() => {
    if (isSidebarViewAvailable(activeTab, appMode)) return;
    setActiveTab(getDefaultSidebarViewId(appMode));
  }, [activeTab, appMode, setActiveTab]);

  const onReady = useDockviewReady(apiRef, appMode, activeTab, refreshOpenPanels);

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
        onTabChange={handleActivityTabChange}
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

  function handleActivityTabChange(tab: ActivityTab) {
    const sidebarView = getSidebarViewDef(tab);
    if (!isSidebarViewAvailable(tab, appMode)) return;
    if (sidebarView?.kind === 'panel') {
      const api = apiRef.current;
      if (api) {
        openWorkspacePanel(api, 'sidebar', { title: sidebarView.label });
        refreshOpenPanels(api);
      }
    }
    setActiveTab(tab);
  }
}

function getSidebarTitle(tab: ActivityTab): string {
  return getSidebarViewDef(tab)?.label ?? tab;
}

function useWorkspaceViewToggle({
  apiRef,
  activeTab,
  appMode,
  setActiveTab,
  refreshOpenPanels,
}: {
  apiRef: React.RefObject<DockviewApi | null>;
  activeTab: ActivityTab;
  appMode: AppMode;
  setActiveTab: (tab: ActivityTab) => void;
  refreshOpenPanels: (api: DockviewApi) => void;
}) {
  return useCallback(
    (actionId: WorkspaceViewActionId) => {
      const api = apiRef.current;
      if (!api) return;

      const view = getWorkspaceViewByActionId(actionId, appMode);
      if (!view) return;

      if (view.panelId === 'sidebar' && view.sidebarViewId) {
        const tab = view.sidebarViewId;
        const shouldClose = api.getPanel('sidebar') && activeTab === tab;
        if (shouldClose) {
          closeWorkspacePanel(api, 'sidebar');
        } else {
          setActiveTab(tab);
          openWorkspacePanel(api, 'sidebar', { title: getSidebarTitle(tab) });
        }
        refreshOpenPanels(api);
        return;
      }

      if (api.getPanel(view.panelId)) closeWorkspacePanel(api, view.panelId);
      else openWorkspacePanel(api, view.panelId);
      refreshOpenPanels(api);
    },
    [activeTab, apiRef, appMode, refreshOpenPanels, setActiveTab],
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
      <ActivityBar activeTab={activeTab} appMode={appMode} onTabChange={onTabChange} />
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

function useDockviewReady(
  apiRef: React.RefObject<DockviewApi | null>,
  appMode: AppMode,
  activeTab: ActivityTab,
  refreshOpenPanels: (api: DockviewApi) => void,
) {
  return useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      if (!loadLayout(event.api, appMode)) createDefaultLayout(event.api, appMode);
      event.api.getPanel('sidebar')?.api.setTitle(getSidebarTitle(activeTab));
      refreshOpenPanels(event.api);
      event.api.onDidLayoutChange(() => {
        saveLayout(event.api, appMode);
        refreshOpenPanels(event.api);
      });
    },
    [apiRef, appMode, activeTab, refreshOpenPanels],
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
