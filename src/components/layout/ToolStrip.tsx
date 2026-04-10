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
        'relative h-7 px-2 flex items-center gap-1 rounded text-xs transition-all',
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

// ─── Dropdown ──────────────────────────────────────────────

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Dropdown({ trigger, children, open, onOpenChange }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      {open && (
        <div className="absolute top-full left-0 mt-1 py-1 min-w-[180px] bg-zinc-900 border border-white/10 rounded-lg shadow-xl z-50">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Divider ───────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-5 bg-white/10 mx-1" />;
}

// ─── Tool Icon Map ─────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ElementType> = {
  drawPolyline: Pencil,
  drawCatmullRom: Spline,
  drawBezier: Spline,
  drawArc: Circle,
  drawRect: Square,
  drawPolygon: Hexagon,
};

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

  const [elementDropdownOpen, setElementDropdownOpen] = useState(false);
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);

  const elementDef = currentElement ? ELEMENT_MAP.get(currentElement) : null;
  const availableTools = elementDef
    ? ALL_DRAW_TOOLS.filter((t) => elementDef.tools.includes(t.tool))
    : ALL_DRAW_TOOLS;

  const isDrawing = currentTool.startsWith('draw');
  const currentToolDef = ALL_DRAW_TOOLS.find((t) => t.tool === currentTool);

  // Handle element selection
  const handleElementSelect = (type: MapElementType) => {
    const def = ELEMENT_MAP.get(type)!;
    onSelectTool(def.defaultTool, type);
    setElementDropdownOpen(false);
  };

  // Handle tool selection
  const handleToolSelect = (tool: DrawTool) => {
    onSelectTool(tool, currentElement ?? undefined);
    setToolDropdownOpen(false);
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

      {/* Element Type Dropdown */}
      <Dropdown
        open={elementDropdownOpen}
        onOpenChange={setElementDropdownOpen}
        trigger={
          <button
            className={clsx(
              'h-7 px-2 flex items-center gap-1.5 rounded text-xs transition-all',
              currentElement
                ? 'bg-white/10 text-zinc-200'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
            )}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: elementDef?.color || '#666' }}
            />
            <span>{elementDef?.label || 'Element'}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        }
      >
        {MAP_ELEMENTS.map((el) => (
          <button
            key={el.type}
            onClick={() => handleElementSelect(el.type)}
            className={clsx(
              'w-full px-3 py-1.5 flex items-center gap-2 text-xs text-left',
              currentElement === el.type
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
            )}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: el.color }}
            />
            <span>{el.label}</span>
          </button>
        ))}
      </Dropdown>

      <Divider />

      {/* Tool Dropdown */}
      <Dropdown
        open={toolDropdownOpen}
        onOpenChange={setToolDropdownOpen}
        trigger={
          <button
            className={clsx(
              'h-7 px-2 flex items-center gap-1.5 rounded text-xs transition-all',
              isDrawing
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
            )}
          >
            {currentToolDef ? (
              <>
                {(() => {
                  const Icon = TOOL_ICONS[currentToolDef.tool] || Pencil;
                  return <Icon className="w-4 h-4" />;
                })()}
                <span>{currentToolDef.label}</span>
              </>
            ) : (
              <>
                <Pencil className="w-4 h-4" />
                <span>Draw Tool</span>
              </>
            )}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        }
      >
        {availableTools.map(({ tool, label }) => {
          const Icon = TOOL_ICONS[tool] || Pencil;
          return (
            <button
              key={tool}
              onClick={() => handleToolSelect(tool)}
              className={clsx(
                'w-full px-3 py-1.5 flex items-center gap-2 text-xs text-left',
                currentTool === tool
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </Dropdown>

      {/* Quick tool buttons */}
      <div className="flex items-center gap-0.5 ml-1">
        {availableTools.slice(0, 4).map(({ tool, label }) => {
          const Icon = TOOL_ICONS[tool] || Pencil;
          return (
            <ToolButton
              key={tool}
              icon={Icon}
              label={label}
              active={currentTool === tool}
              onClick={() => handleToolSelect(tool)}
            />
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Command Palette */}
      <button
        onClick={onOpenCommandPalette}
        className="h-7 px-2 flex items-center gap-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
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
