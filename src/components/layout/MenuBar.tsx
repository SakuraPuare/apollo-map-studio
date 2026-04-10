import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  divider?: boolean;
  checked?: boolean;
  disabled?: boolean;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

// ─── Single Menu ───────────────────────────────────────────

function Menu({ label, items, isOpen, onOpen, onClose }: {
  label: string;
  items: MenuItem[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onOpen}
        onMouseEnter={() => { if (isOpen) return; /* hover-to-switch handled by parent */ }}
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
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1 border-t border-white/10" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick?.();
                  onClose();
                }}
                disabled={item.disabled}
                className={`w-full px-3 py-1.5 text-xs flex items-center justify-between ${
                  item.disabled
                    ? 'text-zinc-600 cursor-not-allowed'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                }`}
              >
                <span className="flex items-center gap-2">
                  {item.checked !== undefined && (
                    <span className="w-4 text-center">{item.checked ? '✓' : ''}</span>
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
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onToggleGrid?: () => void;
  onToggleSnap?: () => void;
  onResetLayout?: () => void;
  onOpenSettings?: () => void;
  onExport?: () => void;
  gridEnabled?: boolean;
  snapEnabled?: boolean;
}

export function MenuBar({
  onUndo,
  onRedo,
  onDelete,
  onToggleGrid,
  onToggleSnap,
  onResetLayout,
  onOpenSettings,
  onExport,
  gridEnabled = false,
  snapEnabled = false,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'Export Apollo Format...', onClick: onExport },
        { divider: true },
        { label: 'Settings', shortcut: '⌘,', onClick: onOpenSettings },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: '⌘Z', onClick: onUndo },
        { label: 'Redo', shortcut: '⇧⌘Z', onClick: onRedo },
        { divider: true },
        { label: 'Delete', shortcut: '⌫', onClick: onDelete },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Reset Layout', onClick: onResetLayout },
        { divider: true },
        { label: 'Grid', shortcut: '⌘G', onClick: onToggleGrid, checked: gridEnabled },
        { label: 'Snap to Grid', onClick: onToggleSnap, checked: snapEnabled },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', shortcut: '⌘K ⌘S', disabled: true },
        { divider: true },
        { label: 'About Apollo Map Studio', disabled: true },
      ],
    },
  ];

  return (
    <div className="h-8 bg-zinc-950 border-b border-white/[0.07] flex items-center px-2 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-400 to-cyan-600" />
        <span className="text-xs font-medium text-zinc-300 tracking-wide">Apollo Map Studio</span>
      </div>

      {/* Menu Items */}
      <div className="flex items-center">
        {menus.map((menu) => (
          <Menu
            key={menu.label}
            label={menu.label}
            items={menu.items}
            isOpen={openMenu === menu.label}
            onOpen={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
            onClose={() => setOpenMenu(null)}
          />
        ))}
      </div>

      <div className="flex-1" />
    </div>
  );
}
