import {
  CLICK_THRESHOLD_PX,
  DEFAULT_LANE_BOUNDARY_TYPE,
  DEFAULT_LANE_HALF_WIDTH,
  DEFAULT_LANE_SPEED_LIMIT_MPS,
  HIT_BBOX_PADDING_PX,
  HIT_TEST_RADIUS_PX,
  LANE_ARROW_OPACITY,
  LANE_ARROW_SYMBOL_SPACING,
  LANE_ARROW_TEXT_SIZE,
  LANE_CENTER_LINE_OPACITY,
  LANE_CENTER_LINE_WIDTH,
  LANE_EDGE_LINE_OPACITY,
  LANE_EDGE_LINE_WIDTH,
  LANE_FILL_OPACITY,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  SNAP_RADIUS_PX,
} from '@/config/mapConstants';
import type { BoundaryLineType } from '@/types/apollo';

export const SETTINGS_STORAGE_KEYS = {
  historyLimit: 'apollo-map-studio:historyLimit',
  mapCenterLng: 'apollo-map-studio:mapCenterLng',
  mapCenterLat: 'apollo-map-studio:mapCenterLat',
  mapZoom: 'apollo-map-studio:mapZoom',
  laneHalfWidth: 'apollo-map-studio:laneHalfWidth',
  laneArrowSpacing: 'apollo-map-studio:laneArrowSpacing',
  gridEnabled: 'apollo-map-studio:gridEnabled',
  snapEnabled: 'apollo-map-studio:snapEnabled',
  laneSpeedLimit: 'apollo-map-studio:laneSpeedLimit',
  laneBoundaryType: 'apollo-map-studio:laneBoundaryType',
  snapRadius: 'apollo-map-studio:snapRadius',
  clickThreshold: 'apollo-map-studio:clickThreshold',
  hitBboxPadding: 'apollo-map-studio:hitBboxPadding',
  hitTestRadius: 'apollo-map-studio:hitTestRadius',
  laneFillOpacity: 'apollo-map-studio:laneFillOpacity',
  laneEdgeLineWidth: 'apollo-map-studio:laneEdgeLineWidth',
  laneEdgeLineOpacity: 'apollo-map-studio:laneEdgeLineOpacity',
  laneCenterLineWidth: 'apollo-map-studio:laneCenterLineWidth',
  laneCenterLineOpacity: 'apollo-map-studio:laneCenterLineOpacity',
  laneArrowSize: 'apollo-map-studio:laneArrowSize',
  laneArrowOpacity: 'apollo-map-studio:laneArrowOpacity',
} as const;

export const DEFAULT_HISTORY_LIMIT = 100;
export const MIN_HISTORY_LIMIT = 10;
export const MAX_HISTORY_LIMIT = 1000;

export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 22;
export const MIN_MAP_CENTER_LNG = -180;
export const MAX_MAP_CENTER_LNG = 180;
export const MIN_MAP_CENTER_LAT = -90;
export const MAX_MAP_CENTER_LAT = 90;

export const MIN_LANE_HALF_WIDTH = 0.5;
export const MAX_LANE_HALF_WIDTH = 10;

export const MIN_LANE_ARROW_SPACING = 40;
export const MAX_LANE_ARROW_SPACING = 500;

export const MIN_LANE_SPEED_LIMIT = 0;
export const MAX_LANE_SPEED_LIMIT = 50;

export const LANE_BOUNDARY_TYPE_OPTIONS = [
  'DOTTED_WHITE',
  'SOLID_WHITE',
  'DOTTED_YELLOW',
  'SOLID_YELLOW',
  'DOUBLE_YELLOW',
  'CURB',
] as const satisfies readonly BoundaryLineType[];

type LaneBoundaryTypeOption = (typeof LANE_BOUNDARY_TYPE_OPTIONS)[number];

export const MIN_SNAP_RADIUS = 2;
export const MAX_SNAP_RADIUS = 64;

export const MIN_CLICK_THRESHOLD = 1;
export const MAX_CLICK_THRESHOLD = 32;

export const MIN_HIT_BBOX_PADDING = 1;
export const MAX_HIT_BBOX_PADDING = 48;

export const MIN_HIT_TEST_RADIUS = 1;
export const MAX_HIT_TEST_RADIUS = 64;

export const MIN_OPACITY = 0;
export const MAX_OPACITY = 1;

export const MIN_LANE_LINE_WIDTH = 0.25;
export const MAX_LANE_LINE_WIDTH = 8;

export const MIN_LANE_ARROW_SIZE = 4;
export const MAX_LANE_ARROW_SIZE = 32;

function readNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
    }
  } catch {
    /* SSR / private mode */
  }
  return fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* SSR / private mode */
  }
  return fallback;
}

function readEnum<T extends string>(key: string, fallback: T, options: readonly T[]): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null && options.includes(raw as T)) return raw as T;
  } catch {
    /* SSR / private mode */
  }
  return fallback;
}

export function persistSetting(key: string, value: number | boolean | string) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

export function clampSettingNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isLaneBoundaryTypeOption(value: BoundaryLineType): value is LaneBoundaryTypeOption {
  return (LANE_BOUNDARY_TYPE_OPTIONS as readonly BoundaryLineType[]).includes(value);
}

export function coerceLaneBoundaryType(value: BoundaryLineType): BoundaryLineType {
  return isLaneBoundaryTypeOption(value) ? value : DEFAULT_LANE_BOUNDARY_TYPE;
}

export function readHistoryLimit(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.historyLimit,
    DEFAULT_HISTORY_LIMIT,
    MIN_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT,
  );
}

export function readMapCenter(): [number, number] {
  const lng = readNum(
    SETTINGS_STORAGE_KEYS.mapCenterLng,
    MAP_DEFAULT_CENTER[0],
    MIN_MAP_CENTER_LNG,
    MAX_MAP_CENTER_LNG,
  );
  const lat = readNum(
    SETTINGS_STORAGE_KEYS.mapCenterLat,
    MAP_DEFAULT_CENTER[1],
    MIN_MAP_CENTER_LAT,
    MAX_MAP_CENTER_LAT,
  );
  return [lng, lat];
}

export function readMapZoom(): number {
  return readNum(SETTINGS_STORAGE_KEYS.mapZoom, MAP_DEFAULT_ZOOM, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
}

export function readLaneHalfWidth(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneHalfWidth,
    DEFAULT_LANE_HALF_WIDTH,
    MIN_LANE_HALF_WIDTH,
    MAX_LANE_HALF_WIDTH,
  );
}

export function readLaneArrowSpacing(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneArrowSpacing,
    LANE_ARROW_SYMBOL_SPACING,
    MIN_LANE_ARROW_SPACING,
    MAX_LANE_ARROW_SPACING,
  );
}

export function readGridEnabled(): boolean {
  return readBool(SETTINGS_STORAGE_KEYS.gridEnabled, true);
}

export function readSnapEnabled(): boolean {
  return readBool(SETTINGS_STORAGE_KEYS.snapEnabled, false);
}

export function readLaneSpeedLimit(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneSpeedLimit,
    DEFAULT_LANE_SPEED_LIMIT_MPS,
    MIN_LANE_SPEED_LIMIT,
    MAX_LANE_SPEED_LIMIT,
  );
}

export function readLaneBoundaryType(): BoundaryLineType {
  return readEnum(
    SETTINGS_STORAGE_KEYS.laneBoundaryType,
    DEFAULT_LANE_BOUNDARY_TYPE,
    LANE_BOUNDARY_TYPE_OPTIONS,
  );
}

export function readSnapRadius(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.snapRadius,
    SNAP_RADIUS_PX,
    MIN_SNAP_RADIUS,
    MAX_SNAP_RADIUS,
  );
}

export function readClickThreshold(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.clickThreshold,
    CLICK_THRESHOLD_PX,
    MIN_CLICK_THRESHOLD,
    MAX_CLICK_THRESHOLD,
  );
}

export function readHitBboxPadding(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.hitBboxPadding,
    HIT_BBOX_PADDING_PX,
    MIN_HIT_BBOX_PADDING,
    MAX_HIT_BBOX_PADDING,
  );
}

export function readHitTestRadius(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.hitTestRadius,
    HIT_TEST_RADIUS_PX,
    MIN_HIT_TEST_RADIUS,
    MAX_HIT_TEST_RADIUS,
  );
}

export function readLaneFillOpacity(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneFillOpacity,
    LANE_FILL_OPACITY,
    MIN_OPACITY,
    MAX_OPACITY,
  );
}

export function readLaneEdgeLineWidth(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneEdgeLineWidth,
    LANE_EDGE_LINE_WIDTH,
    MIN_LANE_LINE_WIDTH,
    MAX_LANE_LINE_WIDTH,
  );
}

export function readLaneEdgeLineOpacity(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneEdgeLineOpacity,
    LANE_EDGE_LINE_OPACITY,
    MIN_OPACITY,
    MAX_OPACITY,
  );
}

export function readLaneCenterLineWidth(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneCenterLineWidth,
    LANE_CENTER_LINE_WIDTH,
    MIN_LANE_LINE_WIDTH,
    MAX_LANE_LINE_WIDTH,
  );
}

export function readLaneCenterLineOpacity(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneCenterLineOpacity,
    LANE_CENTER_LINE_OPACITY,
    MIN_OPACITY,
    MAX_OPACITY,
  );
}

export function readLaneArrowSize(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneArrowSize,
    LANE_ARROW_TEXT_SIZE,
    MIN_LANE_ARROW_SIZE,
    MAX_LANE_ARROW_SIZE,
  );
}

export function readLaneArrowOpacity(): number {
  return readNum(
    SETTINGS_STORAGE_KEYS.laneArrowOpacity,
    LANE_ARROW_OPACITY,
    MIN_OPACITY,
    MAX_OPACITY,
  );
}
