import { Suspense, lazy } from 'react';
import { FaMagnifyingGlass } from 'react-icons/fa6';
import {
  registerSidebarView,
  registerWorkspaceView,
  type SidebarViewRenderProps,
} from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 40;

const LazySearchPanel = lazy(async () => {
  const m = await import('../panels/SearchPanel');
  return { default: m.SearchPanel };
});

export function registerWorkspaceContribution(): void {
  registerSidebarView(
    {
      id: 'search',
      label: 'Search',
      icon: FaMagnifyingGlass,
      placement: 'top',
      order: 30,
      kind: 'panel',
      render: ({ onSelect, selectedId }: SidebarViewRenderProps) => (
        <Suspense fallback={<PanelFallback label="Loading search..." />}>
          <LazySearchPanel onSelect={onSelect} selectedId={selectedId} />
        </Suspense>
      ),
    },
    duplicate,
  );

  registerWorkspaceView(
    {
      id: 'search',
      actionId: 'view:search',
      label: 'Search',
      icon: FaMagnifyingGlass,
      menuOrder: 23,
      panelId: 'sidebar',
      sidebarViewId: 'search',
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
