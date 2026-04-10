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
import { EntityForm } from './panels/InspectorForms';
import { MapCanvas } from '@/components/map/MapCanvas';
import { useMapStore } from '@/store/mapStore';
import { EditorProvider, useEditorActor } from '@/context/EditorContext';

import { useActorRef, useSelector } from '@xstate/react';
import { editorMachine, type DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';

// ─── Panel Components for Dockview ─────────────────────────────────

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
      actorRef.send({ type: 'SELECT_ENTITY', entityId: id });
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
            {/* Entity header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
              <span className="font-medium text-sm text-cyan-400">
                {entity.entityType.charAt(0).toUpperCase() + entity.entityType.slice(1)}
              </span>
              <span className="text-[10px] font-mono text-zinc-600" title={entity.id}>
                {entity.id.length > 16 ? `...${entity.id.slice(-12)}` : entity.id}
              </span>
            </div>
            {/* Dynamic form */}
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

function WelcomePanelContent() {
  return (
    <div className="h-full bg-zinc-900/50 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-medium text-zinc-300 mb-2">Apollo Map Studio</h2>
        <p className="text-sm text-zinc-500 mb-4">HD Map Editor for Autonomous Driving</p>
        <p className="text-xs text-zinc-600">Press ⌘K to open command palette</p>
      </div>
    </div>
  );
}

// ─── Component Registry ─────────────────────────────────

const components = {
  map: MapPanelContent,
  layers: LayersPanelContent,
  inspector: InspectorPanelContent,
  timeline: TimelinePanelContent,
  welcome: WelcomePanelContent,
};

// ─── Layout Persistence ─────────────────────────────────

const LAYOUT_KEY = 'ams-layout-v2';

function saveLayout(api: DockviewApi) {
  try {
    const layout = api.toJSON();
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // ignore
  }
}

function loadLayout(api: DockviewApi): boolean {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) {
      api.fromJSON(JSON.parse(saved));
      return true;
    }
  } catch {
    // ignore corrupted layout
    localStorage.removeItem(LAYOUT_KEY);
  }
  return false;
}

function createDefaultLayout(api: DockviewApi) {
  // Main map panel
  const mapPanel = api.addPanel({
    id: 'map',
    component: 'map',
    title: 'Map Editor',
  });

  // Layers panel on the left
  api.addPanel({
    id: 'layers',
    component: 'layers',
    title: 'Layers',
    position: { referencePanel: mapPanel, direction: 'left' },
  });

  // Inspector panel on the right
  api.addPanel({
    id: 'inspector',
    component: 'inspector',
    title: 'Inspector',
    position: { referencePanel: mapPanel, direction: 'right' },
  });

  // Timeline panel at the bottom
  api.addPanel({
    id: 'timeline',
    component: 'timeline',
    title: 'Timeline',
    position: { referencePanel: mapPanel, direction: 'below' },
  });

  // Set initial sizes
  api.getPanel('layers')?.api.setSize({ width: 220 });
  api.getPanel('inspector')?.api.setSize({ width: 280 });
  api.getPanel('timeline')?.api.setSize({ height: 180 });
}

// ─── Inner Layout Component ─────────────────────────────

function WorkspaceLayoutInner() {
  const actorRef = useEditorActor();
  const currentState = useSelector(actorRef, (s) => s.value as string);
  const selectedElement = useSelector(actorRef, (s) => s.context.selectedElement);
  const entityCount = useMapStore((s) => s.entities.size);

  const [activeTab, setActiveTab] = useState<ActivityTab>('layers');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(18);
  const apiRef = useRef<DockviewApi | null>(null);

  // Undo/Redo
  const handleUndo = useCallback(() => {
    useMapStore.temporal.getState().undo();
  }, []);

  const handleRedo = useCallback(() => {
    useMapStore.temporal.getState().redo();
  }, []);

  // Delete selected
  const handleDelete = useCallback(() => {
    actorRef.send({ type: 'DELETE' });
  }, [actorRef]);

  // Tool selection
  const handleSelectTool = useCallback((tool: DrawTool, element?: MapElementType) => {
    actorRef.send({ type: 'SELECT_TOOL', tool, element });
  }, [actorRef]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 1, 22));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 1, 1));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? handleRedo() : handleUndo();
        return;
      }

      // Command palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Tool shortcuts (when not in input)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'v':
          handleSelectTool('idle' as DrawTool);
          break;
        case 'p':
          handleSelectTool('drawPolyline');
          break;
        case 'b':
          handleSelectTool('drawBezier');
          break;
        case 'a':
          handleSelectTool('drawArc');
          break;
        case 'r':
          handleSelectTool('drawRect');
          break;
        case 'g':
          handleSelectTool('drawPolygon');
          break;
        case 'delete':
        case 'backspace':
          handleDelete();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, handleSelectTool, handleDelete]);

  // Dockview ready handler
  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    // Try to restore layout, or create default
    const loaded = loadLayout(event.api);
    if (!loaded) {
      createDefaultLayout(event.api);
    }

    // Save layout on changes
    event.api.onDidLayoutChange(() => {
      saveLayout(event.api);
    });
  }, []);

  // Reset layout
  const handleResetLayout = useCallback(() => {
    if (apiRef.current) {
      localStorage.removeItem(LAYOUT_KEY);
      apiRef.current.clear();
      createDefaultLayout(apiRef.current);
    }
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Menu Bar */}
      <MenuBar onUndo={handleUndo} onRedo={handleRedo} />

      {/* Tool Strip */}
      <ToolStrip
        currentTool={currentState}
        currentElement={selectedElement as MapElementType | null}
        onSelectTool={handleSelectTool}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
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
        zoom={zoom}
        cursorPosition={cursorPosition}
      />

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSelectTool={handleSelectTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDelete={handleDelete}
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
