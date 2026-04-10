import { useEffect, useState, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import {
  MousePointer2, Pencil, Spline, Circle, Square, Hexagon,
  Undo2, Redo2, Trash2, Grid3X3, Magnet, Settings,
  Download, Search, LayoutDashboard, Command as CommandIcon
} from 'lucide-react';
import { getCommandPaletteActions, type ActionDef } from '@/core/actions/registry';

// ─── Icon Map ──────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  MousePointer2, Pencil, Spline, Circle, Square, Hexagon,
  Undo2, Redo2, Trash2, Grid3X3, Magnet, Settings,
  Download, LayoutDashboard, Command: CommandIcon,
};

function getIcon(name?: string): React.ElementType {
  return (name && ICON_MAP[name]) || Search;
}

// ─── Main Component ────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Execute action by ID — provided by ActionDispatcher */
  onExecute: (actionId: string) => void;
  /** Get toggle state for toggle actions */
  getToggleState?: (actionId: string) => boolean;
}

export function CommandPalette({
  open,
  onOpenChange,
  onExecute,
  getToggleState,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('');

  // Read actions from registry
  const actions = useMemo(() => getCommandPaletteActions(), []);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, ActionDef[]> = {};
    for (const a of actions) {
      const cat = a.category.charAt(0).toUpperCase() + a.category.slice(1);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    }
    return groups;
  }, [actions]);

  const runCommand = useCallback((action: ActionDef) => {
    onExecute(action.id);
    onOpenChange(false);
    setSearch('');
  }, [onExecute, onOpenChange]);

  // ⌘K to open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      <Command
        className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        loop
      >
        <div className="flex items-center border-b border-white/10 px-4">
          <Search className="w-4 h-4 text-zinc-500 mr-3" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command or search..."
            className="flex-1 h-12 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-800 rounded">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[300px] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-zinc-500">
            No results found.
          </Command.Empty>

          {Object.entries(grouped).map(([group, items]) => (
            <Command.Group
              key={group}
              heading={group}
              className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-zinc-600"
            >
              {items.map((action) => {
                const Icon = getIcon(action.icon);
                const isChecked = action.isToggle && getToggleState?.(action.id);

                return (
                  <Command.Item
                    key={action.id}
                    value={`${action.label} ${group}`}
                    onSelect={() => runCommand(action)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-300 cursor-pointer aria-selected:bg-cyan-500/20 aria-selected:text-cyan-400"
                  >
                    <Icon className="w-4 h-4 text-zinc-500" />
                    <span className="flex-1">{action.label}</span>
                    {isChecked && <span className="text-cyan-400 text-xs">✓</span>}
                    {action.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-800 rounded">
                        {action.shortcut}
                      </kbd>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>

        <div className="border-t border-white/10 px-4 py-2 flex items-center gap-4 text-[10px] text-zinc-600">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </Command>
    </div>
  );
}
