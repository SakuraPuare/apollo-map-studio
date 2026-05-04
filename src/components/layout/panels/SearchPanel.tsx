import { useMemo } from 'react';
import { FaMagnifyingGlass } from 'react-icons/fa6';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMapStore } from '@/store/mapStore';
import { useSidebar } from '@/context/SidebarContext';
import { clsx } from 'clsx';
import { searchEntities } from './panelData';

interface SearchPanelProps {
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

// Fast linear scan over `entities` filtered by ID or type substring.
// The result is intentionally a flat list (no hierarchy) so the user
// can locate an entity regardless of where it sits in the layer tree.

export function SearchPanel({ selectedId, onSelect }: SearchPanelProps) {
  const entities = useMapStore((s) => s.entities);
  const { searchQuery, setSearchQuery } = useSidebar();

  const results = useMemo(() => {
    return searchEntities(entities, searchQuery);
  }, [entities, searchQuery]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-2 border-b border-white/[0.07] shrink-0">
        <div className="relative">
          <FaMagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search id or type…"
            className="w-full bg-zinc-800/60 border border-white/[0.07] rounded pl-7 pr-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
            autoFocus
          />
        </div>
        <div className="text-[10px] text-zinc-600 mt-1 px-1">
          {searchQuery
            ? `${results.length} match${results.length === 1 ? '' : 'es'}`
            : 'Type to search'}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {results.length === 0 ? (
          <div className="p-4 text-center text-zinc-600 text-xs">
            {searchQuery ? 'No matches' : 'Search across all entity ids and types.'}
          </div>
        ) : (
          <ul className="py-1">
            {results.map((r) => (
              <li
                key={r.id}
                onClick={() => onSelect?.(r.id)}
                className={clsx(
                  'px-3 py-1 cursor-pointer flex justify-between items-center gap-2 hover:bg-white/5',
                  selectedId === r.id && 'bg-cyan-500/15',
                )}
              >
                <span className="text-xs font-mono text-zinc-300 truncate" title={r.id}>
                  {r.id.length > 22 ? `…${r.id.slice(-18)}` : r.id}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">
                  {r.entityType}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
