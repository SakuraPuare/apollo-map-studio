import { Suspense, lazy } from 'react';
import { FaClock } from 'react-icons/fa6';
import { registerSidebarView, registerWorkspaceView } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 60;

const LazyTimelinePanel = lazy(async () => {
  const m = await import('../panels/TimelinePanel');
  return { default: m.TimelinePanel };
});

const whenScene = ({ appMode }: { appMode: 'drawing' | 'scene' }) => appMode === 'scene';

export function registerWorkspaceContribution(): void {
  registerSidebarView(
    {
      id: 'timeline',
      label: 'Timeline',
      icon: FaClock,
      placement: 'top',
      order: 40,
      kind: 'panel',
      when: whenScene,
      render: () => (
        <Suspense fallback={<PanelFallback label="Loading timeline..." />}>
          <LazyTimelinePanel />
        </Suspense>
      ),
    },
    duplicate,
  );

  registerWorkspaceView(
    {
      id: 'timelinePanel',
      actionId: 'view:timeline',
      label: 'Timeline',
      icon: FaClock,
      menuOrder: 25,
      panelId: 'timeline',
      sidebarViewId: 'timeline',
      when: whenScene,
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
