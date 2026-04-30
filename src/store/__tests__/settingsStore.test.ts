/**
 * settingsStore — 编辑器全局设置持久化层 (zustand + localStorage).
 *
 * Test strategy (mirrors uiStore pattern):
 *   - Capture initial state snapshot; restore before each test.
 *   - Mock localStorage so tests are isolated from the real storage.
 *   - Test default state (values from mapConstants / exported defaults).
 *   - Test each setter clamps to its declared min/max range.
 *   - Test that persist() writes to localStorage on each mutation.
 *   - Test readXxx() helper functions directly (independent of store init).
 *   - Edge cases: NaN, Infinity, exact boundary values, sub-integer inputs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useSettingsStore,
  readHistoryLimit,
  readMapCenter,
  readMapZoom,
  readLaneHalfWidth,
  readLaneArrowSpacing,
  DEFAULT_HISTORY_LIMIT,
  MIN_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MIN_MAP_ZOOM,
  MAX_MAP_ZOOM,
  MIN_LANE_HALF_WIDTH,
  MAX_LANE_HALF_WIDTH,
  MIN_LANE_ARROW_SPACING,
  MAX_LANE_ARROW_SPACING,
} from '../settingsStore';

// ─── localStorage mock ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ─── store reset ──────────────────────────────────────────────────────────────

const initialSnapshot = useSettingsStore.getState();

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  useSettingsStore.setState(initialSnapshot, true);
});

// ── Default state ─────────────────────────────────────────────────────────────

describe('settingsStore — default state', () => {
  it('historyLimit defaults to DEFAULT_HISTORY_LIMIT (100)', () => {
    expect(useSettingsStore.getState().historyLimit).toBe(DEFAULT_HISTORY_LIMIT);
    expect(DEFAULT_HISTORY_LIMIT).toBe(100);
  });

  it('mapCenterLng defaults to MAP_DEFAULT_CENTER[0] (116.4)', () => {
    expect(useSettingsStore.getState().mapCenterLng).toBe(116.4);
  });

  it('mapCenterLat defaults to MAP_DEFAULT_CENTER[1] (39.9)', () => {
    expect(useSettingsStore.getState().mapCenterLat).toBe(39.9);
  });

  it('mapZoom defaults to MAP_DEFAULT_ZOOM (18)', () => {
    expect(useSettingsStore.getState().mapZoom).toBe(18);
  });

  it('laneHalfWidth defaults to DEFAULT_LANE_HALF_WIDTH (1.75)', () => {
    expect(useSettingsStore.getState().laneHalfWidth).toBe(1.75);
  });

  it('laneArrowSpacing defaults to LANE_ARROW_SYMBOL_SPACING (160)', () => {
    expect(useSettingsStore.getState().laneArrowSpacing).toBe(160);
  });
});

// ── Exported range constants ──────────────────────────────────────────────────

describe('settingsStore — range constants', () => {
  it('history limit range: 10–1000', () => {
    expect(MIN_HISTORY_LIMIT).toBe(10);
    expect(MAX_HISTORY_LIMIT).toBe(1000);
  });

  it('map zoom range: 1–22', () => {
    expect(MIN_MAP_ZOOM).toBe(1);
    expect(MAX_MAP_ZOOM).toBe(22);
  });

  it('lane half-width range: 0.5–10', () => {
    expect(MIN_LANE_HALF_WIDTH).toBe(0.5);
    expect(MAX_LANE_HALF_WIDTH).toBe(10);
  });

  it('lane arrow spacing range: 40–500', () => {
    expect(MIN_LANE_ARROW_SPACING).toBe(40);
    expect(MAX_LANE_ARROW_SPACING).toBe(500);
  });
});

// ── setHistoryLimit ───────────────────────────────────────────────────────────

describe('settingsStore — setHistoryLimit', () => {
  it('sets a valid value in range', () => {
    useSettingsStore.getState().setHistoryLimit(200);
    expect(useSettingsStore.getState().historyLimit).toBe(200);
  });

  it('clamps below MIN_HISTORY_LIMIT to MIN_HISTORY_LIMIT', () => {
    useSettingsStore.getState().setHistoryLimit(1);
    expect(useSettingsStore.getState().historyLimit).toBe(MIN_HISTORY_LIMIT);
  });

  it('clamps above MAX_HISTORY_LIMIT to MAX_HISTORY_LIMIT', () => {
    useSettingsStore.getState().setHistoryLimit(9999);
    expect(useSettingsStore.getState().historyLimit).toBe(MAX_HISTORY_LIMIT);
  });

  it('accepts exact boundary values', () => {
    useSettingsStore.getState().setHistoryLimit(MIN_HISTORY_LIMIT);
    expect(useSettingsStore.getState().historyLimit).toBe(MIN_HISTORY_LIMIT);
    useSettingsStore.getState().setHistoryLimit(MAX_HISTORY_LIMIT);
    expect(useSettingsStore.getState().historyLimit).toBe(MAX_HISTORY_LIMIT);
  });

  it('rounds fractional values', () => {
    useSettingsStore.getState().setHistoryLimit(50.7);
    expect(useSettingsStore.getState().historyLimit).toBe(51);
  });

  it('persists to localStorage', () => {
    useSettingsStore.getState().setHistoryLimit(300);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('apollo-map-studio:historyLimit', '300');
  });
});

// ── setMapCenter ──────────────────────────────────────────────────────────────

describe('settingsStore — setMapCenter', () => {
  it('stores valid lng/lat', () => {
    useSettingsStore.getState().setMapCenter(121.47, 31.23);
    expect(useSettingsStore.getState().mapCenterLng).toBe(121.47);
    expect(useSettingsStore.getState().mapCenterLat).toBe(31.23);
  });

  it('clamps lng below -180 to -180', () => {
    useSettingsStore.getState().setMapCenter(-181, 0);
    expect(useSettingsStore.getState().mapCenterLng).toBe(-180);
  });

  it('clamps lng above 180 to 180', () => {
    useSettingsStore.getState().setMapCenter(200, 0);
    expect(useSettingsStore.getState().mapCenterLng).toBe(180);
  });

  it('clamps lat below -90 to -90', () => {
    useSettingsStore.getState().setMapCenter(0, -91);
    expect(useSettingsStore.getState().mapCenterLat).toBe(-90);
  });

  it('clamps lat above 90 to 90', () => {
    useSettingsStore.getState().setMapCenter(0, 91);
    expect(useSettingsStore.getState().mapCenterLat).toBe(90);
  });

  it('accepts exact boundary values (-180/180 lng, -90/90 lat)', () => {
    useSettingsStore.getState().setMapCenter(-180, -90);
    expect(useSettingsStore.getState().mapCenterLng).toBe(-180);
    expect(useSettingsStore.getState().mapCenterLat).toBe(-90);

    useSettingsStore.getState().setMapCenter(180, 90);
    expect(useSettingsStore.getState().mapCenterLng).toBe(180);
    expect(useSettingsStore.getState().mapCenterLat).toBe(90);
  });

  it('persists both lng and lat to localStorage', () => {
    useSettingsStore.getState().setMapCenter(100, 50);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('apollo-map-studio:mapCenterLng', '100');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('apollo-map-studio:mapCenterLat', '50');
  });
});

// ── setMapZoom ────────────────────────────────────────────────────────────────

describe('settingsStore — setMapZoom', () => {
  it('sets a valid zoom value', () => {
    useSettingsStore.getState().setMapZoom(15);
    expect(useSettingsStore.getState().mapZoom).toBe(15);
  });

  it('clamps below MIN_MAP_ZOOM to MIN_MAP_ZOOM', () => {
    useSettingsStore.getState().setMapZoom(0);
    expect(useSettingsStore.getState().mapZoom).toBe(MIN_MAP_ZOOM);
  });

  it('clamps above MAX_MAP_ZOOM to MAX_MAP_ZOOM', () => {
    useSettingsStore.getState().setMapZoom(30);
    expect(useSettingsStore.getState().mapZoom).toBe(MAX_MAP_ZOOM);
  });

  it('accepts exact boundary values', () => {
    useSettingsStore.getState().setMapZoom(MIN_MAP_ZOOM);
    expect(useSettingsStore.getState().mapZoom).toBe(MIN_MAP_ZOOM);
    useSettingsStore.getState().setMapZoom(MAX_MAP_ZOOM);
    expect(useSettingsStore.getState().mapZoom).toBe(MAX_MAP_ZOOM);
  });

  it('persists to localStorage', () => {
    useSettingsStore.getState().setMapZoom(16);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('apollo-map-studio:mapZoom', '16');
  });

  it('accepts fractional zoom (not rounded)', () => {
    useSettingsStore.getState().setMapZoom(14.5);
    expect(useSettingsStore.getState().mapZoom).toBe(14.5);
  });
});

// ── setLaneHalfWidth ──────────────────────────────────────────────────────────

describe('settingsStore — setLaneHalfWidth', () => {
  it('sets a valid value in range', () => {
    useSettingsStore.getState().setLaneHalfWidth(2.5);
    expect(useSettingsStore.getState().laneHalfWidth).toBe(2.5);
  });

  it('clamps below MIN_LANE_HALF_WIDTH', () => {
    useSettingsStore.getState().setLaneHalfWidth(0.1);
    expect(useSettingsStore.getState().laneHalfWidth).toBe(MIN_LANE_HALF_WIDTH);
  });

  it('clamps above MAX_LANE_HALF_WIDTH', () => {
    useSettingsStore.getState().setLaneHalfWidth(100);
    expect(useSettingsStore.getState().laneHalfWidth).toBe(MAX_LANE_HALF_WIDTH);
  });

  it('accepts exact boundary values', () => {
    useSettingsStore.getState().setLaneHalfWidth(MIN_LANE_HALF_WIDTH);
    expect(useSettingsStore.getState().laneHalfWidth).toBe(MIN_LANE_HALF_WIDTH);
    useSettingsStore.getState().setLaneHalfWidth(MAX_LANE_HALF_WIDTH);
    expect(useSettingsStore.getState().laneHalfWidth).toBe(MAX_LANE_HALF_WIDTH);
  });

  it('persists to localStorage', () => {
    useSettingsStore.getState().setLaneHalfWidth(3);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('apollo-map-studio:laneHalfWidth', '3');
  });
});

// ── setLaneArrowSpacing ───────────────────────────────────────────────────────

describe('settingsStore — setLaneArrowSpacing', () => {
  it('sets a valid value in range', () => {
    useSettingsStore.getState().setLaneArrowSpacing(200);
    expect(useSettingsStore.getState().laneArrowSpacing).toBe(200);
  });

  it('clamps below MIN_LANE_ARROW_SPACING', () => {
    useSettingsStore.getState().setLaneArrowSpacing(10);
    expect(useSettingsStore.getState().laneArrowSpacing).toBe(MIN_LANE_ARROW_SPACING);
  });

  it('clamps above MAX_LANE_ARROW_SPACING', () => {
    useSettingsStore.getState().setLaneArrowSpacing(1000);
    expect(useSettingsStore.getState().laneArrowSpacing).toBe(MAX_LANE_ARROW_SPACING);
  });

  it('accepts exact boundary values', () => {
    useSettingsStore.getState().setLaneArrowSpacing(MIN_LANE_ARROW_SPACING);
    expect(useSettingsStore.getState().laneArrowSpacing).toBe(MIN_LANE_ARROW_SPACING);
    useSettingsStore.getState().setLaneArrowSpacing(MAX_LANE_ARROW_SPACING);
    expect(useSettingsStore.getState().laneArrowSpacing).toBe(MAX_LANE_ARROW_SPACING);
  });

  it('rounds fractional values', () => {
    useSettingsStore.getState().setLaneArrowSpacing(150.9);
    expect(useSettingsStore.getState().laneArrowSpacing).toBe(151);
  });

  it('persists to localStorage', () => {
    useSettingsStore.getState().setLaneArrowSpacing(250);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'apollo-map-studio:laneArrowSpacing',
      '250',
    );
  });
});

// ── readXxx helpers ───────────────────────────────────────────────────────────

describe('readHistoryLimit', () => {
  it('returns DEFAULT_HISTORY_LIMIT when localStorage is empty', () => {
    expect(readHistoryLimit()).toBe(DEFAULT_HISTORY_LIMIT);
  });

  it('returns clamped value from localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('500');
    expect(readHistoryLimit()).toBe(500);
  });

  it('clamps stored value below MIN to MIN', () => {
    localStorageMock.getItem.mockReturnValueOnce('1');
    expect(readHistoryLimit()).toBe(MIN_HISTORY_LIMIT);
  });

  it('clamps stored value above MAX to MAX', () => {
    localStorageMock.getItem.mockReturnValueOnce('9999');
    expect(readHistoryLimit()).toBe(MAX_HISTORY_LIMIT);
  });

  it('returns DEFAULT when stored value is non-numeric', () => {
    localStorageMock.getItem.mockReturnValueOnce('not-a-number');
    expect(readHistoryLimit()).toBe(DEFAULT_HISTORY_LIMIT);
  });

  it('returns DEFAULT when stored value is Infinity', () => {
    localStorageMock.getItem.mockReturnValueOnce('Infinity');
    expect(readHistoryLimit()).toBe(DEFAULT_HISTORY_LIMIT);
  });
});

describe('readMapCenter', () => {
  it('returns [MAP_DEFAULT_CENTER[0], MAP_DEFAULT_CENTER[1]] when localStorage is empty', () => {
    const [lng, lat] = readMapCenter();
    expect(lng).toBe(116.4);
    expect(lat).toBe(39.9);
  });

  it('returns a tuple of [lng, lat]', () => {
    const result = readMapCenter();
    expect(result).toHaveLength(2);
    expect(typeof result[0]).toBe('number');
    expect(typeof result[1]).toBe('number');
  });

  it('clamps lng stored value to [-180, 180]', () => {
    // First call → lng key, second call → lat key
    localStorageMock.getItem
      .mockReturnValueOnce('999') // lng
      .mockReturnValueOnce('0'); // lat
    const [lng] = readMapCenter();
    expect(lng).toBe(180);
  });

  it('clamps lat stored value to [-90, 90]', () => {
    localStorageMock.getItem
      .mockReturnValueOnce('0') // lng
      .mockReturnValueOnce('-200'); // lat
    const [, lat] = readMapCenter();
    expect(lat).toBe(-90);
  });
});

describe('readMapZoom', () => {
  it('returns MAP_DEFAULT_ZOOM (18) when localStorage is empty', () => {
    expect(readMapZoom()).toBe(18);
  });

  it('returns stored zoom when valid', () => {
    localStorageMock.getItem.mockReturnValueOnce('14');
    expect(readMapZoom()).toBe(14);
  });

  it('clamps stored zoom to [MIN_MAP_ZOOM, MAX_MAP_ZOOM]', () => {
    localStorageMock.getItem.mockReturnValueOnce('100');
    expect(readMapZoom()).toBe(MAX_MAP_ZOOM);
  });
});

describe('readLaneHalfWidth', () => {
  it('returns DEFAULT_LANE_HALF_WIDTH (1.75) when localStorage is empty', () => {
    expect(readLaneHalfWidth()).toBe(1.75);
  });

  it('returns stored value when valid', () => {
    localStorageMock.getItem.mockReturnValueOnce('3.5');
    expect(readLaneHalfWidth()).toBe(3.5);
  });

  it('clamps stored value to [MIN, MAX]', () => {
    localStorageMock.getItem.mockReturnValueOnce('0.1');
    expect(readLaneHalfWidth()).toBe(MIN_LANE_HALF_WIDTH);
  });
});

describe('readLaneArrowSpacing', () => {
  it('returns LANE_ARROW_SYMBOL_SPACING (160) when localStorage is empty', () => {
    expect(readLaneArrowSpacing()).toBe(160);
  });

  it('returns stored value when valid', () => {
    localStorageMock.getItem.mockReturnValueOnce('300');
    expect(readLaneArrowSpacing()).toBe(300);
  });

  it('clamps stored value to [MIN, MAX]', () => {
    localStorageMock.getItem.mockReturnValueOnce('600');
    expect(readLaneArrowSpacing()).toBe(MAX_LANE_ARROW_SPACING);
  });
});

// ── State isolation between tests ─────────────────────────────────────────────

describe('settingsStore — state isolation', () => {
  it('mutations in one test do not bleed into the next via the beforeEach reset', () => {
    // This test intentionally mutates the store; the subsequent test is in its
    // own 'it' and will see the reset state captured in initialSnapshot.
    useSettingsStore.getState().setHistoryLimit(999);
    expect(useSettingsStore.getState().historyLimit).toBe(999);
  });

  it('store is back to initial after the preceding mutation test', () => {
    expect(useSettingsStore.getState().historyLimit).toBe(initialSnapshot.historyLimit);
  });
});
