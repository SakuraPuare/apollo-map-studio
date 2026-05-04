import { registerWorkspacePanel } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 0;

const whenScene = ({ appMode }: { appMode: 'drawing' | 'scene' }) => appMode === 'scene';

export function registerWorkspaceContribution(): void {
  registerWorkspacePanel(
    {
      id: 'map',
      component: 'map',
      defaultTitle: 'Map Editor',
      zone: 'editor',
      order: 10,
    },
    duplicate,
  );

  registerWorkspacePanel(
    {
      id: 'sidebar',
      component: 'sidebar',
      defaultTitle: 'Outline',
      zone: 'primarySidebar',
      order: 20,
      defaultSize: { width: 220 },
    },
    duplicate,
  );

  registerWorkspacePanel(
    {
      id: 'inspector',
      component: 'inspector',
      defaultTitle: 'Inspector',
      zone: 'secondarySidebar',
      order: 30,
      defaultSize: { width: 280 },
    },
    duplicate,
  );

  registerWorkspacePanel(
    {
      id: 'timeline',
      component: 'timeline',
      defaultTitle: 'Timeline',
      zone: 'bottomPanel',
      order: 40,
      defaultSize: { height: 180 },
      when: whenScene,
    },
    duplicate,
  );
}
