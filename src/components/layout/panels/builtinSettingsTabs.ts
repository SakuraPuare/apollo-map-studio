import { FaGear, FaLocationCrosshairs, FaMap, FaRoad } from 'react-icons/fa6';
import { clearAllSavedLayouts } from '@/components/layout/WorkspaceLayout/dockviewLayout';
import { getEnumLabel } from '@/lib/enumLabels';
import {
  LANE_BOUNDARY_TYPE_OPTIONS,
  MAX_CLICK_THRESHOLD,
  MAX_HIT_BBOX_PADDING,
  MAX_HIT_TEST_RADIUS,
  MAX_HISTORY_LIMIT,
  MAX_LANE_ARROW_SIZE,
  MAX_LANE_ARROW_SPACING,
  MAX_LANE_HALF_WIDTH,
  MAX_LANE_LINE_WIDTH,
  MAX_LANE_SPEED_LIMIT,
  MAX_MAP_CENTER_LAT,
  MAX_MAP_CENTER_LNG,
  MAX_MAP_ZOOM,
  MAX_OPACITY,
  MAX_SNAP_RADIUS,
  MIN_CLICK_THRESHOLD,
  MIN_HIT_BBOX_PADDING,
  MIN_HIT_TEST_RADIUS,
  MIN_HISTORY_LIMIT,
  MIN_LANE_ARROW_SIZE,
  MIN_LANE_ARROW_SPACING,
  MIN_LANE_HALF_WIDTH,
  MIN_LANE_LINE_WIDTH,
  MIN_LANE_SPEED_LIMIT,
  MIN_MAP_CENTER_LAT,
  MIN_MAP_CENTER_LNG,
  MIN_MAP_ZOOM,
  MIN_OPACITY,
  MIN_SNAP_RADIUS,
  type SettingsActions,
  type SettingsState,
} from '@/store/settingsStore';
import { useUIStore } from '@/store/uiStore';
import type { BoundaryLineType } from '@/types/apollo';
import { registerSettingsTab, type SettingsStoreSnapshot } from './settingsRegistry';

let registered = false;

function formatNumber(value: number): string {
  return String(value);
}

function formatMpsAsKph(value: number): string {
  return String(Math.round(value * 3.6));
}

function commitKphAsMps(settings: SettingsStoreSnapshot, value: number) {
  settings.setLaneSpeedLimit(value / 3.6);
}

function resetWorkspaceLayout() {
  try {
    clearAllSavedLayouts();
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export function registerBuiltinSettingsTabs(): void {
  if (registered) return;
  registered = true;
  registerGeneralSettingsTab();
  registerMapSettingsTab();
  registerEditingSettingsTab();
  registerRenderingSettingsTab();
}

function registerGeneralSettingsTab() {
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
}

function registerMapSettingsTab() {
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
      {
        id: 'map-tools',
        title: 'Map Tools',
        entries: [
          {
            kind: 'boolean',
            id: 'gridEnabled',
            label: 'Grid enabled by default',
            value: (settings) => settings.gridEnabled,
            commit: (_settings, value) => useUIStore.getState().setGridEnabled(value),
          },
          {
            kind: 'boolean',
            id: 'snapEnabled',
            label: 'Snap enabled by default',
            value: (settings) => settings.snapEnabled,
            commit: (_settings, value) => useUIStore.getState().setSnapEnabled(value),
          },
        ],
      },
    ],
  });
}

function registerEditingSettingsTab() {
  registerSettingsTab({
    id: 'editing',
    label: 'Editing',
    icon: FaRoad,
    sections: [
      laneDefaultsSection(),
      {
        id: 'interaction',
        title: 'Interaction Tolerances',
        entries: interactionEntries(),
      },
    ],
  });
}

function laneDefaultsSection() {
  return {
    id: 'lane',
    title: 'Lane Defaults',
    entries: [
      {
        kind: 'number' as const,
        id: 'laneHalfWidth',
        label: 'Default half-width (m)',
        min: MIN_LANE_HALF_WIDTH,
        max: MAX_LANE_HALF_WIDTH,
        step: 0.25,
        value: (settings: SettingsState & SettingsActions) => settings.laneHalfWidth,
        commit: (settings: SettingsState & SettingsActions, value: number) =>
          settings.setLaneHalfWidth(value),
        format: formatNumber,
      },
      {
        kind: 'number' as const,
        id: 'laneSpeedLimit',
        label: 'Default speed limit (km/h)',
        min: MIN_LANE_SPEED_LIMIT * 3.6,
        max: MAX_LANE_SPEED_LIMIT * 3.6,
        step: 5,
        value: (settings: SettingsState & SettingsActions) => settings.laneSpeedLimit * 3.6,
        commit: commitKphAsMps,
        format: formatMpsAsKph,
      },
      {
        kind: 'select' as const,
        id: 'laneBoundaryType',
        label: 'Default boundary type',
        options: LANE_BOUNDARY_TYPE_OPTIONS.map((value) => ({
          value,
          label: getEnumLabel('boundaryType', value),
        })),
        value: (settings: SettingsState & SettingsActions) => settings.laneBoundaryType,
        commit: (settings: SettingsState & SettingsActions, value: string) =>
          settings.setLaneBoundaryType(value as BoundaryLineType),
      },
    ],
  };
}

function interactionEntries() {
  return [
    {
      kind: 'number' as const,
      id: 'snapRadius',
      label: 'Snap radius (px)',
      min: MIN_SNAP_RADIUS,
      max: MAX_SNAP_RADIUS,
      value: (settings: SettingsState & SettingsActions) => settings.snapRadius,
      commit: (settings: SettingsState & SettingsActions, value: number) =>
        settings.setSnapRadius(value),
    },
    {
      kind: 'number' as const,
      id: 'clickThreshold',
      label: 'Click drag threshold (px)',
      min: MIN_CLICK_THRESHOLD,
      max: MAX_CLICK_THRESHOLD,
      value: (settings: SettingsState & SettingsActions) => settings.clickThreshold,
      commit: (settings: SettingsState & SettingsActions, value: number) =>
        settings.setClickThreshold(value),
    },
    {
      kind: 'number' as const,
      id: 'hitBboxPadding',
      label: 'Handle pick padding (px)',
      min: MIN_HIT_BBOX_PADDING,
      max: MAX_HIT_BBOX_PADDING,
      value: (settings: SettingsState & SettingsActions) => settings.hitBboxPadding,
      commit: (settings: SettingsState & SettingsActions, value: number) =>
        settings.setHitBboxPadding(value),
    },
    {
      kind: 'number' as const,
      id: 'hitTestRadius',
      label: 'Entity hit radius (px)',
      min: MIN_HIT_TEST_RADIUS,
      max: MAX_HIT_TEST_RADIUS,
      value: (settings: SettingsState & SettingsActions) => settings.hitTestRadius,
      commit: (settings: SettingsState & SettingsActions, value: number) =>
        settings.setHitTestRadius(value),
    },
  ];
}

function registerRenderingSettingsTab() {
  registerSettingsTab({
    id: 'rendering',
    label: 'Rendering',
    icon: FaLocationCrosshairs,
    sections: [
      {
        id: 'lane-symbols',
        title: 'Lane Symbols',
        entries: laneSymbolEntries(),
      },
      {
        id: 'lane-visuals',
        title: 'Lane Geometry',
        entries: laneVisualEntries(),
      },
    ],
  });
}

function laneSymbolEntries() {
  return [
    {
      kind: 'number' as const,
      id: 'laneArrowSize',
      label: 'Arrow size (px)',
      min: MIN_LANE_ARROW_SIZE,
      max: MAX_LANE_ARROW_SIZE,
      value: (settings: SettingsState & SettingsActions) => settings.laneArrowSize,
      commit: (settings: SettingsState & SettingsActions, value: number) =>
        settings.setLaneArrowSize(value),
      format: formatNumber,
    },
    {
      kind: 'number' as const,
      id: 'laneArrowSpacing',
      label: 'Arrow spacing (px)',
      min: MIN_LANE_ARROW_SPACING,
      max: MAX_LANE_ARROW_SPACING,
      step: 10,
      value: (settings: SettingsState & SettingsActions) => settings.laneArrowSpacing,
      commit: (settings: SettingsState & SettingsActions, value: number) =>
        settings.setLaneArrowSpacing(value),
    },
    {
      kind: 'number' as const,
      id: 'laneArrowOpacity',
      label: 'Arrow opacity',
      min: MIN_OPACITY,
      max: MAX_OPACITY,
      step: 0.05,
      value: (settings: SettingsState & SettingsActions) => settings.laneArrowOpacity,
      commit: (settings: SettingsState & SettingsActions, value: number) =>
        settings.setLaneArrowOpacity(value),
      format: formatNumber,
    },
  ];
}

function laneVisualEntries() {
  return [
    renderNumber('laneFillOpacity', 'Fill opacity', MIN_OPACITY, MAX_OPACITY, 0.05),
    renderNumber(
      'laneEdgeLineWidth',
      'Edge line width (px)',
      MIN_LANE_LINE_WIDTH,
      MAX_LANE_LINE_WIDTH,
      0.25,
    ),
    renderNumber('laneEdgeLineOpacity', 'Edge line opacity', MIN_OPACITY, MAX_OPACITY, 0.05),
    renderNumber(
      'laneCenterLineWidth',
      'Center line width (px)',
      MIN_LANE_LINE_WIDTH,
      MAX_LANE_LINE_WIDTH,
      0.25,
    ),
    renderNumber('laneCenterLineOpacity', 'Center line opacity', MIN_OPACITY, MAX_OPACITY, 0.05),
  ];
}

function renderNumber(
  id:
    | 'laneFillOpacity'
    | 'laneEdgeLineWidth'
    | 'laneEdgeLineOpacity'
    | 'laneCenterLineWidth'
    | 'laneCenterLineOpacity',
  label: string,
  min: number,
  max: number,
  step: number,
) {
  const setter = {
    laneFillOpacity: 'setLaneFillOpacity',
    laneEdgeLineWidth: 'setLaneEdgeLineWidth',
    laneEdgeLineOpacity: 'setLaneEdgeLineOpacity',
    laneCenterLineWidth: 'setLaneCenterLineWidth',
    laneCenterLineOpacity: 'setLaneCenterLineOpacity',
  } as const;
  return {
    kind: 'number' as const,
    id,
    label,
    min,
    max,
    step,
    value: (settings: SettingsState & SettingsActions) => settings[id],
    commit: (settings: SettingsState & SettingsActions, value: number) =>
      settings[setter[id]](value),
    format: formatNumber,
  };
}
