import { FaLayerGroup, FaMagnifyingGlass, FaGear, FaClock, FaFolderTree } from 'react-icons/fa6';
import { clsx } from 'clsx';

export type ActivityTab = 'explorer' | 'layers' | 'search' | 'timeline' | 'settings';

interface ActivityBarProps {
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}

const tabs: { id: ActivityTab; icon: React.ElementType; label: string }[] = [
  { id: 'explorer', icon: FaFolderTree, label: 'Explorer' },
  { id: 'layers', icon: FaLayerGroup, label: 'Layers' },
  { id: 'search', icon: FaMagnifyingGlass, label: 'Search' },
  { id: 'timeline', icon: FaClock, label: 'Timeline' },
  { id: 'settings', icon: FaGear, label: 'Settings' },
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
