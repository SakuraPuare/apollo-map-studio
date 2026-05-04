import { FaTableColumns } from 'react-icons/fa6';
import { registerWorkspaceView } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 50;

export function registerWorkspaceContribution(): void {
  registerWorkspaceView(
    {
      id: 'inspector',
      actionId: 'view:inspector',
      label: 'Inspector',
      icon: FaTableColumns,
      menuOrder: 24,
      panelId: 'inspector',
    },
    duplicate,
  );
}
