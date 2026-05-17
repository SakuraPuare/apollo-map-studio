import { createContext, use, useState, useCallback } from 'react';
import { getDefaultSidebarViewId, type SidebarViewId } from '@/core/workspaceViews';

interface SidebarContextValue {
  activeTab: SidebarViewId;
  setActiveTab(tab: SidebarViewId): void;
  /** Free-text search query, scoped to the Search tab. */
  searchQuery: string;
  setSearchQuery(q: string): void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<SidebarViewId>(() => getDefaultSidebarViewId());
  const [searchQuery, setSearchQuery] = useState('');

  const setTab = useCallback((tab: SidebarViewId) => setActiveTab(tab), []);
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

export function useSidebar(): SidebarContextValue {
  const ctx = use(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
