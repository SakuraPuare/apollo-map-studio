import { useEffect, useEffectEvent, useState, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import { FaMagnifyingGlass } from 'react-icons/fa6';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  formatShortcut,
  getCommandPaletteActionsForMode,
  type ActionDef,
  type ActionId,
} from '@/core/actions/registry';
import { useUIStore } from '@/store/uiStore';

// ─── Main Component ────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Execute action by ID — provided by ActionDispatcher */
  onExecute: (actionId: ActionId) => void;
  /** Get toggle state for toggle actions */
  getToggleState?: (actionId: ActionId) => boolean;
}

export function CommandPalette({
  open,
  onOpenChange,
  onExecute,
  getToggleState,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const appMode = useUIStore((s) => s.appMode);

  const actions = useMemo(() => getCommandPaletteActionsForMode(appMode), [appMode]);
  const grouped = useMemo(() => groupActions(actions), [actions]);
  const closePalette = useEffectEvent(() => onOpenChange(false));

  const runCommand = useCallback(
    (action: ActionDef) => {
      onExecute(action.id);
      onOpenChange(false);
      setSearch('');
    },
    [onExecute, onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePalette();
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <button
        type="button"
        tabIndex={0}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
        aria-label="Close command palette"
      />

      <Command
        className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        data-testid="command-palette"
        loop
      >
        <div className="flex items-center border-b border-white/10 px-4">
          <FaMagnifyingGlass className="size-4 text-zinc-500 mr-3" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            aria-label="Command search"
            data-testid="command-palette-input"
            placeholder="Type a command or search..."
            className="flex-1 h-12 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-800 rounded">
            ESC
          </kbd>
        </div>

        <ScrollArea className="max-h-[300px]">
          <Command.List className="p-2">
            <Command.Empty className="py-6 text-center text-sm text-zinc-500">
              No results found.
            </Command.Empty>

            {Object.entries(grouped).map(([group, items]) => (
              <CommandActionGroup
                key={group}
                group={group}
                items={items}
                getToggleState={getToggleState}
                onRun={runCommand}
              />
            ))}
          </Command.List>
        </ScrollArea>

        <div className="border-t border-white/10 px-4 py-2 flex items-center gap-4 text-[10px] text-zinc-600">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </Command>
    </div>
  );
}

function groupActions(actions: ActionDef[]): Record<string, ActionDef[]> {
  const groups: Record<string, ActionDef[]> = {};
  for (const action of actions) {
    const category = action.category.charAt(0).toUpperCase() + action.category.slice(1);
    if (!groups[category]) groups[category] = [];
    groups[category].push(action);
  }
  return groups;
}

interface CommandActionGroupProps {
  group: string;
  items: ActionDef[];
  getToggleState?: (actionId: ActionId) => boolean;
  onRun: (action: ActionDef) => void;
}

function CommandActionGroup({ group, items, getToggleState, onRun }: CommandActionGroupProps) {
  return (
    <Command.Group
      heading={group}
      className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-zinc-600"
    >
      {items.map((action) => (
        <CommandActionItem
          key={action.id}
          action={action}
          group={group}
          isChecked={action.isToggle && getToggleState?.(action.id)}
          onRun={onRun}
        />
      ))}
    </Command.Group>
  );
}

function CommandActionItem({
  action,
  group,
  isChecked,
  onRun,
}: {
  action: ActionDef;
  group: string;
  isChecked?: boolean;
  onRun: (action: ActionDef) => void;
}) {
  const Icon = action.icon ?? FaMagnifyingGlass;
  return (
    // Base text-zinc-300 has no background; the cyan background only applies
    // when aria-selected, where text becomes white. Gray text never sits on
    // cyan — the rule can't reason about the state-conditional class pair.
    // react-doctor-disable-next-line react-doctor/no-gray-on-colored-background
    <Command.Item
      value={`${action.label} ${group}`}
      onSelect={() => onRun(action)}
      className="group flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-300 cursor-pointer aria-selected:bg-cyan-500/20 aria-selected:text-white"
    >
      <Icon className="size-4 text-zinc-500 group-aria-selected:text-white" />
      <span className="flex-1">{action.label}</span>
      {isChecked && <span className="text-cyan-400 text-xs">✓</span>}
      {action.shortcut && (
        <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 group-aria-selected:text-white bg-zinc-800 rounded">
          {formatShortcut(action.shortcut)}
        </kbd>
      )}
    </Command.Item>
  );
}
