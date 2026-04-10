import { ChevronDown } from 'lucide-react';

interface MenuItemProps {
  label: string;
  items?: { label: string; shortcut?: string; onClick?: () => void; divider?: boolean }[];
}

function MenuItem({ label, items }: MenuItemProps) {
  return (
    <div className="group relative">
      <button className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded transition-colors flex items-center gap-1">
        {label}
        {items && <ChevronDown className="w-3 h-3 opacity-50" />}
      </button>
      {items && (
        <div className="absolute top-full left-0 mt-1 py-1 min-w-[180px] bg-zinc-900 border border-white/10 rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1 border-t border-white/10" />
            ) : (
              <button
                key={i}
                onClick={item.onClick}
                className="w-full px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/10 flex items-center justify-between"
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="text-zinc-600 font-mono text-[10px]">{item.shortcut}</span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

interface MenuBarProps {
  onUndo?: () => void;
  onRedo?: () => void;
}

export function MenuBar({ onUndo, onRedo }: MenuBarProps) {
  const menus: MenuItemProps[] = [
    {
      label: 'File',
      items: [
        { label: 'New Map', shortcut: '⌘N' },
        { label: 'Open...', shortcut: '⌘O' },
        { divider: true },
        { label: 'Save', shortcut: '⌘S' },
        { label: 'Export Apollo Format...' },
        { divider: true },
        { label: 'Settings', shortcut: '⌘,' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: '⌘Z', onClick: onUndo },
        { label: 'Redo', shortcut: '⇧⌘Z', onClick: onRedo },
        { divider: true },
        { label: 'Cut', shortcut: '⌘X' },
        { label: 'Copy', shortcut: '⌘C' },
        { label: 'Paste', shortcut: '⌘V' },
        { label: 'Delete', shortcut: '⌫' },
        { divider: true },
        { label: 'Select All', shortcut: '⌘A' },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Reset Layout' },
        { divider: true },
        { label: 'Layers Panel' },
        { label: 'Inspector Panel' },
        { label: 'Timeline Panel' },
        { divider: true },
        { label: 'Toggle Grid', shortcut: '⌘G' },
        { label: 'Toggle Snap', shortcut: '⌘⇧S' },
      ],
    },
    {
      label: 'Selection',
      items: [
        { label: 'Select All', shortcut: '⌘A' },
        { label: 'Deselect', shortcut: 'Esc' },
        { label: 'Invert Selection' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Select', shortcut: 'V' },
        { label: 'Pan', shortcut: 'H' },
        { divider: true },
        { label: 'Draw Polyline', shortcut: 'P' },
        { label: 'Draw Bezier', shortcut: 'B' },
        { label: 'Draw Arc', shortcut: 'A' },
        { label: 'Draw Rectangle', shortcut: 'R' },
        { label: 'Draw Polygon', shortcut: 'G' },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Documentation' },
        { label: 'Keyboard Shortcuts', shortcut: '⌘K ⌘S' },
        { divider: true },
        { label: 'About Apollo Map Studio' },
      ],
    },
  ];

  return (
    <div className="h-8 bg-zinc-950 border-b border-white/[0.07] flex items-center px-2 shrink-0">
      {/* Logo / App Name */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-cyan-400 to-cyan-600" />
        <span className="text-xs font-medium text-zinc-300 tracking-wide">Apollo Map Studio</span>
      </div>

      {/* Menu Items */}
      <div className="flex items-center">
        {menus.map((menu) => (
          <MenuItem key={menu.label} {...menu} />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Window Controls (placeholder for Electron) */}
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-yellow-500 transition-colors cursor-pointer" />
        <div className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-green-500 transition-colors cursor-pointer" />
        <div className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-red-500 transition-colors cursor-pointer" />
      </div>
    </div>
  );
}
