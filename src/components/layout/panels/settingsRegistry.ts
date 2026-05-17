import type { IconType } from 'react-icons';
import type { SettingsActions, SettingsState } from '@/store/settingsStore';

export type SettingsStoreSnapshot = SettingsState & SettingsActions;

export interface SettingsTabDef {
  id: string;
  label: string;
  icon: IconType;
  sections: readonly SettingsSectionDef[];
}

export interface SettingsSectionDef {
  id: string;
  title: string;
  note?: string;
  entries: readonly SettingsEntryDef[];
}

export type SettingsEntryDef =
  | NumberSettingEntryDef
  | BooleanSettingEntryDef
  | SelectSettingEntryDef
  | ActionSettingEntryDef;

export interface NumberSettingEntryDef {
  kind: 'number';
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: (settings: SettingsStoreSnapshot) => number;
  commit: (settings: SettingsStoreSnapshot, value: number) => void;
  format?: (value: number) => string;
  rangeLabel?: string;
}

export interface BooleanSettingEntryDef {
  kind: 'boolean';
  id: string;
  label: string;
  value: (settings: SettingsStoreSnapshot) => boolean;
  commit: (settings: SettingsStoreSnapshot, value: boolean) => void;
}

export interface SelectSettingEntryDef {
  kind: 'select';
  id: string;
  label: string;
  options: readonly SelectOptionDef[];
  value: (settings: SettingsStoreSnapshot) => string;
  commit: (settings: SettingsStoreSnapshot, value: string) => void;
}

interface SelectOptionDef {
  value: string;
  label: string;
}

export interface ActionSettingEntryDef {
  kind: 'action';
  id: string;
  label: string;
  tone?: 'default' | 'danger';
  run: () => void;
}

const registry: SettingsTabDef[] = [];

export function registerSettingsTab(def: SettingsTabDef): void {
  const existingIndex = registry.findIndex((tab) => tab.id === def.id);
  if (existingIndex >= 0) {
    registry[existingIndex] = def;
    return;
  }
  registry.push(def);
}

export function getSettingsTabs(): readonly SettingsTabDef[] {
  return registry;
}
