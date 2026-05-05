import { FaToolbox } from 'react-icons/fa6';
import { registerWorkspacePanelView } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 55;

export function registerWorkspaceContribution(): void {
  registerWorkspacePanelView(
    {
      id: 'toolbox',
      actionId: 'view:toolbox',
      label: 'Toolbox',
      icon: FaToolbox,
      menuOrder: 26,
      panelId: 'toolbox',
    },
    duplicate,
  );
}
