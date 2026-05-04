import { create, type StateCreator } from 'zustand';
import type { BoundaryLineType } from '@/types/apollo';
import {
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
  SETTINGS_STORAGE_KEYS,
  clampSettingNumber,
  coerceLaneBoundaryType,
  persistSetting,
  readClickThreshold,
  readGridEnabled,
  readHistoryLimit,
  readHitBboxPadding,
  readHitTestRadius,
  readLaneArrowOpacity,
  readLaneArrowSpacing,
  readLaneArrowSize,
  readLaneBoundaryType,
  readLaneCenterLineOpacity,
  readLaneCenterLineWidth,
  readLaneEdgeLineOpacity,
  readLaneEdgeLineWidth,
  readLaneFillOpacity,
  readLaneHalfWidth,
  readLaneSpeedLimit,
  readMapCenter,
  readMapZoom,
  readSnapEnabled,
  readSnapRadius,
} from './settingsPersistence';

export * from './settingsPersistence';

// ─── Store ────────────────────────────────────────────────────────────────────

export interface SettingsState {
  historyLimit: number;
  mapCenterLng: number;
  mapCenterLat: number;
  mapZoom: number;
  gridEnabled: boolean;
  snapEnabled: boolean;
  laneHalfWidth: number;
  laneArrowSpacing: number;
  laneSpeedLimit: number;
  laneBoundaryType: BoundaryLineType;
  snapRadius: number;
  clickThreshold: number;
  hitBboxPadding: number;
  hitTestRadius: number;
  laneFillOpacity: number;
  laneEdgeLineWidth: number;
  laneEdgeLineOpacity: number;
  laneCenterLineWidth: number;
  laneCenterLineOpacity: number;
  laneArrowSize: number;
  laneArrowOpacity: number;
}

export interface SettingsActions {
  setHistoryLimit(value: number): void;
  setMapCenter(lng: number, lat: number): void;
  setMapZoom(value: number): void;
  setGridEnabled(value: boolean): void;
  setSnapEnabled(value: boolean): void;
  setLaneHalfWidth(value: number): void;
  setLaneArrowSpacing(value: number): void;
  setLaneSpeedLimit(value: number): void;
  setLaneBoundaryType(value: BoundaryLineType): void;
  setSnapRadius(value: number): void;
  setClickThreshold(value: number): void;
  setHitBboxPadding(value: number): void;
  setHitTestRadius(value: number): void;
  setLaneFillOpacity(value: number): void;
  setLaneEdgeLineWidth(value: number): void;
  setLaneEdgeLineOpacity(value: number): void;
  setLaneCenterLineWidth(value: number): void;
  setLaneCenterLineOpacity(value: number): void;
  setLaneArrowSize(value: number): void;
  setLaneArrowOpacity(value: number): void;
}

type SettingsStore = SettingsState & SettingsActions;
type SettingsSet = Parameters<StateCreator<SettingsStore>>[0];

function createInitialSettingsState(): SettingsState {
  const [lng, lat] = readMapCenter();
  return {
    historyLimit: readHistoryLimit(),
    mapCenterLng: lng,
    mapCenterLat: lat,
    mapZoom: readMapZoom(),
    gridEnabled: readGridEnabled(),
    snapEnabled: readSnapEnabled(),
    laneHalfWidth: readLaneHalfWidth(),
    laneArrowSpacing: readLaneArrowSpacing(),
    laneSpeedLimit: readLaneSpeedLimit(),
    laneBoundaryType: readLaneBoundaryType(),
    snapRadius: readSnapRadius(),
    clickThreshold: readClickThreshold(),
    hitBboxPadding: readHitBboxPadding(),
    hitTestRadius: readHitTestRadius(),
    laneFillOpacity: readLaneFillOpacity(),
    laneEdgeLineWidth: readLaneEdgeLineWidth(),
    laneEdgeLineOpacity: readLaneEdgeLineOpacity(),
    laneCenterLineWidth: readLaneCenterLineWidth(),
    laneCenterLineOpacity: readLaneCenterLineOpacity(),
    laneArrowSize: readLaneArrowSize(),
    laneArrowOpacity: readLaneArrowOpacity(),
  };
}

function createGeneralSettingsActions(
  set: SettingsSet,
): Pick<
  SettingsActions,
  'setHistoryLimit' | 'setMapCenter' | 'setMapZoom' | 'setGridEnabled' | 'setSnapEnabled'
> {
  return {
    setHistoryLimit(value) {
      const v = clampSettingNumber(Math.round(value), MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
      set({ historyLimit: v });
      persistSetting(SETTINGS_STORAGE_KEYS.historyLimit, v);
    },
    setMapCenter(lng, lat) {
      const lo = clampSettingNumber(lng, MIN_MAP_CENTER_LNG, MAX_MAP_CENTER_LNG);
      const la = clampSettingNumber(lat, MIN_MAP_CENTER_LAT, MAX_MAP_CENTER_LAT);
      set({ mapCenterLng: lo, mapCenterLat: la });
      persistSetting(SETTINGS_STORAGE_KEYS.mapCenterLng, lo);
      persistSetting(SETTINGS_STORAGE_KEYS.mapCenterLat, la);
    },
    setMapZoom(value) {
      const v = clampSettingNumber(value, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
      set({ mapZoom: v });
      persistSetting(SETTINGS_STORAGE_KEYS.mapZoom, v);
    },
    setGridEnabled(value) {
      set({ gridEnabled: value });
      persistSetting(SETTINGS_STORAGE_KEYS.gridEnabled, value);
    },
    setSnapEnabled(value) {
      set({ snapEnabled: value });
      persistSetting(SETTINGS_STORAGE_KEYS.snapEnabled, value);
    },
  };
}

function createLaneDefaultSettingsActions(
  set: SettingsSet,
): Pick<SettingsActions, 'setLaneHalfWidth' | 'setLaneSpeedLimit' | 'setLaneBoundaryType'> {
  return {
    setLaneHalfWidth(value) {
      const v = clampSettingNumber(value, MIN_LANE_HALF_WIDTH, MAX_LANE_HALF_WIDTH);
      set({ laneHalfWidth: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneHalfWidth, v);
    },
    setLaneSpeedLimit(value) {
      const v = clampSettingNumber(value, MIN_LANE_SPEED_LIMIT, MAX_LANE_SPEED_LIMIT);
      set({ laneSpeedLimit: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneSpeedLimit, v);
    },
    setLaneBoundaryType(value) {
      const v = coerceLaneBoundaryType(value);
      set({ laneBoundaryType: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneBoundaryType, v);
    },
  };
}

function createInteractionSettingsActions(
  set: SettingsSet,
): Pick<
  SettingsActions,
  'setSnapRadius' | 'setClickThreshold' | 'setHitBboxPadding' | 'setHitTestRadius'
> {
  return {
    setSnapRadius(value) {
      const v = clampSettingNumber(Math.round(value), MIN_SNAP_RADIUS, MAX_SNAP_RADIUS);
      set({ snapRadius: v });
      persistSetting(SETTINGS_STORAGE_KEYS.snapRadius, v);
    },
    setClickThreshold(value) {
      const v = clampSettingNumber(Math.round(value), MIN_CLICK_THRESHOLD, MAX_CLICK_THRESHOLD);
      set({ clickThreshold: v });
      persistSetting(SETTINGS_STORAGE_KEYS.clickThreshold, v);
    },
    setHitBboxPadding(value) {
      const v = clampSettingNumber(Math.round(value), MIN_HIT_BBOX_PADDING, MAX_HIT_BBOX_PADDING);
      set({ hitBboxPadding: v });
      persistSetting(SETTINGS_STORAGE_KEYS.hitBboxPadding, v);
    },
    setHitTestRadius(value) {
      const v = clampSettingNumber(Math.round(value), MIN_HIT_TEST_RADIUS, MAX_HIT_TEST_RADIUS);
      set({ hitTestRadius: v });
      persistSetting(SETTINGS_STORAGE_KEYS.hitTestRadius, v);
    },
  };
}

function createLaneRenderSettingsActions(
  set: SettingsSet,
): Pick<
  SettingsActions,
  | 'setLaneArrowSpacing'
  | 'setLaneFillOpacity'
  | 'setLaneEdgeLineWidth'
  | 'setLaneEdgeLineOpacity'
  | 'setLaneCenterLineWidth'
  | 'setLaneCenterLineOpacity'
  | 'setLaneArrowSize'
  | 'setLaneArrowOpacity'
> {
  return {
    setLaneArrowSpacing(value) {
      const v = clampSettingNumber(
        Math.round(value),
        MIN_LANE_ARROW_SPACING,
        MAX_LANE_ARROW_SPACING,
      );
      set({ laneArrowSpacing: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneArrowSpacing, v);
    },
    setLaneFillOpacity(value) {
      const v = clampSettingNumber(value, MIN_OPACITY, MAX_OPACITY);
      set({ laneFillOpacity: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneFillOpacity, v);
    },
    setLaneEdgeLineWidth(value) {
      const v = clampSettingNumber(value, MIN_LANE_LINE_WIDTH, MAX_LANE_LINE_WIDTH);
      set({ laneEdgeLineWidth: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneEdgeLineWidth, v);
    },
    setLaneEdgeLineOpacity(value) {
      const v = clampSettingNumber(value, MIN_OPACITY, MAX_OPACITY);
      set({ laneEdgeLineOpacity: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneEdgeLineOpacity, v);
    },
    setLaneCenterLineWidth(value) {
      const v = clampSettingNumber(value, MIN_LANE_LINE_WIDTH, MAX_LANE_LINE_WIDTH);
      set({ laneCenterLineWidth: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneCenterLineWidth, v);
    },
    setLaneCenterLineOpacity(value) {
      const v = clampSettingNumber(value, MIN_OPACITY, MAX_OPACITY);
      set({ laneCenterLineOpacity: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneCenterLineOpacity, v);
    },
    setLaneArrowSize(value) {
      const v = clampSettingNumber(value, MIN_LANE_ARROW_SIZE, MAX_LANE_ARROW_SIZE);
      set({ laneArrowSize: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneArrowSize, v);
    },
    setLaneArrowOpacity(value) {
      const v = clampSettingNumber(value, MIN_OPACITY, MAX_OPACITY);
      set({ laneArrowOpacity: v });
      persistSetting(SETTINGS_STORAGE_KEYS.laneArrowOpacity, v);
    },
  };
}

export const useSettingsStore = create<SettingsStore>()((set) => ({
  ...createInitialSettingsState(),
  ...createGeneralSettingsActions(set),
  ...createLaneDefaultSettingsActions(set),
  ...createInteractionSettingsActions(set),
  ...createLaneRenderSettingsActions(set),
}));
