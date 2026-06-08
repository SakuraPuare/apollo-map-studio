import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApolloLayer } from '../useApolloLayer';
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

const apolloStoreMock = vi.hoisted(() => {
  type ApolloState = { bounds: unknown };
  const state: ApolloState = { bounds: null };
  return {
    state,
    useApolloMapStore: vi.fn((selector: (state: ApolloState) => unknown) => selector(state)),
  };
});

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof ReactModule>();
  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useRef: reactMocks.useRef,
  };
});

vi.mock('@/store/apolloMapStore', () => ({
  useApolloMapStore: apolloStoreMock.useApolloMapStore,
}));

class FakeGeoJsonSource {
  setData = vi.fn();
}

function makeMap(styleLayers: Array<{ id: string }> = [{ id: 'cold-fill' }]) {
  const sources = new Map<string, FakeGeoJsonSource>();
  const layers = new Set<string>();
  const map = {
    sources,
    layers,
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => {
      const source = new FakeGeoJsonSource();
      sources.set(id, source);
    }),
    getLayer: vi.fn((id: string) => layers.has(id)),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.add(layer.id);
    }),
    getStyle: vi.fn(() => ({ layers: styleLayers })),
    fitBounds: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
  };
  return map;
}

beforeEach(() => {
  vi.clearAllMocks();
  reactMocks.cleanups.length = 0;
  apolloStoreMock.state.bounds = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useApolloLayer', () => {
  it('installs Apollo sources and layers on loaded maps, then fits imported bounds', () => {
    const bounds = [
      [1, 2],
      [3, 4],
    ];
    apolloStoreMock.state.bounds = bounds;
    const map = makeMap();

    useApolloLayer({ current: map } as never, { current: true });

    expect(map.addSource).toHaveBeenCalledTimes(10);
    expect(map.addSource).toHaveBeenCalledWith('apollo-lane-center', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    expect(map.addLayer).toHaveBeenCalledTimes(12);
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'apollo-junction-fill' }),
      'cold-fill',
    );
    expect(
      [...map.sources.values()].every((source) => source.setData.mock.calls.length === 1),
    ).toBe(true);
    expect(map.fitBounds).toHaveBeenCalledWith(bounds, {
      padding: 60,
      animate: true,
      duration: 600,
    });
    expect(map.once).not.toHaveBeenCalled();
  });

  it('waits for map load and unregisters the load listener on cleanup', () => {
    const map = makeMap();
    const mapLoadedRef = { current: false };

    useApolloLayer({ current: map } as never, mapLoadedRef);

    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));

    mapLoadedRef.current = true;
    const onLoad = map.once.mock.calls[0]![1] as () => void;
    onLoad();

    expect(map.addSource).toHaveBeenCalledTimes(10);
    const cleanup = reactMocks.cleanups.find(
      (value): value is () => void => typeof value === 'function',
    );
    cleanup?.();

    expect(map.off).toHaveBeenCalledWith('load', onLoad);
  });

  it('returns without touching MapLibre when the map ref is empty', () => {
    useApolloLayer({ current: null } as never, { current: true });

    expect(reactMocks.useEffect).toHaveBeenCalledTimes(1);
  });
});
