/* eslint-disable react-refresh/only-export-components */
import { Suspense, lazy } from 'react';
import { FaLayerGroup } from 'react-icons/fa6';
import { registerSidebarView, type SidebarViewRenderProps } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 30;

const LazyLayerTree = lazy(async () => {
  const m = await import('../panels/LayerTree');
  return { default: m.LayerTree };
});

export function registerWorkspaceContribution(): void {
  registerSidebarView(
    {
      id: 'layers',
      label: 'Layers',
      icon: FaLayerGroup,
      placement: 'top',
      order: 20,
      kind: 'panel',
      action: {
        actionId: 'view:layers',
        menuOrder: 22,
      },
      render: ({ onSelect, selectedId }: SidebarViewRenderProps) => (
        <Suspense fallback={<PanelFallback label="Loading layers..." />}>
          <LazyLayerTree onSelect={onSelect} selectedId={selectedId} />
        </Suspense>
      ),
    },
    duplicate,
  );
}

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500">
      {label}
    </div>
  );
}
