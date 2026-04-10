import { useRef, useCallback, useEffect, useState } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  DockviewApi,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { ToolStrip } from './ToolStrip';
import { ActivityBar, type ActivityTab } from './ActivityBar';
import { LayerTree } from './panels/LayerTree';
import { TimelinePanel } from './panels/TimelinePanel';
import { CommandPalette } from './panels/CommandPalette';
import { SettingsPanel } from './panels/SettingsPanel';
import { EntityForm } from './panels/InspectorForms';
import { MapCanvas } from '@/components/map/MapCanvas';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { EditorProvider, useEditorActor } from '@/context/EditorContext';

import { useActorRef, useSelector } from '@xstate/react';
import { editorMachine, type DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';

// ─── Panel Components for Dockview ─────────────────────────

function MapPanelContent() {
  const actorRef = useEditorActor();
  return (
    <div className="w-full h-full">
      <MapCanvas actorRef={actorRef} />
    </div>
  );
}

function LayersPanelContent() {
  const actorRef = useEditorActor();
  const selectedId = useSelector(actorRef, (s) => s.context.selectedEntityId);

  const handleSelect = useCallback((id: string | null) => {
    if (id) {
      actorRef.send({ type: 'SELECT_ENTITY', id });
    }
  }, [actorRef]);

  return (
    <div className="h-full bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-white/[0.07] shrink-0">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Layers</h2>
      </div>
      <div className="flex-1 overflow-hidden">
        <LayerTree onSelect={handleSelect} selectedId={selectedId} />
      </div>
    </div>
  );
}

function InspectorPanelContent() {
  const actorRef = useEditorActor();
  const selectedId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const entity = useMapStore((s) => selectedId ? s.entities.get(selectedId) : undefined);

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
            <EntityForm entity={entity} />
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
  return <TimelinePanel />;
}

// ─── Component Registry ─────────────────────────────────

const components = {
  map: MapPanelContent,
  layers: LayersPanelContent,
  inspector: InspectorPanelContent,
  timeline: TimelinePanelContent,
};

// ─── Layout Persistence ─────────────────────────────────

const LAYOUT_KEY = 'ams-layout-v2';

function saveLayout(api: DockviewApi) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()));
  } catch { /* ignore */ }
}

function loadLayout(api: DockviewApi): boolean {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) {
      api.fromJSON(JSON.parse(saved));
      return true;
    }
  } catch {
    localStorage.removeItem(LAYOUT_KEY);
  }
  return false;
}

function createDefaultLayout(api: DockviewApi) {
  const mapPanel = api.addPanel({
    id: 'map',
    component: 'map',
    title: 'Map Editor',
  });

  api.addPanel({
    id: 'layers',
    component: 'layers',
    title: 'Layers',
    position: { referencePanel: mapPanel, direction: 'left' },
  });

  api.addPanel({
    id: 'inspector',
    component: 'inspector',
    title: 'Inspector',
    position: { referencePanel: mapPanel, direction: 'right' },
  });

  api.addPanel({
    id: 'timeline',
    component: 'timeline',
    title: 'Timeline',
    position: { referencePanel: mapPanel, direction: 'below' },
  });

  api.getPanel('layers')?.api.setSize({ width: 220 });
  api.getPanel('inspector')?.api.setSize({ width: 280 });
  api.getPanel('timeline')?.api.setSize({ height: 180 });
}

// ─── Inner Layout ─────────────────────────────────────────

function WorkspaceLayoutInner() {
  const actorRef = useEditorActor();
  const currentState = useSelector(actorRef, (s) => s.value as string);
  // Fix: FSM uses 'activeElement' not 'selectedElement'
  const activeElement = useSelector(actorRef, (s) => s.context.activeElement);
  const entityCount = useMapStore((s) => s.entities.size);

  // UI Store
  const gridEnabled = useUIStore((s) => s.gridEnabled);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const toggleGrid = useUIStore((s) => s.toggleGrid);
  const toggleSnap = useUIStore((s) => s.toggleSnap);

  const [activeTab, setActiveTab] = useState<ActivityTab>('layers');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const apiRef = useRef<DockviewApi | null>(null);

  // ── Actions ──────────────────────────────────────────

  const handleUndo = useCallback(() => {
    useMapStore.temporal.getState().undo();
  }, []);

  const handleRedo = useCallback(() => {
    useMapStore.temporal.getState().redo();
  }, []);

  const handleDelete = useCallback(() => {
    actorRef.send({ type: 'DELETE_ENTITY' });
  }, [actorRef]);

  const handleSelectTool = useCallback((tool: DrawTool, element?: MapElementType) => {
    actorRef.send({ type: 'SELECT_TOOL', tool, element });
  }, [actorRef]);

  const handleResetLayout = useCallback(() => {
    if (apiRef.current) {
      localStorage.removeItem(LAYOUT_KEY);
      apiRef.current.clear();
      createDefaultLayout(apiRef.current);
    }
  }, []);

  const handleExport = useCallback(() => {
    // Export entities as JSON for now
    const entities = useMapStore.getState().entities;
    const data = Array.from(entities.values());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apollo-map-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // ⌘Z / ⇧⌘Z
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? handleRedo() : handleUndo();
        return;
      }

      // ⌘K — command palette
      if (ctrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // ⌘G — toggle grid
      if (ctrl && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        toggleGrid();
        return;
      }

      // ⌘, — settings
      if (ctrl && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      // Ignore shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      // Single-key tool shortcuts
      switch (e.key.toLowerCase()) {
        case 'v': handleSelectTool('idle' as DrawTool); break;
        case 'p': handleSelectTool('drawPolyline'); break;
        case 'b': handleSelectTool('drawBezier'); break;
        case 'a': handleSelectTool('drawArc'); break;
        case 'r': handleSelectTool('drawRect'); break;
        case 'g': if (!ctrl) handleSelectTool('drawPolygon'); break;
        case 'delete':
        case 'backspace': handleDelete(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, handleSelectTool, handleDelete, toggleGrid]);

  // ── Dockview ─────────────────────────────────────────

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    const loaded = loadLayout(event.api);
    if (!loaded) {
      createDefaultLayout(event.api);
    }

    event.api.onDidLayoutChange(() => {
      saveLayout(event.api);
    });
  }, []);

  // ── Render ───────────────────────────────────────────

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Menu Bar */}
      <MenuBar
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDelete={handleDelete}
        onToggleGrid={toggleGrid}
        onToggleSnap={toggleSnap}
        onResetLayout={handleResetLayout}
        onOpenSettings={() => setSettingsOpen(true)}
        onExport={handleExport}
        gridEnabled={gridEnabled}
        snapEnabled={snapEnabled}
      />

      {/* Tool Strip */}
      <ToolStrip
        currentTool={currentState}
        currentElement={activeElement as MapElementType | null}
        onSelectTool={handleSelectTool}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Dockview workspace */}
        <div className="flex-1">
          <DockviewReact
            components={components}
            onReady={onReady}
            className="dockview-theme-dark"
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        mode={currentState}
        entityCount={entityCount}
      />

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSelectTool={handleSelectTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDelete={handleDelete}
        onToggleGrid={toggleGrid}
        onToggleSnap={toggleSnap}
        onResetLayout={handleResetLayout}
        onExport={handleExport}
      />

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

// ─── Main Component with Provider ─────────────────────────

export function WorkspaceLayout() {
  const actorRef = useActorRef(editorMachine);

  return (
    <EditorProvider actorRef={actorRef}>
      <WorkspaceLayoutInner />
    </EditorProvider>
  );
}
