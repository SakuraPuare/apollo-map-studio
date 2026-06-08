import { Suspense, lazy } from 'react';
import { useSelector } from '@xstate/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorActor } from '@/context/EditorContext';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { useScenarioStore } from '@/store/scenarioStore';

const LazyMapCanvas = lazy(async () => {
  const module = await import('@/components/map/MapCanvas');
  return { default: module.MapCanvas };
});

const LazySidebarPanel = lazy(async () => {
  const module = await import('../panels/SidebarPanel');
  return { default: module.SidebarPanelContent };
});

const LazyTimelinePanel = lazy(async () => {
  const module = await import('../panels/TimelinePanel');
  return { default: module.TimelinePanel };
});

const LazyToolboxPanel = lazy(async () => {
  const module = await import('../panels/ToolboxPanel');
  return { default: module.ToolboxPanel };
});

export const LazyCommandPalette = lazy(async () => {
  const module = await import('../panels/CommandPalette');
  return { default: module.CommandPalette };
});

export const LazySettingsPanel = lazy(async () => {
  const module = await import('../panels/SettingsPanel');
  return { default: module.SettingsPanel };
});

export const LazyProjPickerDialog = lazy(async () => {
  const module = await import('@/components/dialogs/ProjPickerDialog');
  return { default: module.ProjPickerDialog };
});

const LazyEntityForm = lazy(async () => {
  const module = await import('../panels/InspectorForms');
  return { default: module.EntityForm };
});

const LazyScenarioObstacleForm = lazy(async () => {
  const module = await import('../panels/InspectorForms/ScenarioObstacleForm');
  return { default: module.ScenarioObstacleForm };
});

const LazyScenarioEgoForm = lazy(async () => {
  const module = await import('../panels/InspectorForms/ScenarioEgoForm');
  return { default: module.ScenarioEgoForm };
});

const LazyScenarioTrafficLightForm = lazy(async () => {
  const module = await import('../panels/InspectorForms/ScenarioTrafficLightForm');
  return { default: module.ScenarioTrafficLightForm };
});

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500">
      {label}
    </div>
  );
}

export function OverlayFallback({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 text-xs text-zinc-300">
      {label}
    </div>
  );
}

export function MapPanelContent() {
  const actorRef = useEditorActor();
  return (
    <div className="w-full h-full" data-testid="workspace-panel-map">
      <Suspense fallback={<PanelFallback label="Loading map..." />}>
        <LazyMapCanvas actorRef={actorRef} />
      </Suspense>
    </div>
  );
}

export function makeSidebarPanel(onOpenSettings: () => void) {
  return function SidebarSlot() {
    return (
      <div className="h-full w-full" data-testid="workspace-panel-sidebar">
        <Suspense fallback={<PanelFallback label="Loading sidebar..." />}>
          <LazySidebarPanel onOpenSettings={onOpenSettings} />
        </Suspense>
      </div>
    );
  };
}

export function InspectorPanelContent() {
  const appMode = useUIStore((s) => s.appMode);
  return (
    <div className="h-full w-full" data-testid="workspace-panel-inspector">
      {appMode === 'scene' ? <ScenarioInspectorContent /> : <MapEntityInspectorContent />}
    </div>
  );
}

function ScenarioInspectorContent() {
  const selectedKind = useScenarioStore((s) => s.selectedKind);
  const selectedObstacleUid = useScenarioStore((s) => s.selectedObstacleUid);
  const selectedTrafficLightUid = useScenarioStore((s) => s.selectedTrafficLightUid);
  const activeKey = useScenarioStore((s) => s.activeKey);
  const loaded = useScenarioStore((s) => s.loaded);
  const doc = loaded.find((l) => l.key === activeKey)?.doc;

  let body: React.ReactNode = null;
  if (doc && selectedKind === 'obstacle') {
    const obstacle = doc.obstacles.find((o) => o.uid === selectedObstacleUid);
    if (obstacle) body = <LazyScenarioObstacleForm obstacle={obstacle} />;
  } else if (doc && selectedKind === 'trafficLight') {
    const light = doc.trafficLights.find((t) => t.uid === selectedTrafficLightUid);
    if (light) body = <LazyScenarioTrafficLightForm light={light} />;
  } else if (doc && selectedKind === 'ego') {
    body = <LazyScenarioEgoForm ego={doc.ego} />;
  }

  if (!body) {
    return (
      <ScrollArea className="h-full bg-zinc-900/50">
        <div className="py-8 text-center text-zinc-600 text-xs">
          选择障碍物 / 红绿灯 / 主车以查看属性
        </div>
      </ScrollArea>
    );
  }
  return (
    <ScrollArea className="h-full bg-zinc-900/50">
      <Suspense fallback={<PanelFallback label="Loading inspector..." />}>{body}</Suspense>
    </ScrollArea>
  );
}

function MapEntityInspectorContent() {
  const actorRef = useEditorActor();
  const selectedId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const entity = useMapStore((s) => (selectedId ? s.entities.get(selectedId) : undefined));

  return (
    <ScrollArea className="h-full bg-zinc-900/50">
      <div className="p-3" data-testid="inspector-panel">
        {entity ? (
          <>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
              <span className="font-medium text-sm text-cyan-400" data-testid="inspector-title">
                {entity.entityType.charAt(0).toUpperCase() + entity.entityType.slice(1)}
              </span>
              <span
                className="text-[10px] font-mono text-zinc-600"
                title={entity.id}
                data-testid="inspector-entity-id"
              >
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
    </ScrollArea>
  );
}

export function TimelinePanelContent() {
  return (
    <div className="h-full w-full" data-testid="workspace-panel-timeline">
      <Suspense fallback={<PanelFallback label="Loading timeline..." />}>
        <LazyTimelinePanel />
      </Suspense>
    </div>
  );
}

export function ToolboxPanelContent() {
  return (
    <div className="h-full w-full" data-testid="workspace-panel-toolbox">
      <Suspense fallback={<PanelFallback label="Loading toolbox..." />}>
        <LazyToolboxPanel />
      </Suspense>
    </div>
  );
}
