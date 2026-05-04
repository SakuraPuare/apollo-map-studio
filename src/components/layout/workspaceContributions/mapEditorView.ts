import { FaTableColumns } from 'react-icons/fa6';
import { registerWorkspaceView } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 10;

export function registerWorkspaceContribution(): void {
  registerWorkspaceView(
    {
      id: 'mapEditor',
      actionId: 'view:mapEditor',
      label: 'Map Editor',
      icon: FaTableColumns,
      menuOrder: 20,
      panelId: 'map',
    },
    duplicate,
  );
}
