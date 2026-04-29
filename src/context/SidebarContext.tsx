import { createContext, useContext, useState, useCallback } from 'react';
import type { ActivityTab } from '@/components/layout/ActivityBar';

interface SidebarContextValue {
  activeTab: ActivityTab;
  setActiveTab(tab: ActivityTab): void;
  /** Free-text search query, scoped to the Search tab. */
  searchQuery: string;
  setSearchQuery(q: string): void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActivityTab>('explorer');
  const [searchQuery, setSearchQuery] = useState('');

  const setTab = useCallback((tab: ActivityTab) => setActiveTab(tab), []);
  const setQuery = useCallback((q: string) => setSearchQuery(q), []);

  return (
    <SidebarContext.Provider
      value={{
        activeTab,
        setActiveTab: setTab,
        searchQuery,
        setSearchQuery: setQuery,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
