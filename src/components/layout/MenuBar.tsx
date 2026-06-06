import { useState, useRef, useEffect, useEffectEvent } from 'react';
import {
  formatShortcut,
  getMenuActionsForMode,
  getMenuNames,
  isMacPlatform,
  type ActionDef,
  type ActionId,
} from '@/core/actions/registry';
import logoUrl from '@/assets/logo.svg';
import { useUIStore, type AppMode } from '@/store/uiStore';

// ─── Single Menu ───────────────────────────────────────────

function Menu({
  label,
  actions,
  isOpen,
  onOpen,
  onClose,
  onExecute,
  getToggleState,
}: {
  label: string;
  actions: ActionDef[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onExecute: (id: ActionId) => void;
  getToggleState: (id: ActionId) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onCloseEvent = useEffectEvent(onClose);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseEvent();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const itemsWithDividers = withMenuDividers(actions);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
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
        <div className="absolute top-full left-0 mt-1 py-1 min-w-[180px] w-max bg-zinc-900 border border-white/10 rounded-md shadow-xl z-50">
          {itemsWithDividers.map((item, i) =>
            item === 'divider' ? (
              <div
                key={`div-before-${(itemsWithDividers[i + 1] as ActionDef)?.id ?? i}`}
                className="my-1 border-t border-white/10"
              />
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onExecute(item.id);
                  onClose();
                }}
                className="grid w-full grid-cols-[10px_minmax(0,1fr)_max-content] items-center gap-x-1 p-1.5 text-left text-xs whitespace-nowrap text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
              >
                <span className="text-center text-[11px] leading-none text-zinc-300">
                  {item.isToggle && getToggleState(item.id) ? '✓' : ''}
                </span>
                <span>{item.label}</span>
                <MenuShortcut shortcut={item.shortcut} />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function MenuShortcut({ shortcut }: { shortcut?: string }) {
  const display = formatShortcut(shortcut);
  if (!display) {
    return <span className="min-w-[3.5rem] pl-5" />;
  }

  if (shortcut && isMacPlatform()) {
    const { key, modifiers } = splitMacShortcut(shortcut);
    return (
      <span
        aria-label={display}
        className="grid min-w-[3.9rem] grid-cols-[0.65rem_0.65rem_0.65rem_0.65rem_0.9rem] items-center justify-end pl-5 text-right text-[12px] leading-none text-zinc-500/85"
      >
        {MAC_MODIFIER_ORDER.map((mod, idx) => (
          <span key={mod}>{modifiers[idx]}</span>
        ))}
        <span>{key}</span>
      </span>
    );
  }

  return (
    <span className="min-w-[4.75rem] pl-5 text-right text-[11px] leading-none text-zinc-500/80">
      {display}
    </span>
  );
}

const MAC_MODIFIER_ORDER = ['⌃', '⌥', '⇧', '⌘'] as const;

function splitMacShortcut(shortcut: string): {
  key: string;
  modifiers: string[];
} {
  return {
    key: shortcut.replace(/[⌃⌥⇧⌘]/g, ''),
    modifiers: MAC_MODIFIER_ORDER.map((modifier) => (shortcut.includes(modifier) ? modifier : '')),
  };
}

function withMenuDividers(actions: ActionDef[]): (ActionDef | 'divider')[] {
  const items: (ActionDef | 'divider')[] = [];
  let lastOrder = -1;
  for (const action of actions) {
    const order = Math.floor((action.menuOrder ?? 99) / 10);
    if (lastOrder >= 0 && order !== lastOrder) {
      items.push('divider');
    }
    items.push(action);
    lastOrder = order;
  }
  return items;
}

// ─── MenuBar ───────────────────────────────────────────────

export interface MenuBarProps {
  onExecute: (actionId: ActionId) => void;
  getToggleState: (actionId: ActionId) => boolean;
  showBrand?: boolean;
}

// ─── Mode Toggle ───────────────────────────────────────────

function ModeToggle() {
  const appMode = useUIStore((s) => s.appMode);
  const setAppMode = useUIStore((s) => s.setAppMode);

  const makeBtnClass = (mode: AppMode) =>
    `px-3 py-1 text-[11px] font-medium transition-colors ${
      appMode === mode
        ? 'bg-cyan-500/20 text-cyan-300'
        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
    }`;

  return (
    <div className="flex items-center rounded border border-white/10 overflow-hidden mr-2">
      <button
        type="button"
        onClick={() => setAppMode('drawing')}
        className={makeBtnClass('drawing')}
        title="绘图模式 — Drawing Mode"
      >
        绘图
      </button>
      <div className="w-px h-4 bg-white/10" />
      <button
        type="button"
        onClick={() => setAppMode('scene')}
        className={makeBtnClass('scene')}
        title="场景模式 — Scene Mode"
      >
        场景
      </button>
    </div>
  );
}

export function MenuBar({ onExecute, getToggleState, showBrand = true }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const appMode = useUIStore((s) => s.appMode);

  const menuNames = getMenuNames();

  return (
    <div className="h-8 bg-zinc-950 border-b border-white/[0.07] flex items-center px-2 shrink-0">
      {showBrand ? (
        <div className="flex items-center gap-2 mr-4">
          <img src={logoUrl} alt="" className="size-4 rounded-[3px] shrink-0" aria-hidden="true" />
          <span className="text-xs font-medium text-zinc-300 tracking-wide">Apollo Map Studio</span>
        </div>
      ) : null}

      {/* Menus — generated from registry */}
      <div className="flex items-center">
        {menuNames.map((name) => (
          <Menu
            key={name}
            label={name}
            actions={getMenuActionsForMode(name, appMode)}
            isOpen={openMenu === name}
            onOpen={() => setOpenMenu(openMenu === name ? null : name)}
            onClose={() => setOpenMenu(null)}
            onExecute={onExecute}
            getToggleState={getToggleState}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* App mode segmented toggle */}
      <ModeToggle />
    </div>
  );
}
