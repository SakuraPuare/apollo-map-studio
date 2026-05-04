import { registerWorkspacePanel } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 0;

export function registerWorkspaceContribution(): void {
  registerWorkspacePanel(
    {
      id: 'map',
      component: 'map',
      defaultTitle: 'Map Editor',
    },
    duplicate,
  );

  registerWorkspacePanel(
    {
      id: 'sidebar',
      component: 'sidebar',
      defaultTitle: 'Outline',
      defaultSize: { width: 220 },
    },
    duplicate,
  );

  registerWorkspacePanel(
    {
      id: 'inspector',
      component: 'inspector',
      defaultTitle: 'Inspector',
      defaultSize: { width: 280 },
    },
    duplicate,
  );

  registerWorkspacePanel(
    {
      id: 'timeline',
      component: 'timeline',
      defaultTitle: 'Timeline',
      defaultSize: { height: 180 },
    },
    duplicate,
  );
}
