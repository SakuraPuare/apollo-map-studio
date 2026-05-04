import { FaClock } from 'react-icons/fa6';
import { registerWorkspacePanelView } from '@/core/workspaceViewRegistry';

const duplicate = { duplicate: 'ignore' } as const;

export const workspaceContributionOrder = 60;

const whenScene = ({ appMode }: { appMode: 'drawing' | 'scene' }) => appMode === 'scene';

export function registerWorkspaceContribution(): void {
  registerWorkspacePanelView(
    {
      id: 'timelinePanel',
      actionId: 'view:timeline',
      label: 'Timeline',
      icon: FaClock,
      menuOrder: 25,
      panelId: 'timeline',
      when: whenScene,
    },
    duplicate,
  );
}
