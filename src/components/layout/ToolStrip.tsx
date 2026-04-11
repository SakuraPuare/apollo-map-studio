import { useState, useRef, useEffect } from 'react';
import {
  MousePointer2, Hand, Pencil, Spline, Circle, Square, Hexagon,
  Grid3X3, Magnet, ChevronDown, Command
} from 'lucide-react';
import { clsx } from 'clsx';
import type { DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';
import { MAP_ELEMENTS, ALL_DRAW_TOOLS, ELEMENT_MAP } from '@/core/elements';
import { useUIStore } from '@/store/uiStore';

// ─── Types ─────────────────────────────────────────────────

interface ToolStripProps {
  currentTool: string;
  currentElement: MapElementType | null;
  onSelectTool: (tool: DrawTool, element?: MapElementType) => void;
  onOpenCommandPalette?: () => void;
}

// ─── Tool Button ───────────────────────────────────────────

interface ToolButtonProps {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

function ToolButton({ icon: Icon, label, shortcut, active, onClick, disabled }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={clsx(
        'relative h-7 px-2 flex items-center gap-1 rounded text-xs transition-all shrink-0',
        disabled && 'opacity-40 cursor-not-allowed',
        active
          ? 'bg-cyan-500/20 text-cyan-400 shadow-[inset_0_-2px_0_0_theme(colors.cyan.400)]'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// ─── Divider ───────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />;
}

// ─── Tool Icon Map ─────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ElementType> = {
  drawPolyline: Pencil,
  drawCatmullRom: Spline,
  drawBezier: Spline,
  drawArc: Circle,
  drawRotatedRect: Square,
  drawPolygon: Hexagon,
};

// ─── Element Dropdown ──────────────────────────────────────

interface ElementDropdownProps {
  currentElement: MapElementType | null;
  onSelect: (type: MapElementType) => void;
}

function ElementDropdown({ currentElement, onSelect }: ElementDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const elementDef = currentElement ? ELEMENT_MAP.get(currentElement) : null;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'h-7 px-2 flex items-center gap-1.5 rounded text-xs transition-all',
          currentElement
            ? 'bg-white/10 text-zinc-100 hover:bg-white/15'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
        )}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: elementDef?.color ?? '#666' }}
        />
        <span className="whitespace-nowrap">{elementDef?.label ?? '选择元素'}</span>
        <ChevronDown className={clsx('w-3 h-3 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 py-1 min-w-[140px] bg-zinc-900 border border-white/10 rounded-lg shadow-xl z-50">
          {MAP_ELEMENTS.map((el) => (
            <button
              key={el.type}
              onClick={() => {
                onSelect(el.type);
                setOpen(false);
              }}
              className={clsx(
                'w-full px-3 py-1.5 flex items-center gap-2 text-xs text-left',
                currentElement === el.type
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
              )}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: el.color }} />
              <span className="whitespace-nowrap">{el.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function ToolStrip({
  currentTool,
  currentElement,
  onSelectTool,
  onOpenCommandPalette,
}: ToolStripProps) {
  const gridEnabled = useUIStore((s) => s.gridEnabled);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const toggleGrid = useUIStore((s) => s.toggleGrid);
  const toggleSnap = useUIStore((s) => s.toggleSnap);

  const elementDef = currentElement ? ELEMENT_MAP.get(currentElement) : null;
  const availableTools = elementDef
    ? ALL_DRAW_TOOLS.filter((t) => elementDef.tools.includes(t.tool))
    : [];

  const handleElementSelect = (type: MapElementType) => {
    const def = ELEMENT_MAP.get(type)!;
    onSelectTool(def.defaultTool, type);
  };

  const handleToolSelect = (tool: DrawTool) => {
    if (!currentElement) return;
    onSelectTool(tool, currentElement);
  };

  return (
    <div className="h-9 bg-zinc-900/80 border-b border-white/[0.07] flex items-center px-2 gap-1 shrink-0">
      {/* Selection tools */}
      <ToolButton
        icon={MousePointer2}
        label="Select"
        shortcut="V"
        active={currentTool === 'idle' || currentTool === 'selected'}
        onClick={() => onSelectTool('idle' as DrawTool)}
      />
      <ToolButton
        icon={Hand}
        label="Pan"
        shortcut="H"
        active={currentTool === 'panning'}
      />

      <Divider />

      {/* 元素选择器（单个下拉按钮） */}
      <ElementDropdown currentElement={currentElement} onSelect={handleElementSelect} />

      <Divider />

      {/* 当前元素对应的工具按钮（动态更新） */}
      <div className="flex items-center gap-0.5">
        {availableTools.length > 0 ? (
          availableTools.map(({ tool, label }) => {
            const Icon = TOOL_ICONS[tool] ?? Pencil;
            return (
              <ToolButton
                key={tool}
                icon={Icon}
                label={`${elementDef?.label ?? ''} · ${label}`}
                active={currentTool === tool}
                onClick={() => handleToolSelect(tool)}
              />
            );
          })
        ) : (
          <span className="text-[11px] text-zinc-600 px-1 whitespace-nowrap">先选元素</span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Command Palette */}
      <button
        onClick={onOpenCommandPalette}
        className="h-7 px-2 flex items-center gap-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/10 shrink-0"
      >
        <Command className="w-3.5 h-3.5" />
        <kbd className="text-[10px] font-mono text-zinc-600">⌘K</kbd>
      </button>

      <Divider />

      <ToolButton icon={Grid3X3} label="Toggle Grid" shortcut="⌘G" active={gridEnabled} onClick={toggleGrid} />
      <ToolButton icon={Magnet} label="Toggle Snap" active={snapEnabled} onClick={toggleSnap} />
    </div>
  );
}
