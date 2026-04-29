import { Command } from 'lucide-react';
import { clsx } from 'clsx';
import type { DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';
import { MAP_ELEMENTS, ALL_DRAW_TOOLS, ELEMENT_MAP } from '@/core/elements';
import { getToolAction, getToolStripSlotActions, type ActionId } from '@/core/actions/registry';
import { getIcon } from '@/components/ui/icon-registry';

// ─── Types ─────────────────────────────────────────────────

interface ToolStripProps {
  currentTool: string;
  currentElement: MapElementType | null;
  onSelectTool: (tool: DrawTool, element?: MapElementType) => void;
  onOpenCommandPalette?: () => void;
  /** Action Registry dispatcher — required for view slot (grid/snap). */
  onExecuteAction: (actionId: ActionId) => void;
  /** Action Registry toggle state reader — required for view slot. */
  getToggleState: (actionId: ActionId) => boolean;
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
          ? 'bg-ams-accent/20 text-ams-accent shadow-[inset_0_-2px_0_0_var(--color-ams-accent)]'
          : 'text-ams-text-secondary hover:text-ams-text-primary hover:bg-ams-surface-hover',
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// ─── Divider ───────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-5 bg-ams-border-strong mx-1 shrink-0" />;
}

// ─── Element Bar (flat, icon-only) ─────────────────────────

interface ElementBarProps {
  currentElement: MapElementType | null;
  onSelect: (type: MapElementType) => void;
}

function ElementBar({ currentElement, onSelect }: ElementBarProps) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {MAP_ELEMENTS.map((el) => {
        const Icon = getIcon(el.icon);
        const active = currentElement === el.type;
        return (
          <button
            key={el.type}
            onClick={() => onSelect(el.type)}
            title={el.label}
            className={clsx(
              'h-7 w-7 flex items-center justify-center rounded text-xs transition-all shrink-0',
              active
                ? 'bg-ams-surface-active'
                : 'text-ams-text-secondary hover:text-ams-text-primary hover:bg-ams-surface-hover',
            )}
            style={active ? { color: el.color } : undefined}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function ToolStrip({
  currentTool,
  currentElement,
  onSelectTool,
  onOpenCommandPalette,
  onExecuteAction,
  getToggleState,
}: ToolStripProps) {
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

  // View slot is fully registry-driven: action.isToggle decides whether to read
  // dispatcher.getToggleState; click always goes through dispatcher.execute.
  // Selection slot is gone (ESC + maplibre's native drag handle exit/pan).
  const viewActions = getToolStripSlotActions('view');

  return (
    <div className="h-9 bg-ams-bg-base border-b border-ams-border-subtle flex items-center px-2 gap-1 shrink-0">
      {/* 元素选择器（11 个图标平铺） */}
      <ElementBar currentElement={currentElement} onSelect={handleElementSelect} />

      {/* 选中后显示 Divider + 该元素允许的绘制工具；未选中则隐藏整段 */}
      {availableTools.length > 0 && (
        <>
          <Divider />
          <div className="flex items-center gap-0.5">
            {availableTools.map(({ tool }) => {
              const action = getToolAction(tool);
              const Icon = getIcon(action?.icon);
              return (
                <ToolButton
                  key={tool}
                  icon={Icon}
                  label={`${elementDef?.label ?? ''} · ${action?.label ?? tool}`}
                  shortcut={action?.shortcut}
                  active={currentTool === tool}
                  onClick={() => handleToolSelect(tool)}
                />
              );
            })}
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Command Palette */}
      <button
        onClick={onOpenCommandPalette}
        className="h-7 px-2 flex items-center gap-1.5 rounded text-xs text-ams-text-secondary hover:text-ams-text-primary hover:bg-ams-surface-hover shrink-0"
      >
        <Command className="w-3.5 h-3.5" />
        <kbd className="text-[10px] font-mono text-ams-text-disabled">⌘K</kbd>
      </button>

      <Divider />

      {/* View slot — fully registry-driven via dispatcher */}
      {viewActions.map((action) => {
        const Icon = getIcon(action.icon);
        return (
          <ToolButton
            key={action.id}
            icon={Icon}
            label={action.label}
            shortcut={action.shortcut}
            active={action.isToggle ? getToggleState(action.id) : false}
            onClick={() => onExecuteAction(action.id)}
          />
        );
      })}
    </div>
  );
}
