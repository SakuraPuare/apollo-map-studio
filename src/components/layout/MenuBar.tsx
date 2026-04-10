import { useState, useRef, useEffect } from 'react';
import { getMenuActions, getMenuNames, type ActionDef } from '@/core/actions/registry';

// ─── Single Menu ───────────────────────────────────────────

function Menu({ label, actions, isOpen, onOpen, onClose, onExecute, getToggleState }: {
  label: string;
  actions: ActionDef[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onExecute: (id: string) => void;
  getToggleState: (id: string) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Insert dividers between different menuOrder groups
  const itemsWithDividers: (ActionDef | 'divider')[] = [];
  let lastOrder = -1;
  for (const action of actions) {
    const order = Math.floor((action.menuOrder ?? 99) / 10);
    if (lastOrder >= 0 && order !== lastOrder) {
      itemsWithDividers.push('divider');
    }
    itemsWithDividers.push(action);
    lastOrder = order;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onOpen}
        className={`px-3 py-1 text-xs transition-colors rounded ${
          isOpen
            ? 'text-zinc-200 bg-white/10'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
        }`}
      >
        {label}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 py-1 min-w-[200px] bg-zinc-900 border border-white/10 rounded-md shadow-xl z-50">
          {itemsWithDividers.map((item, i) =>
            item === 'divider' ? (
              <div key={`div-${i}`} className="my-1 border-t border-white/10" />
            ) : (
              <button
                key={item.id}
                onClick={() => {
                  onExecute(item.id);
                  onClose();
                }}
                className="w-full px-3 py-1.5 text-xs flex items-center justify-between text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
              >
                <span className="flex items-center gap-2">
                  {item.isToggle && (
                    <span className="w-4 text-center">{getToggleState(item.id) ? '✓' : ''}</span>
                  )}
                  <span>{item.label}</span>
                </span>
                {item.shortcut && (
                  <span className="text-zinc-600 font-mono text-[10px] ml-4">{item.shortcut}</span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── MenuBar ───────────────────────────────────────────────

export interface MenuBarProps {
  onExecute: (actionId: string) => void;
  getToggleState: (actionId: string) => boolean;
}

export function MenuBar({ onExecute, getToggleState }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const menuNames = getMenuNames();

  return (
    <div className="h-8 bg-zinc-950 border-b border-white/[0.07] flex items-center px-2 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-400 to-cyan-600" />
        <span className="text-xs font-medium text-zinc-300 tracking-wide">Apollo Map Studio</span>
      </div>

      {/* Menus — generated from registry */}
      <div className="flex items-center">
        {menuNames.map((name) => (
          <Menu
            key={name}
            label={name}
            actions={getMenuActions(name)}
            isOpen={openMenu === name}
            onOpen={() => setOpenMenu(openMenu === name ? null : name)}
            onClose={() => setOpenMenu(null)}
            onExecute={onExecute}
            getToggleState={getToggleState}
          />
        ))}
      </div>

      <div className="flex-1" />
    </div>
  );
}
