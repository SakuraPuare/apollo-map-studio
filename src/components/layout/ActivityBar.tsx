import { clsx } from 'clsx';
import {
  getSidebarViewsByPlacement,
  type SidebarViewDef,
  type SidebarViewId,
} from '@/core/workspaceViews';
import type { AppMode } from '@/store/uiStore';

export type ActivityTab = SidebarViewId;

interface ActivityBarProps {
  activeTab: ActivityTab;
  appMode: AppMode;
  onTabChange: (tab: ActivityTab) => void;
}

export function ActivityBar({ activeTab, appMode, onTabChange }: ActivityBarProps) {
  const topTabs = getSidebarViewsByPlacement('top', appMode);
  const bottomTabs = getSidebarViewsByPlacement('bottom', appMode);

  return (
    <div className="w-12 bg-ams-bg-base border-r border-ams-border-subtle flex flex-col items-center py-2 shrink-0">
      <ActivityBarGroup tabs={topTabs} activeTab={activeTab} onTabChange={onTabChange} />
      <div className="flex-1" />
      <ActivityBarGroup tabs={bottomTabs} activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}

function ActivityBarGroup({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: SidebarViewDef[];
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          title={label}
          className={clsx(
            'relative w-10 h-10 flex items-center justify-center rounded transition-colors',
            activeTab === id
              ? 'text-ams-text-primary bg-ams-surface-active'
              : 'text-ams-text-muted hover:text-ams-text-primary hover:bg-ams-surface-hover',
          )}
        >
          {activeTab === id && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-ams-accent rounded-r" />
          )}
          <Icon className="w-5 h-5" />
        </button>
      ))}
    </div>
  );
}
