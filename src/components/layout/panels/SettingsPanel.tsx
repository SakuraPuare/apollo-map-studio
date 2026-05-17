import { useEffect, useMemo, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/settingsStore';
import { registerBuiltinSettingsTabs } from './builtinSettingsTabs';
import {
  getSettingsTabs,
  type ActionSettingEntryDef,
  type BooleanSettingEntryDef,
  type NumberSettingEntryDef,
  type SelectSettingEntryDef,
  type SettingsEntryDef,
  type SettingsSectionDef,
  type SettingsTabDef,
} from './settingsRegistry';

registerBuiltinSettingsTabs();

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

function formatDraft(entry: NumberSettingEntryDef, value: number): string {
  return entry.format?.(value) ?? String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDraftKey(entry: NumberSettingEntryDef): string {
  return entry.id;
}

function buildInitialDrafts(
  tabs: readonly SettingsTabDef[],
  settings: ReturnType<typeof useSettingsStore.getState>,
) {
  const drafts: Record<string, string> = {};
  for (const tab of tabs) {
    for (const section of tab.sections) {
      for (const entry of section.entries) {
        if (entry.kind !== 'number') continue;
        drafts[getDraftKey(entry)] = formatDraft(entry, entry.value(settings));
      }
    }
  }
  return drafts;
}

function NumInput({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  onCommit,
  onReset,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  onReset: () => void;
}) {
  const commit = () => {
    const n = Number(value);
    if (Number.isFinite(n)) onCommit(clamp(n, min, max));
    else onReset();
  };

  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
      className="h-7 w-full rounded border border-white/10 bg-zinc-800/50 px-2 text-xs text-zinc-200 outline-none transition-colors focus:border-cyan-500/50"
    />
  );
}

function TabButton({
  tab,
  active,
  onSelect,
}: {
  tab: SettingsTabDef;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded px-3 text-left text-xs transition-colors',
        active
          ? 'bg-cyan-500/15 text-cyan-200'
          : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{tab.label}</span>
    </button>
  );
}

function SettingsSection({
  section,
  drafts,
  setDraft,
  settings,
}: {
  section: SettingsSectionDef;
  drafts: Record<string, string>;
  setDraft: (key: string, value: string) => void;
  settings: ReturnType<typeof useSettingsStore.getState>;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {section.title}
        </h3>
        {section.note && <span className="text-[10px] text-zinc-600">{section.note}</span>}
      </div>
      <div className="space-y-3">{section.entries.map((entry) => renderEntry(entry))}</div>
    </section>
  );

  function renderEntry(entry: SettingsEntryDef) {
    if (entry.kind === 'number') {
      return (
        <NumberSetting
          key={entry.id}
          entry={entry}
          draftValue={drafts[getDraftKey(entry)] ?? formatDraft(entry, entry.value(settings))}
          setDraft={setDraft}
          settings={settings}
        />
      );
    }
    if (entry.kind === 'boolean') {
      return <BooleanSetting key={entry.id} entry={entry} settings={settings} />;
    }
    if (entry.kind === 'select') {
      return <SelectSetting key={entry.id} entry={entry} settings={settings} />;
    }
    return <ActionSetting key={entry.id} entry={entry} />;
  }
}

function NumberSetting({
  entry,
  draftValue,
  setDraft,
  settings,
}: {
  entry: NumberSettingEntryDef;
  draftValue: string;
  setDraft: (key: string, value: string) => void;
  settings: ReturnType<typeof useSettingsStore.getState>;
}) {
  const draftKey = getDraftKey(entry);
  const currentValue = entry.value(settings);
  const rangeLabel = entry.rangeLabel ?? `Range: ${entry.min}-${entry.max}`;

  return (
    <div className="grid grid-cols-[minmax(7rem,0.9fr)_minmax(8rem,1fr)] items-start gap-3">
      <label htmlFor={`setting-${entry.id}`} className="pt-1.5 text-xs text-zinc-400">
        {entry.label}
      </label>
      <div>
        <NumInput
          id={`setting-${entry.id}`}
          value={draftValue}
          onChange={(value) => setDraft(draftKey, value)}
          min={entry.min}
          max={entry.max}
          step={entry.step}
          onCommit={(value) => {
            entry.commit(settings, value);
            const nextSettings = useSettingsStore.getState();
            setDraft(draftKey, formatDraft(entry, entry.value(nextSettings)));
          }}
          onReset={() => setDraft(draftKey, formatDraft(entry, currentValue))}
        />
        <p className="mt-1 text-[10px] text-zinc-600">{rangeLabel}</p>
      </div>
    </div>
  );
}

function BooleanSetting({
  entry,
  settings,
}: {
  entry: BooleanSettingEntryDef;
  settings: ReturnType<typeof useSettingsStore.getState>;
}) {
  const checked = entry.value(settings);
  return (
    <div className="grid grid-cols-[minmax(7rem,0.9fr)_minmax(8rem,1fr)] items-center gap-3">
      <label htmlFor={`setting-${entry.id}`} className="text-xs text-zinc-400">
        {entry.label}
      </label>
      <input
        id={`setting-${entry.id}`}
        type="checkbox"
        checked={checked}
        onChange={(event) => entry.commit(settings, event.target.checked)}
        className="size-4 accent-cyan-500"
      />
    </div>
  );
}

function SelectSetting({
  entry,
  settings,
}: {
  entry: SelectSettingEntryDef;
  settings: ReturnType<typeof useSettingsStore.getState>;
}) {
  return (
    <div className="grid grid-cols-[minmax(7rem,0.9fr)_minmax(8rem,1fr)] items-start gap-3">
      <label htmlFor={`setting-${entry.id}`} className="pt-1.5 text-xs text-zinc-400">
        {entry.label}
      </label>
      <select
        id={`setting-${entry.id}`}
        value={entry.value(settings)}
        onChange={(event) => entry.commit(settings, event.target.value)}
        className="h-7 w-full rounded border border-white/10 bg-zinc-800/50 px-2 text-xs text-zinc-200 outline-none transition-colors focus:border-cyan-500/50"
      >
        {entry.options.map((option) => (
          <option key={option.value} value={option.value} className="bg-zinc-900">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ActionSetting({ entry }: { entry: ActionSettingEntryDef }) {
  return (
    <button
      type="button"
      onClick={entry.run}
      className={cn(
        'rounded border px-3 py-1.5 text-xs transition-colors',
        entry.tone === 'danger'
          ? 'border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/15'
          : 'border-white/10 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200',
      )}
    >
      {entry.label}
    </button>
  );
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const tabs = useMemo(() => getSettingsTabs(), []);
  const settings = useSettingsStore();
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    buildInitialDrafts(tabs, settings),
  );

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    if (!open) return;
    setDrafts(buildInitialDrafts(tabs, useSettingsStore.getState()));
  }, [open, tabs]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !activeTab) return null;

  const setDraft = (key: string, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        role="button"
        tabIndex={-1}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClose();
        }}
        aria-label="Close settings"
      />
      <div className="relative grid h-[min(34rem,82vh)] w-[min(44rem,calc(100vw-2rem))] grid-cols-[10rem_minmax(0,1fr)] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
        <aside className="border-r border-white/10 bg-zinc-950/40 px-2 py-3">
          <div className="mb-3 px-2 text-sm font-medium text-zinc-200">Settings</div>
          <div className="space-y-1">
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                active={tab.id === activeTab.id}
                onSelect={() => setActiveTabId(tab.id)}
              />
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex h-12 items-center justify-between border-b border-white/10 px-5">
            <div>
              <h2 className="text-sm font-medium text-zinc-200">{activeTab.label}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-300"
              aria-label="Close settings"
            >
              <FaXmark className="size-4" />
            </button>
          </div>

          <ScrollArea className="h-[calc(min(34rem,82vh)-3rem)]" viewportClassName="px-5 py-4">
            <div className="space-y-6">
              {activeTab.sections.map((section) => (
                <SettingsSection
                  key={section.id}
                  section={section}
                  drafts={drafts}
                  setDraft={setDraft}
                  settings={settings}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
