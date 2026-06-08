import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapLibreInit } from '../useMapLibreInit';
import { addEditorLayers } from '../mapLibreInit/layers';
import { readMapCenter, readMapZoom } from '@/store/settingsStore';
import type * as ReactModule from 'react';

const reactMocks = vi.hoisted(() => {
  const cleanups: unknown[] = [];
  return {
    cleanups,
    useEffect: vi.fn((effect: () => unknown) => {
      cleanups.push(effect());
    }),
    useRef: vi.fn(<T>(initial: T) => ({ current: initial })),
  };
});

const mapLibreMock = vi.hoisted(() => {
  const state = {
    map: null as unknown,
    options: null as unknown,
  };
  return {
    state,
    Map: vi.fn(function MockMap(options: unknown) {
      state.options = options;
      return state.map;
    }),
  };
});

const settingsStoreMock = vi.hoisted(() => {
  const settings = {
    laneArrowSpacing: 32,
    laneArrowSize: 24,
    laneArrowOpacity: 0.75,
  };
  return {
    settings,
    useSettingsStore: vi.fn((selector: (state: typeof settings) => unknown) => selector(settings)),
    readMapCenter: vi.fn(() => [120, 30]),
    readMapZoom: vi.fn(() => 15),
  };
});

const layersMock = vi.hoisted(() => ({
  addEditorLayers: vi.fn(),
}));

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof ReactModule>();
  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useRef: reactMocks.useRef,
  };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: mapLibreMock.Map,
  },
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: settingsStoreMock.useSettingsStore,
  readMapCenter: settingsStoreMock.readMapCenter,
  readMapZoom: settingsStoreMock.readMapZoom,
}));

vi.mock('../mapLibreInit/assets', () => ({
  DARK_STYLE: { version: 8, sources: {}, layers: [] },
}));

vi.mock('../mapLibreInit/layers', () => ({
  addEditorLayers: layersMock.addEditorLayers,
}));

function makeMap() {
  const canvas = {
    dataset: {} as Record<string, string>,
    ariaLabel: '',
  };

  return {
    canvas,
    getCanvas: vi.fn(() => canvas),
    loaded: vi.fn(() => false),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  reactMocks.cleanups.length = 0;
  mapLibreMock.state.map = makeMap();
  mapLibreMock.state.options = null;
  settingsStoreMock.settings.laneArrowSpacing = 32;
  settingsStoreMock.settings.laneArrowSize = 24;
  settingsStoreMock.settings.laneArrowOpacity = 0.75;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMapLibreInit', () => {
  it('creates the map from persisted settings, marks load state, and cleans up', () => {
    const container = { nodeName: 'DIV' };
    const result = useMapLibreInit({ current: container } as never);
    const map = mapLibreMock.state.map as ReturnType<typeof makeMap>;

    expect(mapLibreMock.Map).toHaveBeenCalledWith({
      container,
      style: { version: 8, sources: {}, layers: [] },
      center: [120, 30],
      zoom: 15,
      doubleClickZoom: false,
    });
    expect(readMapCenter).toHaveBeenCalledTimes(1);
    expect(readMapZoom).toHaveBeenCalledTimes(1);
    expect(map.getCanvas).toHaveBeenCalledTimes(1);
    expect(map.canvas.dataset.testid).toBe('maplibre-canvas');
    expect(map.canvas.dataset.mapReady).toBe('false');
    expect(map.canvas.ariaLabel).toBe('MapLibre canvas');
    expect(map.on).toHaveBeenCalledWith('load', expect.any(Function));

    const onLoad = map.on.mock.calls[0]![1] as () => void;
    onLoad();
    expect(result.mapLoadedRef.current).toBe(true);
    expect(addEditorLayers).toHaveBeenCalledWith(map);
    expect(map.canvas.dataset.mapReady).toBe('true');

    const cleanup = reactMocks.cleanups.find(
      (value): value is () => void => typeof value === 'function',
    );
    cleanup?.();

    expect(map.off).toHaveBeenCalledWith('load', onLoad);
    expect(map.remove).toHaveBeenCalledTimes(1);
    expect(result.mapRef.current).toBeNull();
    expect(result.mapLoadedRef.current).toBe(false);
  });

  it('applies lane arrow settings when the map loads before the settings effect runs', () => {
    const map = makeMap();
    map.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'load') handler();
      return map;
    });
    mapLibreMock.state.map = map;

    useMapLibreInit({ current: { nodeName: 'DIV' } } as never);

    expect(map.setLayoutProperty).toHaveBeenCalledWith('cold-lane-arrows', 'symbol-spacing', 32);
    expect(map.setLayoutProperty).toHaveBeenCalledWith('cold-lane-arrows', 'icon-size', 1.2);
    expect(map.setPaintProperty).toHaveBeenCalledWith('cold-lane-arrows', 'icon-opacity', 0.75);
  });

  it('marks the canvas ready when MapLibre is already loaded', () => {
    const map = makeMap();
    map.loaded.mockReturnValue(true);
    mapLibreMock.state.map = map;

    const result = useMapLibreInit({ current: { nodeName: 'DIV' } } as never);

    expect(result.mapLoadedRef.current).toBe(true);
    expect(addEditorLayers).toHaveBeenCalledTimes(1);
    expect(map.canvas.dataset.mapReady).toBe('true');
  });

  it('does not create a map when the container ref is empty', () => {
    useMapLibreInit({ current: null } as never);

    expect(mapLibreMock.Map).not.toHaveBeenCalled();
  });
});
