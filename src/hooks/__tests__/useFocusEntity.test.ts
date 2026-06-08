import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocusEntity } from '../useFocusEntity';
import type * as ReactModule from 'react';

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn((effect: () => unknown) => {
    effect();
  }),
}));

const storeMocks = vi.hoisted(() => {
  const uiState = {
    focusEntityRequest: null as { entityId: string; requestId: string } | null,
    clearFocusEntityRequest: vi.fn(),
  };
  const mapState = {
    entities: new Map<string, unknown>(),
  };
  return {
    uiState,
    mapState,
    useUIStore: vi.fn((selector: (state: typeof uiState) => unknown) => selector(uiState)),
    useMapStore: vi.fn((selector: (state: typeof mapState) => unknown) => selector(mapState)),
  };
});

const geometryMocks = vi.hoisted(() => ({
  bounds: null as unknown,
  center: [0, 0] as [number, number],
  tiny: false,
  boundsForEntity: vi.fn(() => geometryMocks.bounds),
  boundsCenter: vi.fn(() => geometryMocks.center),
  isTinyBounds: vi.fn(() => geometryMocks.tiny),
}));

const mapLibreMock = vi.hoisted(() => ({
  LngLatBounds: class FakeLngLatBounds {
    sw: unknown;
    ne: unknown;

    constructor(sw: unknown, ne: unknown) {
      this.sw = sw;
      this.ne = ne;
    }
  },
}));

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof ReactModule>();
  return {
    ...actual,
    useEffect: reactMocks.useEffect,
  };
});

vi.mock('@/store/uiStore', () => ({
  useUIStore: storeMocks.useUIStore,
}));

vi.mock('@/store/mapStore', () => ({
  useMapStore: storeMocks.useMapStore,
}));

vi.mock('@/core/geometry/entityBounds', () => ({
  boundsForEntity: geometryMocks.boundsForEntity,
  boundsCenter: geometryMocks.boundsCenter,
  isTinyBounds: geometryMocks.isTinyBounds,
}));

vi.mock('maplibre-gl', () => ({
  default: {
    LngLatBounds: mapLibreMock.LngLatBounds,
  },
}));

function makeMap(zoom = 17) {
  return {
    getZoom: vi.fn(() => zoom),
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.uiState.focusEntityRequest = null;
  storeMocks.uiState.clearFocusEntityRequest = vi.fn();
  storeMocks.mapState.entities = new Map();
  geometryMocks.bounds = null;
  geometryMocks.center = [0, 0];
  geometryMocks.tiny = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFocusEntity', () => {
  it('does nothing without a focus request, map, or loaded map', () => {
    const map = makeMap();
    useFocusEntity({ current: map } as never, { current: true });

    storeMocks.uiState.focusEntityRequest = { entityId: 'lane-1', requestId: 'request-1' };
    useFocusEntity({ current: null } as never, { current: true });
    useFocusEntity({ current: map } as never, { current: false });

    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(storeMocks.uiState.clearFocusEntityRequest).not.toHaveBeenCalled();
  });

  it('clears the request when the entity has no focusable bounds', () => {
    storeMocks.uiState.focusEntityRequest = { entityId: 'missing', requestId: 'request-1' };

    useFocusEntity({ current: makeMap() } as never, { current: true });

    expect(storeMocks.uiState.clearFocusEntityRequest).toHaveBeenCalledWith('request-1');
    expect(geometryMocks.boundsForEntity).not.toHaveBeenCalled();
  });

  it('uses easeTo for tiny bounds and preserves higher current zoom', () => {
    const entity = { id: 'point-1' };
    storeMocks.uiState.focusEntityRequest = { entityId: 'point-1', requestId: 'request-2' };
    storeMocks.mapState.entities.set('point-1', entity);
    geometryMocks.bounds = { minX: 1, minY: 2, maxX: 1, maxY: 2 };
    geometryMocks.center = [1, 2];
    geometryMocks.tiny = true;
    const map = makeMap(21);

    useFocusEntity({ current: map } as never, { current: true });

    expect(geometryMocks.boundsForEntity).toHaveBeenCalledWith(entity);
    expect(map.easeTo).toHaveBeenCalledWith({
      center: [1, 2],
      zoom: 21,
      duration: 550,
    });
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(storeMocks.uiState.clearFocusEntityRequest).toHaveBeenCalledWith('request-2');
  });

  it('uses fitBounds for larger bounds with a minimum focus zoom', () => {
    const entity = { id: 'lane-1' };
    storeMocks.uiState.focusEntityRequest = { entityId: 'lane-1', requestId: 'request-3' };
    storeMocks.mapState.entities.set('lane-1', entity);
    geometryMocks.bounds = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
    geometryMocks.tiny = false;
    const map = makeMap(12);

    useFocusEntity({ current: map } as never, { current: true });

    const [boundsArg, options] = map.fitBounds.mock.calls[0]!;
    expect(boundsArg).toMatchObject({ sw: [1, 2], ne: [3, 4] });
    expect(options).toEqual({ padding: 120, duration: 550, maxZoom: 18 });
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(storeMocks.uiState.clearFocusEntityRequest).toHaveBeenCalledWith('request-3');
  });
});
