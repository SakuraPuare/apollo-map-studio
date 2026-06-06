import { Suspense, lazy } from 'react';
import { FaCarTunnel } from 'react-icons/fa6';
import { registerSidebarView } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 25;

const whenScene = ({ appMode }: { appMode: 'drawing' | 'scene' }) => appMode === 'scene';

const LazyScenarioBrowser = lazy(async () => {
  const m = await import('../panels/ScenarioBrowser');
  return { default: m.ScenarioBrowser };
});

export function registerWorkspaceContribution(): void {
  registerSidebarView(
    {
      id: 'scenarios',
      label: 'Scenarios',
      icon: FaCarTunnel,
      placement: 'top',
      order: 5,
      kind: 'panel',
      when: whenScene,
      action: {
        actionId: 'view:scenarios',
        menuOrder: 27,
      },
      render: () => (
        <Suspense fallback={<PanelFallback label="Loading scenarios..." />}>
          <LazyScenarioBrowser />
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
