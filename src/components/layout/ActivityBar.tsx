import { Layers, Search, Settings, Clock, FolderTree } from 'lucide-react';
import { clsx } from 'clsx';

export type ActivityTab = 'explorer' | 'layers' | 'search' | 'timeline' | 'settings';

interface ActivityBarProps {
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}

const tabs: { id: ActivityTab; icon: React.ElementType; label: string }[] = [
  { id: 'explorer', icon: FolderTree, label: 'Explorer' },
  { id: 'layers', icon: Layers, label: 'Layers' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'timeline', icon: Clock, label: 'Timeline' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  return (
    <div className="w-12 bg-ams-bg-base border-r border-ams-border-subtle flex flex-col items-center py-2 shrink-0">
      {/* Top tabs */}
      <div className="flex flex-col items-center gap-1">
        {tabs.slice(0, 4).map(({ id, icon: Icon, label }) => (
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom tabs (settings) */}
      <div className="flex flex-col items-center gap-1">
        {tabs.slice(4).map(({ id, icon: Icon, label }) => (
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
    </div>
  );
}
