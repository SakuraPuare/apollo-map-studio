import { FaTerminal, FaMagnifyingGlass } from 'react-icons/fa6';
import { clsx } from 'clsx';
import type { DrawTool } from '@/core/fsm/editorMachine';
import type { MapElementType } from '@/core/elements';
import { MAP_ELEMENTS, ALL_DRAW_TOOLS, ELEMENT_MAP } from '@/core/elements';
import type { BoundaryLineType } from '@/types/apollo';
import { useUIStore } from '@/store/uiStore';
import { boundaryTypeOptions } from '@/lib/schemas';
import {
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
      <Icon className="size-4" />
    </button>
  );
}

// ─── Divider ───────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-5 bg-ams-border-strong mx-1 shrink-0" />;
}

function boundarySwatchClass(type: BoundaryLineType): string {
  if (type.includes('YELLOW')) return 'border-amber-300';
  if (type === 'CURB') return 'border-zinc-400';
  if (type === 'UNKNOWN') return 'border-zinc-500';
  return 'border-white';
}

function boundarySwatchStyle(type: BoundaryLineType): React.CSSProperties {
  if (type.startsWith('DOTTED')) return { borderTopStyle: 'dotted' };
  if (type === 'DOUBLE_YELLOW') return { boxShadow: '0 4px 0 rgb(252 211 77)' };
  return {};
}

function BoundaryBrushPalette() {
  const selectedType = useUIStore((s) => s.boundaryBrush.type);
  const setType = useUIStore((s) => s.setBoundaryBrushType);

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {boundaryTypeOptions.map((type) => (
        <button
          key={type}
          type="button"
          title={type}
          onClick={() => setType(type)}
          className={clsx(
            'size-7 rounded flex items-center justify-center transition-all',
            selectedType === type
              ? 'bg-ams-surface-active text-ams-text-primary'
              : 'text-ams-text-secondary hover:text-ams-text-primary hover:bg-ams-surface-hover',
          )}
        >
          <span
            className={clsx('block w-4 border-t-2', boundarySwatchClass(type))}
            style={boundarySwatchStyle(type)}
          />
        </button>
      ))}
    </div>
  );
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
              'size-7 flex items-center justify-center rounded text-xs transition-all shrink-0',
              active
                ? 'bg-ams-surface-active'
                : 'text-ams-text-secondary hover:text-ams-text-primary hover:bg-ams-surface-hover',
            )}
            style={active ? { color: el.color } : undefined}
          >
            <Icon className="size-4" />
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
  const connectModeActive = useUIStore((s) => s.connectMode.active);
  const boundaryBrushActive = useUIStore((s) => s.boundaryBrush.active);
  const elementSubtoolsVisible = !connectModeActive && !boundaryBrushActive;

  return (
    <div className="h-9 bg-ams-bg-base border-b border-ams-border-subtle flex items-center px-2 gap-1 shrink-0">
      <ModeActionButtons getToggleState={getToggleState} onExecuteAction={onExecuteAction} />

      <Divider />

      {elementSubtoolsVisible && (
        <MapElementSubtools
          currentTool={currentTool}
          currentElement={currentElement}
          elementLabel={elementDef?.label ?? ''}
          tools={elementDef ? ALL_DRAW_TOOLS.filter((t) => elementDef.tools.includes(t.tool)) : []}
          onSelectTool={onSelectTool}
        />
      )}

      {boundaryBrushActive && <BoundaryBrushPalette />}

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
  const actions = getToolStripSlotActions('selection');
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
    </>
  );
}

interface MapElementSubtoolsProps {
  currentTool: string;
  currentElement: MapElementType | null;
  elementLabel: string;
  tools: typeof ALL_DRAW_TOOLS;
  onSelectTool: (tool: DrawTool, element?: MapElementType) => void;
}

function MapElementSubtools({
  currentTool,
  currentElement,
  elementLabel,
  tools,
  onSelectTool,
}: MapElementSubtoolsProps) {
  return (
    <>
      <ElementBar
        currentElement={currentElement}
        onSelect={(type) => onSelectTool(ELEMENT_MAP.get(type)!.defaultTool, type)}
      />

      <DrawToolButtons
        currentTool={currentTool}
        currentElement={currentElement}
        elementLabel={elementLabel}
        tools={tools}
        onSelectTool={onSelectTool}
      />
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
      <FaTerminal className="size-3.5" />
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
