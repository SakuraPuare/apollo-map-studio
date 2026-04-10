import { create } from 'zustand';
import {
  MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM,
  DEFAULT_LANE_HALF_WIDTH, LANE_ARROW_SYMBOL_SPACING,
} from '@/config/mapConstants';

// ─── localStorage keys ────────────────────────────────────────────────────────

const HISTORY_LIMIT_KEY      = 'apollo-map-studio:historyLimit';
const MAP_CENTER_LNG_KEY     = 'apollo-map-studio:mapCenterLng';
const MAP_CENTER_LAT_KEY     = 'apollo-map-studio:mapCenterLat';
const MAP_ZOOM_KEY           = 'apollo-map-studio:mapZoom';
const LANE_HALF_WIDTH_KEY    = 'apollo-map-studio:laneHalfWidth';
const LANE_ARROW_SPACING_KEY = 'apollo-map-studio:laneArrowSpacing';

// ─── 范围 ─────────────────────────────────────────────────────────────────────

export const DEFAULT_HISTORY_LIMIT   = 100;
export const MIN_HISTORY_LIMIT       = 10;
export const MAX_HISTORY_LIMIT       = 1000;

export const MIN_MAP_ZOOM            = 1;
export const MAX_MAP_ZOOM            = 22;

export const MIN_LANE_HALF_WIDTH     = 0.5;
export const MAX_LANE_HALF_WIDTH     = 10;

export const MIN_LANE_ARROW_SPACING  = 40;
export const MAX_LANE_ARROW_SPACING  = 500;

// ─── 读取函数（供 map 初始化等 useEffect 外部调用） ───────────────────────────

function readNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
    }
  } catch { /* SSR / 隐私模式 */ }
  return fallback;
}

export function readHistoryLimit(): number {
  return readNum(HISTORY_LIMIT_KEY, DEFAULT_HISTORY_LIMIT, MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
}

export function readMapCenter(): [number, number] {
  const lng = readNum(MAP_CENTER_LNG_KEY, MAP_DEFAULT_CENTER[0], -180, 180);
  const lat = readNum(MAP_CENTER_LAT_KEY, MAP_DEFAULT_CENTER[1], -90, 90);
  return [lng, lat];
}

export function readMapZoom(): number {
  return readNum(MAP_ZOOM_KEY, MAP_DEFAULT_ZOOM, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
}

export function readLaneHalfWidth(): number {
  return readNum(LANE_HALF_WIDTH_KEY, DEFAULT_LANE_HALF_WIDTH, MIN_LANE_HALF_WIDTH, MAX_LANE_HALF_WIDTH);
}

export function readLaneArrowSpacing(): number {
  return readNum(LANE_ARROW_SPACING_KEY, LANE_ARROW_SYMBOL_SPACING, MIN_LANE_ARROW_SPACING, MAX_LANE_ARROW_SPACING);
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface SettingsState {
  historyLimit: number;
  mapCenterLng: number;
  mapCenterLat: number;
  mapZoom: number;
  laneHalfWidth: number;
  laneArrowSpacing: number;
}

export interface SettingsActions {
  setHistoryLimit(value: number): void;
  setMapCenter(lng: number, lat: number): void;
  setMapZoom(value: number): void;
  setLaneHalfWidth(value: number): void;
  setLaneArrowSpacing(value: number): void;
}

function persist(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
}

export const useSettingsStore = create<SettingsState & SettingsActions>()((set) => {
  const [lng, lat] = readMapCenter();
  return {
    historyLimit:    readHistoryLimit(),
    mapCenterLng:    lng,
    mapCenterLat:    lat,
    mapZoom:         readMapZoom(),
    laneHalfWidth:   readLaneHalfWidth(),
    laneArrowSpacing: readLaneArrowSpacing(),

    setHistoryLimit(value) {
      const v = Math.max(MIN_HISTORY_LIMIT, Math.min(MAX_HISTORY_LIMIT, Math.round(value)));
      set({ historyLimit: v });
      persist(HISTORY_LIMIT_KEY, v);
    },
    setMapCenter(lng, lat) {
      const lo = Math.max(-180, Math.min(180, lng));
      const la = Math.max(-90, Math.min(90, lat));
      set({ mapCenterLng: lo, mapCenterLat: la });
      persist(MAP_CENTER_LNG_KEY, lo);
      persist(MAP_CENTER_LAT_KEY, la);
    },
    setMapZoom(value) {
      const v = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, value));
      set({ mapZoom: v });
      persist(MAP_ZOOM_KEY, v);
    },
    setLaneHalfWidth(value) {
      const v = Math.max(MIN_LANE_HALF_WIDTH, Math.min(MAX_LANE_HALF_WIDTH, value));
      set({ laneHalfWidth: v });
      persist(LANE_HALF_WIDTH_KEY, v);
    },
    setLaneArrowSpacing(value) {
      const v = Math.max(MIN_LANE_ARROW_SPACING, Math.min(MAX_LANE_ARROW_SPACING, Math.round(value)));
      set({ laneArrowSpacing: v });
      persist(LANE_ARROW_SPACING_KEY, v);
    },
  };
});
