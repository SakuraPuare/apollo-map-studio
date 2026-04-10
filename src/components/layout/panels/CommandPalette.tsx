import { useEffect, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import {
  MousePointer2, Pencil, Spline, Circle, Square, Hexagon,
  Undo2, Redo2, Trash2, Copy, Clipboard, Grid3X3, Magnet,
  Save, FolderOpen, Download, Settings, Search, Layers,
  ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';
import type { DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTool?: (tool: DrawTool, element?: MapElementType) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ElementType;
  group: string;
  action: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onSelectTool,
  onUndo,
  onRedo,
  onDelete,
}: CommandPaletteProps) {
  const [search, setSearch] = useState('');

  // Define all commands
  const commands: CommandItem[] = [
    // Tools
    { id: 'select', label: 'Select Tool', shortcut: 'V', icon: MousePointer2, group: 'Tools', action: () => onSelectTool?.('idle' as DrawTool) },
    { id: 'polyline', label: 'Draw Polyline', shortcut: 'P', icon: Pencil, group: 'Tools', action: () => onSelectTool?.('drawPolyline') },
    { id: 'bezier', label: 'Draw Bezier', shortcut: 'B', icon: Spline, group: 'Tools', action: () => onSelectTool?.('drawBezier') },
    { id: 'arc', label: 'Draw Arc', shortcut: 'A', icon: Circle, group: 'Tools', action: () => onSelectTool?.('drawArc') },
    { id: 'rect', label: 'Draw Rectangle', shortcut: 'R', icon: Square, group: 'Tools', action: () => onSelectTool?.('drawRect') },
    { id: 'polygon', label: 'Draw Polygon', shortcut: 'G', icon: Hexagon, group: 'Tools', action: () => onSelectTool?.('drawPolygon') },

    // Edit
    { id: 'undo', label: 'Undo', shortcut: '⌘Z', icon: Undo2, group: 'Edit', action: () => onUndo?.() },
    { id: 'redo', label: 'Redo', shortcut: '⇧⌘Z', icon: Redo2, group: 'Edit', action: () => onRedo?.() },
    { id: 'delete', label: 'Delete Selection', shortcut: '⌫', icon: Trash2, group: 'Edit', action: () => onDelete?.() },
    { id: 'copy', label: 'Copy', shortcut: '⌘C', icon: Copy, group: 'Edit', action: () => {} },
    { id: 'paste', label: 'Paste', shortcut: '⌘V', icon: Clipboard, group: 'Edit', action: () => {} },

    // View
    { id: 'grid', label: 'Toggle Grid', shortcut: '⌘G', icon: Grid3X3, group: 'View', action: () => {} },
    { id: 'snap', label: 'Toggle Snap', shortcut: '⌘⇧S', icon: Magnet, group: 'View', action: () => {} },
    { id: 'zoomin', label: 'Zoom In', shortcut: '⌘+', icon: ZoomIn, group: 'View', action: () => {} },
    { id: 'zoomout', label: 'Zoom Out', shortcut: '⌘-', icon: ZoomOut, group: 'View', action: () => {} },
    { id: 'fit', label: 'Fit to Screen', shortcut: '⌘0', icon: Maximize2, group: 'View', action: () => {} },
    { id: 'layers', label: 'Toggle Layers Panel', icon: Layers, group: 'View', action: () => {} },

    // File
    { id: 'save', label: 'Save', shortcut: '⌘S', icon: Save, group: 'File', action: () => {} },
    { id: 'open', label: 'Open...', shortcut: '⌘O', icon: FolderOpen, group: 'File', action: () => {} },
    { id: 'export', label: 'Export Apollo Format...', icon: Download, group: 'File', action: () => {} },
    { id: 'settings', label: 'Settings', shortcut: '⌘,', icon: Settings, group: 'File', action: () => {} },
  ];

  // Group commands
  const groupedCommands = commands.reduce((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  // Handle command execution
  const runCommand = useCallback((cmd: CommandItem) => {
    cmd.action();
    onOpenChange(false);
    setSearch('');
  }, [onOpenChange]);

  // Keyboard shortcut to open
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Command dialog */}
      <Command
        className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        loop
      >
        {/* Search input */}
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

        {/* Command list */}
        <Command.List className="max-h-[300px] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-zinc-500">
            No results found.
          </Command.Empty>

          {Object.entries(groupedCommands).map(([group, items]) => (
            <Command.Group
              key={group}
              heading={group}
              className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-zinc-600"
            >
              {items.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={`${cmd.label} ${cmd.group}`}
                  onSelect={() => runCommand(cmd)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-300 cursor-pointer aria-selected:bg-cyan-500/20 aria-selected:text-cyan-400"
                >
                  <cmd.icon className="w-4 h-4 text-zinc-500" />
                  <span className="flex-1">{cmd.label}</span>
                  {cmd.shortcut && (
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-800 rounded">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>

        {/* Footer */}
        <div className="border-t border-white/10 px-4 py-2 flex items-center gap-4 text-[10px] text-zinc-600">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>ESC Close</span>
        </div>
      </Command>
    </div>
  );
}
