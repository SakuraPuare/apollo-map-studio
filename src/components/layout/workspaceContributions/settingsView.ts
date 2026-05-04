import { FaGear } from 'react-icons/fa6';
import { registerSidebarView } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 100;

export function registerWorkspaceContribution(): void {
  registerSidebarView(
    {
      id: 'settings',
      label: 'Settings',
      icon: FaGear,
      placement: 'bottom',
      order: 100,
      kind: 'modal',
    },
    duplicate,
  );
}
