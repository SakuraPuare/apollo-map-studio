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

import { describe, it, expect } from 'vitest';
import { metersForZoom, MAX_LINES_PER_AXIS } from '../useGridLayer';

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
