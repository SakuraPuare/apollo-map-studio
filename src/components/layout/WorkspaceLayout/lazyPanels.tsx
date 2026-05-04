import { Suspense, lazy } from 'react';
import { useSelector } from '@xstate/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorActor } from '@/context/EditorContext';
import { useMapStore } from '@/store/mapStore';

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

export function PanelFallback({ label }: { label: string }) {
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
    <Suspense fallback={<PanelFallback label="Loading map..." />}>
      <div className="w-full h-full">
        <LazyMapCanvas actorRef={actorRef} />
      </div>
    </Suspense>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function makeSidebarPanel(onOpenSettings: () => void) {
  return function SidebarSlot() {
    return (
      <Suspense fallback={<PanelFallback label="Loading sidebar..." />}>
        <LazySidebarPanel onOpenSettings={onOpenSettings} />
      </Suspense>
    );
  };
}

export function InspectorPanelContent() {
  const actorRef = useEditorActor();
  const selectedId = useSelector(actorRef, (s) => s.context.selectedEntityId);
  const entity = useMapStore((s) => (selectedId ? s.entities.get(selectedId) : undefined));

  return (
    <ScrollArea className="h-full bg-zinc-900/50">
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
    </ScrollArea>
  );
}

export function TimelinePanelContent() {
  return (
    <Suspense fallback={<PanelFallback label="Loading timeline..." />}>
      <LazyTimelinePanel />
    </Suspense>
  );
}
