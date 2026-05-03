import { FaTerminal, FaMagnifyingGlass } from 'react-icons/fa6';
import { clsx } from 'clsx';
import type { DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';
import { MAP_ELEMENTS, ALL_DRAW_TOOLS, ELEMENT_MAP } from '@/core/elements';
import {
  ACTION_DEFS,
  formatShortcut,
  getToolAction,
  getToolStripSlotActions,
  type ActionId,
} from '@/core/actions/registry';

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
  const display = formatShortcut(shortcut);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={display ? `${label} (${display})` : label}
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
        const Icon = el.icon;
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

  return (
    <div className="h-9 bg-ams-bg-base border-b border-ams-border-subtle flex items-center px-2 gap-1 shrink-0">
      <ModeActionButtons getToggleState={getToggleState} onExecuteAction={onExecuteAction} />

      <ElementBar
        currentElement={currentElement}
        onSelect={(type) => onSelectTool(ELEMENT_MAP.get(type)!.defaultTool, type)}
      />

      <DrawToolButtons
        currentTool={currentTool}
        currentElement={currentElement}
        elementLabel={elementDef?.label ?? ''}
        tools={elementDef ? ALL_DRAW_TOOLS.filter((t) => elementDef.tools.includes(t.tool)) : []}
        onSelectTool={onSelectTool}
      />

      <div className="flex-1" />

      <CommandPaletteButton onOpen={onOpenCommandPalette} />
      <Divider />
      <ViewActionButtons getToggleState={getToggleState} onExecuteAction={onExecuteAction} />
    </div>
  );
}

interface ActionButtonGroupProps {
  onExecuteAction: (actionId: ActionId) => void;
  getToggleState: (actionId: ActionId) => boolean;
}

function ModeActionButtons({ getToggleState, onExecuteAction }: ActionButtonGroupProps) {
  const actions = ACTION_DEFS.filter((a) => a.id === 'defaultMode' || a.id === 'connectLanes');
  if (actions.length === 0) return null;

  return (
    <>
      {actions.map((action) => (
        <ToolButton
          key={action.id}
          icon={action.icon ?? FaMagnifyingGlass}
          label={action.label}
          shortcut={action.shortcut}
          active={getToggleState(action.id)}
          onClick={() => onExecuteAction(action.id)}
        />
      ))}
      <Divider />
    </>
  );
}

interface DrawToolButtonsProps {
  currentTool: string;
  currentElement: MapElementType | null;
  elementLabel: string;
  tools: typeof ALL_DRAW_TOOLS;
  onSelectTool: (tool: DrawTool, element?: MapElementType) => void;
}

function DrawToolButtons({
  currentTool,
  currentElement,
  elementLabel,
  tools,
  onSelectTool,
}: DrawToolButtonsProps) {
  if (tools.length === 0 || !currentElement) return null;

  return (
    <>
      <Divider />
      <div className="flex items-center gap-0.5">
        {tools.map(({ tool }) => {
          const action = getToolAction(tool);
          const Icon = action?.icon ?? FaMagnifyingGlass;
          return (
            <ToolButton
              key={tool}
              icon={Icon}
              label={`${elementLabel} · ${action?.label ?? tool}`}
              shortcut={action?.shortcut}
              active={currentTool === tool}
              onClick={() => onSelectTool(tool, currentElement)}
            />
          );
        })}
      </div>
    </>
  );
}

function CommandPaletteButton({ onOpen }: { onOpen?: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="h-7 px-2 flex items-center gap-1.5 rounded text-xs text-ams-text-secondary hover:text-ams-text-primary hover:bg-ams-surface-hover shrink-0"
    >
      <FaTerminal className="w-3.5 h-3.5" />
      <kbd className="text-[10px] font-mono text-ams-text-disabled">⌘K</kbd>
    </button>
  );
}

function ViewActionButtons({ getToggleState, onExecuteAction }: ActionButtonGroupProps) {
  return getToolStripSlotActions('view').map((action) => {
    const Icon = action.icon ?? FaMagnifyingGlass;
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
  });
}
