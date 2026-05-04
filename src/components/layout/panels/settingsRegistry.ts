import type { IconType } from 'react-icons';
import { FaGear, FaLocationCrosshairs, FaMap, FaRoad } from 'react-icons/fa6';
import { clearAllSavedLayouts } from '@/components/layout/WorkspaceLayout/dockviewLayout';
import {
  MAX_HISTORY_LIMIT,
  MAX_LANE_ARROW_SPACING,
  MAX_LANE_HALF_WIDTH,
  MAX_MAP_CENTER_LAT,
  MAX_MAP_CENTER_LNG,
  MAX_MAP_ZOOM,
  MIN_HISTORY_LIMIT,
  MIN_LANE_ARROW_SPACING,
  MIN_LANE_HALF_WIDTH,
  MIN_MAP_CENTER_LAT,
  MIN_MAP_CENTER_LNG,
  MIN_MAP_ZOOM,
  type SettingsActions,
  type SettingsState,
} from '@/store/settingsStore';

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

export type SettingsEntryDef = NumberSettingEntryDef | ActionSettingEntryDef;

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

function formatNumber(value: number): string {
  return String(value);
}

function resetWorkspaceLayout() {
  try {
    clearAllSavedLayouts();
  } catch {
    /* ignore */
  }
  window.location.reload();
}

registerSettingsTab({
  id: 'general',
  label: 'General',
  icon: FaGear,
  sections: [
    {
      id: 'undo',
      title: 'Undo History',
      note: 'Applies after restart',
      entries: [
        {
          kind: 'number',
          id: 'historyLimit',
          label: 'History limit',
          min: MIN_HISTORY_LIMIT,
          max: MAX_HISTORY_LIMIT,
          value: (settings) => settings.historyLimit,
          commit: (settings, value) => settings.setHistoryLimit(value),
        },
      ],
    },
    {
      id: 'layout',
      title: 'Layout',
      entries: [
        {
          kind: 'action',
          id: 'resetWorkspaceLayout',
          label: 'Reset Layout to Default',
          run: resetWorkspaceLayout,
        },
      ],
    },
  ],
});

registerSettingsTab({
  id: 'map',
  label: 'Map',
  icon: FaMap,
  sections: [
    {
      id: 'viewport',
      title: 'Initial Viewport',
      note: 'Applies after restart',
      entries: [
        {
          kind: 'number',
          id: 'mapCenterLng',
          label: 'Longitude',
          min: MIN_MAP_CENTER_LNG,
          max: MAX_MAP_CENTER_LNG,
          value: (settings) => settings.mapCenterLng,
          commit: (settings, value) => settings.setMapCenter(value, settings.mapCenterLat),
          format: formatNumber,
        },
        {
          kind: 'number',
          id: 'mapCenterLat',
          label: 'Latitude',
          min: MIN_MAP_CENTER_LAT,
          max: MAX_MAP_CENTER_LAT,
          value: (settings) => settings.mapCenterLat,
          commit: (settings, value) => settings.setMapCenter(settings.mapCenterLng, value),
          format: formatNumber,
        },
        {
          kind: 'number',
          id: 'mapZoom',
          label: 'Zoom',
          min: MIN_MAP_ZOOM,
          max: MAX_MAP_ZOOM,
          value: (settings) => settings.mapZoom,
          commit: (settings, value) => settings.setMapZoom(value),
          format: formatNumber,
        },
      ],
    },
  ],
});

registerSettingsTab({
  id: 'editing',
  label: 'Editing',
  icon: FaRoad,
  sections: [
    {
      id: 'lane',
      title: 'Lane Defaults',
      entries: [
        {
          kind: 'number',
          id: 'laneHalfWidth',
          label: 'Default half-width (m)',
          min: MIN_LANE_HALF_WIDTH,
          max: MAX_LANE_HALF_WIDTH,
          step: 0.25,
          value: (settings) => settings.laneHalfWidth,
          commit: (settings, value) => settings.setLaneHalfWidth(value),
          format: formatNumber,
        },
      ],
    },
  ],
});

registerSettingsTab({
  id: 'rendering',
  label: 'Rendering',
  icon: FaLocationCrosshairs,
  sections: [
    {
      id: 'lane-symbols',
      title: 'Lane Symbols',
      entries: [
        {
          kind: 'number',
          id: 'laneArrowSpacing',
          label: 'Arrow spacing (px)',
          min: MIN_LANE_ARROW_SPACING,
          max: MAX_LANE_ARROW_SPACING,
          step: 10,
          value: (settings) => settings.laneArrowSpacing,
          commit: (settings, value) => settings.setLaneArrowSpacing(value),
        },
      ],
    },
  ],
});
