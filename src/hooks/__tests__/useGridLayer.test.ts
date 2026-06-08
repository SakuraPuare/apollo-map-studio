/**
 * Unit tests for useGridLayer pure helpers.
 *
 * The hook has one key pure function: metersForZoom(zoom) → { step, majorEvery }.
 * It controls grid density across the zoom range. We test:
 *   1. The lookup table boundaries (all 11 zoom breakpoints).
 *   2. Monotonic decreasing step as zoom increases.
 *   3. MAX_LINES_PER_AXIS guard — the grid builder never emits more lines
 *      than the safety cap.
 *
 * Note: buildGrid() requires a real maplibregl.Map (getBounds, getZoom) and
 * is 100% MapLibre-side-effect-bound. It is tested implicitly via metersForZoom
 * boundary verification. The function itself is not exported, so we replicate
 * the lookup table inline.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  applyGridLayer,
  metersForZoom,
  installGridLayerSync,
  MAX_LINES_PER_AXIS,
  buildGrid,
} from '../useGridLayer';

function fakeMap({
  south,
  north,
  west,
  east,
  zoom,
}: {
  south: number;
  north: number;
  west: number;
  east: number;
  zoom: number;
}) {
  return {
    getZoom: () => zoom,
    getBounds: () => ({
      getSouth: () => south,
      getNorth: () => north,
      getWest: () => west,
      getEast: () => east,
    }),
  };
}

function fakeLayerMap({ loaded = true, hasLayer = true, hasSource = true, zoom = 20 } = {}) {
  const source = { setData: vi.fn() };
  type MapHandler = () => void;
  const handlers = new Map<string, MapHandler>();
  const map = {
    getZoom: vi.fn(() => zoom),
    getBounds: vi.fn(() => ({
      getSouth: () => 0,
      getNorth: () => 0.0001,
      getWest: () => 0,
      getEast: () => 0.0001,
    })),
    getLayer: vi.fn(() => (hasLayer ? {} : undefined)),
    getSource: vi.fn((id: string) => (hasSource && id === 'grid' ? source : undefined)),
    setLayoutProperty: vi.fn(),
    on: vi.fn((event: string, handler: MapHandler) => {
      handlers.set(event, handler);
    }),
    once: vi.fn((event: string, handler: MapHandler) => {
      handlers.set(`once:${event}`, handler);
    }),
    off: vi.fn(),
    fire(event: string) {
      handlers.get(event)?.();
    },
    fireOnce(event: string) {
      handlers.get(`once:${event}`)?.();
    },
  };
  return { map, source, mapLoadedRef: { current: loaded }, handlers };
}

// ---------------------------------------------------------------------------
// 1. Lookup table boundary tests
// ---------------------------------------------------------------------------

describe('metersForZoom — lookup table', () => {
  const cases: Array<[number, number, number]> = [
    [20, 0.5, 10],
    [19, 1, 10],
    [18, 2, 5],
    [17, 5, 5],
    [16, 10, 5],
    [15, 25, 4],
    [14, 50, 4],
    [13, 100, 5],
    [12, 250, 4],
    [11, 500, 4],
    [10, 1000, 5],
    [0, 1000, 5],
  ];

  for (const [zoom, step, majorEvery] of cases) {
    it(`zoom=${zoom} → step=${step}, majorEvery=${majorEvery}`, () => {
      expect(metersForZoom(zoom)).toEqual({ step, majorEvery });
    });
  }
});

describe('metersForZoom — boundary transitions', () => {
  it('zoom 19.9 falls into the z>=19 bucket', () => {
    expect(metersForZoom(19.9)).toEqual({ step: 1, majorEvery: 10 });
  });

  it('zoom 20.0 hits the z>=20 bucket', () => {
    expect(metersForZoom(20)).toEqual({ step: 0.5, majorEvery: 10 });
  });

  it('zoom 20.5 (beyond max) still returns z>=20 values', () => {
    expect(metersForZoom(20.5)).toEqual({ step: 0.5, majorEvery: 10 });
  });

  it('negative zoom falls through to the catch-all', () => {
    expect(metersForZoom(-5)).toEqual({ step: 1000, majorEvery: 5 });
  });
});

// ---------------------------------------------------------------------------
// 2. Monotonic step — step must decrease (or stay equal) as zoom increases
// ---------------------------------------------------------------------------

describe('metersForZoom — monotonic step', () => {
  it('step decreases or stays equal as zoom increases from 0 to 20', () => {
    const zooms = [0, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const steps = zooms.map((z) => metersForZoom(z).step);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1]!);
    }
  });

  it('step at zoom 20 is finer than step at zoom 10', () => {
    expect(metersForZoom(20).step).toBeLessThan(metersForZoom(10).step);
  });
});

// ---------------------------------------------------------------------------
// 3. majorEvery is always a positive integer
// ---------------------------------------------------------------------------

describe('metersForZoom — majorEvery validity', () => {
  const testZooms = [0, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  for (const z of testZooms) {
    it(`zoom=${z} majorEvery is a positive integer`, () => {
      const { majorEvery } = metersForZoom(z);
      expect(majorEvery).toBeGreaterThan(0);
      expect(Number.isInteger(majorEvery)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. MAX_LINES_PER_AXIS constant
// ---------------------------------------------------------------------------

describe('MAX_LINES_PER_AXIS safety cap', () => {
  it('is 240', () => {
    expect(MAX_LINES_PER_AXIS).toBe(240);
  });

  it('step conversion to degrees is non-zero', () => {
    const METERS_PER_DEG_LAT = 111320;
    const { step } = metersForZoom(20);
    const stepLat = step / METERS_PER_DEG_LAT;
    expect(stepLat).toBeGreaterThan(0);
  });

  it('at zoom 0 with step 1000m, latitude span of 1 deg fits within cap', () => {
    // Verify the coarse grid never explodes: 1 deg latitude / (1000/111320) ≈ 111 lines
    const { step } = metersForZoom(0);
    const METERS_PER_DEG_LAT = 111320;
    const stepLat = step / METERS_PER_DEG_LAT;
    const linesFor1DegSpan = Math.ceil(1 / stepLat);
    expect(linesFor1DegSpan).toBeLessThanOrEqual(MAX_LINES_PER_AXIS);
  });

  it('at zoom 20 with step 0.5m, latitude span of 0.001 deg fits within cap', () => {
    // zoom 20 has a very tight viewport; ~0.001 deg latitude span
    const { step } = metersForZoom(20);
    const METERS_PER_DEG_LAT = 111320;
    const stepLat = step / METERS_PER_DEG_LAT;
    const linesForTightSpan = Math.ceil(0.001 / stepLat);
    expect(linesForTightSpan).toBeLessThanOrEqual(MAX_LINES_PER_AXIS);
  });
});

describe('buildGrid', () => {
  it('emits horizontal and vertical line features spanning the viewport bounds', () => {
    const fc = buildGrid(
      fakeMap({ south: 0, north: 0.0001, west: 0, east: 0.0001, zoom: 20 }) as never,
    );

    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features.every((feature) => feature.geometry.type === 'LineString')).toBe(true);
    expect(fc.features.some((feature) => feature.properties?.major === true)).toBe(true);
    expect(fc.features.some((feature) => feature.properties?.major === false)).toBe(true);

    const horizontal = fc.features.find((feature) => {
      const coords = (feature.geometry as GeoJSON.LineString).coordinates;
      return coords[0]![1] === coords[1]![1];
    });
    const vertical = fc.features.find((feature) => {
      const coords = (feature.geometry as GeoJSON.LineString).coordinates;
      return coords[0]![0] === coords[1]![0];
    });
    expect((horizontal!.geometry as GeoJSON.LineString).coordinates[0]![0]).toBe(0);
    expect((horizontal!.geometry as GeoJSON.LineString).coordinates[1]![0]).toBe(0.0001);
    expect((vertical!.geometry as GeoJSON.LineString).coordinates[0]![1]).toBe(0);
    expect((vertical!.geometry as GeoJSON.LineString).coordinates[1]![1]).toBe(0.0001);
  });

  it('snaps grid lines to stable step multiples instead of viewport edges', () => {
    const fc = buildGrid(
      fakeMap({ south: 0.00001, north: 0.00003, west: 0.00001, east: 0.00003, zoom: 18 }) as never,
    );
    const firstHorizontal = fc.features.find((feature) => {
      const coords = (feature.geometry as GeoJSON.LineString).coordinates;
      return coords[0]![1] === coords[1]![1];
    })!;

    const y = (firstHorizontal.geometry as GeoJSON.LineString).coordinates[0]![1];
    expect(y).toBeLessThanOrEqual(0.00001);
  });

  it('caps horizontal and vertical line counts independently', () => {
    const fc = buildGrid(
      fakeMap({ south: -10, north: 10, west: -10, east: 10, zoom: 20 }) as never,
    );
    const horizontalCount = fc.features.filter((feature) => {
      const coords = (feature.geometry as GeoJSON.LineString).coordinates;
      return coords[0]![1] === coords[1]![1];
    }).length;
    const verticalCount = fc.features.length - horizontalCount;

    expect(horizontalCount).toBe(MAX_LINES_PER_AXIS);
    expect(verticalCount).toBe(MAX_LINES_PER_AXIS);
    expect(fc.features).toHaveLength(MAX_LINES_PER_AXIS * 2);
  });

  it('uses latitude cosine when computing longitude spacing', () => {
    const equator = buildGrid(
      fakeMap({ south: -0.0001, north: 0.0001, west: 0, east: 0.001, zoom: 18 }) as never,
    );
    const highLat = buildGrid(
      fakeMap({ south: 59.9999, north: 60.0001, west: 0, east: 0.001, zoom: 18 }) as never,
    );
    const countVertical = (fc: GeoJSON.FeatureCollection) =>
      fc.features.filter((feature) => {
        const coords = (feature.geometry as GeoJSON.LineString).coordinates;
        return coords[0]![0] === coords[1]![0];
      }).length;

    expect(countVertical(highLat)).toBeLessThan(countVertical(equator));
  });
});

describe('grid layer installation', () => {
  it('applyGridLayer is a no-op before map load or when the layer is absent', () => {
    const notLoaded = fakeLayerMap({ loaded: false });
    applyGridLayer(notLoaded.map as never, false, true);
    expect(notLoaded.map.setLayoutProperty).not.toHaveBeenCalled();
    expect(notLoaded.source.setData).not.toHaveBeenCalled();

    const noLayer = fakeLayerMap({ hasLayer: false });
    applyGridLayer(noLayer.map as never, true, true);
    expect(noLayer.map.setLayoutProperty).not.toHaveBeenCalled();
    expect(noLayer.source.setData).not.toHaveBeenCalled();
  });

  it('sets visibility and grid data when enabled', () => {
    const { map, source } = fakeLayerMap();

    applyGridLayer(map as never, true, true);

    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid-line', 'visibility', 'visible');
    expect(source.setData).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FeatureCollection' }),
    );
    expect(
      (source.setData.mock.calls[0]![0] as GeoJSON.FeatureCollection).features.length,
    ).toBeGreaterThan(0);
  });

  it('hides the layer and clears data when disabled', () => {
    const { map, source } = fakeLayerMap();

    applyGridLayer(map as never, true, false);

    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid-line', 'visibility', 'none');
    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
  });

  it('does not fail when the source is missing after layout visibility is applied', () => {
    const { map } = fakeLayerMap({ hasSource: false });

    applyGridLayer(map as never, true, true);

    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid-line', 'visibility', 'visible');
  });

  it('installs viewport listeners only when enabled and removes them on cleanup', () => {
    const { map, mapLoadedRef, source } = fakeLayerMap();

    const cleanup = installGridLayerSync(map as never, mapLoadedRef, true);
    expect(map.on).toHaveBeenCalledWith('moveend', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('zoomend', expect.any(Function));

    source.setData.mockClear();
    map.fire('moveend');
    map.fire('zoomend');
    expect(source.setData).toHaveBeenCalledTimes(2);

    cleanup();
    expect(map.off).toHaveBeenCalledWith('moveend', map.on.mock.calls[0]![1]);
    expect(map.off).toHaveBeenCalledWith('zoomend', map.on.mock.calls[1]![1]);
  });

  it('defers application until load and unregisters the pending load handler', () => {
    const { map, mapLoadedRef, source } = fakeLayerMap({ loaded: false });

    const cleanup = installGridLayerSync(map as never, mapLoadedRef, false);
    expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));
    expect(source.setData).not.toHaveBeenCalled();

    mapLoadedRef.current = true;
    map.fireOnce('load');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid-line', 'visibility', 'none');
    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });

    cleanup();
    expect(map.off).toHaveBeenCalledWith('load', map.once.mock.calls[0]![1]);
  });

  it('skips viewport recompute when the grid source disappears', () => {
    const { map, mapLoadedRef } = fakeLayerMap({ hasSource: false });

    const cleanup = installGridLayerSync(map as never, mapLoadedRef, true);
    expect(() => map.fire('moveend')).not.toThrow();
    cleanup();
  });
});
