/**
 * Unit tests for useHotLayer pure helpers.
 *
 * Private pure functions under test (replicated inline):
 *   samePoint             — identity/coordinate equality for LngLat | null
 *   sameHotRenderState    — full equality check for HotRenderState objects
 *
 * These are used to bail out of RAF-scheduled re-renders when nothing has
 * changed. Correctness is critical: false positives skip necessary renders;
 * false negatives trigger unnecessary GeoJSON pushes.
 */

import { describe, it, expect } from 'vitest';
import type { LngLat } from '@/core/geometry/interpolate';
import type { DragPointType } from '@/types/editor';
import type { MapEntity } from '@/types/entities';
import { samePoint, sameHotRenderState, type HotRenderState } from '../useHotLayer';

// sameHotRenderState only does reference-equality on `entity`, so tests
// use a thin stub cast to MapEntity rather than full entity shape.
const asEntity = (v: unknown): MapEntity => v as MapEntity;

// ---------------------------------------------------------------------------
// samePoint
// ---------------------------------------------------------------------------

describe('samePoint', () => {
  it('null === null returns true', () => {
    expect(samePoint(null, null)).toBe(true);
  });

  it('same reference returns true', () => {
    const pt: LngLat = [1, 2];
    expect(samePoint(pt, pt)).toBe(true);
  });

  it('equal coordinates but different reference returns true', () => {
    expect(samePoint([1.5, 2.5], [1.5, 2.5])).toBe(true);
  });

  it('null vs non-null returns false', () => {
    expect(samePoint(null, [0, 0])).toBe(false);
    expect(samePoint([0, 0], null)).toBe(false);
  });

  it('different x returns false', () => {
    expect(samePoint([1, 2], [3, 2])).toBe(false);
  });

  it('different y returns false', () => {
    expect(samePoint([1, 2], [1, 3])).toBe(false);
  });

  it('handles negative coordinates', () => {
    expect(samePoint([-180, -90], [-180, -90])).toBe(true);
    expect(samePoint([-180, -90], [-180, -91])).toBe(false);
  });

  it('handles zero coordinates', () => {
    expect(samePoint([0, 0], [0, 0])).toBe(true);
    expect(samePoint([0, 0], [0, 0.00001])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sameHotRenderState
// ---------------------------------------------------------------------------

const makeState = (overrides: Partial<HotRenderState> = {}): HotRenderState => ({
  selectedEntityId: 'eid-1',
  entity: asEntity({ id: 'eid-1' }),
  isEditingPoint: false,
  dragPointIndex: -1,
  dragPointType: 'vertex' as DragPointType,
  dragCurrentPoint: null,
  dragAltKey: false,
  canRenderEntity: true,
  ...overrides,
});

describe('sameHotRenderState', () => {
  it('returns false when a is null', () => {
    expect(sameHotRenderState(null, makeState())).toBe(false);
  });

  it('returns true for identical states', () => {
    const s = makeState();
    expect(sameHotRenderState(s, s)).toBe(true);
  });

  it('returns true for structurally equal states with same entity reference', () => {
    const entity = asEntity({ id: 'eid' });
    const a = makeState({ entity });
    const b = makeState({ entity });
    expect(sameHotRenderState(a, b)).toBe(true);
  });

  it('returns false when selectedEntityId differs', () => {
    expect(
      sameHotRenderState(
        makeState({ selectedEntityId: 'a' }),
        makeState({ selectedEntityId: 'b' }),
      ),
    ).toBe(false);
  });

  it('returns false when entity reference differs', () => {
    const a = makeState({ entity: asEntity({ id: 'x' }) });
    const b = makeState({ entity: asEntity({ id: 'x' }) }); // different object
    expect(sameHotRenderState(a, b)).toBe(false);
  });

  it('returns false when isEditingPoint differs', () => {
    const a = makeState({ isEditingPoint: true });
    const b = makeState({ isEditingPoint: false });
    expect(sameHotRenderState(a, b)).toBe(false);
  });

  it('returns false when dragPointIndex differs', () => {
    const a = makeState({ dragPointIndex: 0 });
    const b = makeState({ dragPointIndex: 1 });
    expect(sameHotRenderState(a, b)).toBe(false);
  });

  it('returns false when dragPointType differs', () => {
    const a = makeState({ dragPointType: 'vertex' as DragPointType });
    const b = makeState({ dragPointType: 'handle' as DragPointType });
    expect(sameHotRenderState(a, b)).toBe(false);
  });

  it('returns false when dragAltKey differs', () => {
    const a = makeState({ dragAltKey: true });
    const b = makeState({ dragAltKey: false });
    expect(sameHotRenderState(a, b)).toBe(false);
  });

  it('returns false when layer render guard differs', () => {
    const entity = asEntity({});
    const a = makeState({ entity, canRenderEntity: true });
    const b = makeState({ entity, canRenderEntity: false });
    expect(sameHotRenderState(a, b)).toBe(false);
  });

  it('returns false when dragCurrentPoint coordinates differ', () => {
    const a = makeState({ dragCurrentPoint: [1, 2] });
    const b = makeState({ dragCurrentPoint: [3, 4] });
    expect(sameHotRenderState(a, b)).toBe(false);
  });

  it('returns true when dragCurrentPoint coordinates are equal', () => {
    const entity = asEntity({});
    const a = makeState({ entity, dragCurrentPoint: [10, 20] });
    const b = makeState({ entity, dragCurrentPoint: [10, 20] });
    expect(sameHotRenderState(a, b)).toBe(true);
  });

  it('returns false when one dragCurrentPoint is null', () => {
    const entity = asEntity({});
    const a = makeState({ entity, dragCurrentPoint: null });
    const b = makeState({ entity, dragCurrentPoint: [0, 0] });
    expect(sameHotRenderState(a, b)).toBe(false);
  });

  it('null selectedEntityId in both is treated as equal', () => {
    const entity = asEntity({});
    const a = makeState({ entity, selectedEntityId: null });
    const b = makeState({ entity, selectedEntityId: null });
    expect(sameHotRenderState(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sameHotRenderState — memoization contract
// (consecutive identical renders should be skipped)
// ---------------------------------------------------------------------------

describe('memoization contract', () => {
  it('second render with identical state is skipped', () => {
    const entity = asEntity({ id: 'e1' });
    let renderCount = 0;
    let lastState: HotRenderState | null = null;

    const renderHot = (state: HotRenderState) => {
      if (sameHotRenderState(lastState, state)) return; // bail
      lastState = state;
      renderCount++;
    };

    const s = makeState({ entity });
    renderHot(s);
    renderHot(s); // identical reference — should be skipped
    expect(renderCount).toBe(1);
  });

  it('render fires again when entity reference changes', () => {
    let renderCount = 0;
    let lastState: HotRenderState | null = null;

    const renderHot = (state: HotRenderState) => {
      if (sameHotRenderState(lastState, state)) return;
      lastState = state;
      renderCount++;
    };

    renderHot(makeState({ entity: asEntity({ id: 'v1' }) }));
    renderHot(makeState({ entity: asEntity({ id: 'v2' }) })); // new entity ref
    expect(renderCount).toBe(2);
  });
});
