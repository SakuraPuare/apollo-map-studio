import { Suspense, lazy } from 'react';
import { FaFolderTree } from 'react-icons/fa6';
import { registerSidebarView } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 20;

const LazyMapOutline = lazy(async () => {
  const m = await import('../panels/MapOutline');
  return { default: m.MapOutline };
});

export function registerWorkspaceContribution(): void {
  registerSidebarView(
    {
      id: 'outline',
      label: 'Outline',
      icon: FaFolderTree,
      placement: 'top',
      order: 10,
      kind: 'panel',
      action: {
        actionId: 'view:outline',
        menuOrder: 21,
      },
      render: () => (
        <Suspense fallback={<PanelFallback label="Loading outline..." />}>
          <LazyMapOutline />
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
