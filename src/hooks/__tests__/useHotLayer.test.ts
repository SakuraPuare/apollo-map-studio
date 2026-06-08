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

import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { LngLat } from '@/core/geometry/interpolate';
import type { DragPointType } from '@/types/editor';
import type { MapEntity, PolylineEntity } from '@/types/entities';
import {
  hotDisplayEntity,
  hotRenderStateFromSnapshot,
  installHotLayer,
  renderHotFrame,
  samePoint,
  sameHotRenderState,
  type HotRenderState,
} from '../useHotLayer';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';

// sameHotRenderState only does reference-equality on `entity`, so tests
// use a thin stub cast to MapEntity rather than full entity shape.
const asEntity = (v: unknown): MapEntity => v as MapEntity;
const initialUIState = useUIStore.getState();

class FakeGeoJSONSource {
  setData = vi.fn();
}

function polyline(id = 'line-1'): PolylineEntity {
  return {
    id,
    entityType: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  };
}

interface SnapshotOptions {
  value?: string;
  selectedEntityId?: string | null;
  dragPointIndex?: number;
  dragPointType?: DragPointType;
  dragCurrentPoint?: LngLat | null;
  dragAltKey?: boolean;
}

function snapshot({
  value = 'selected',
  selectedEntityId = 'line-1',
  dragPointIndex = -1,
  dragPointType = 'vertex' as DragPointType,
  dragCurrentPoint = null as LngLat | null,
  dragAltKey = false,
}: SnapshotOptions = {}) {
  return {
    value,
    context: {
      selectedEntityId,
      dragPointIndex,
      dragPointType,
      dragCurrentPoint,
      dragAltKey,
    },
  };
}

function actorRef(snap: ReturnType<typeof snapshot>) {
  return { getSnapshot: vi.fn(() => snap) };
}

function subscribableActor(snap: ReturnType<typeof snapshot>) {
  const listeners: Array<() => void> = [];
  const subscription = { unsubscribe: vi.fn() };
  return {
    getSnapshot: vi.fn(() => snap),
    subscribe: vi.fn((listener: () => void) => {
      listeners.push(listener);
      return subscription;
    }),
    emit() {
      for (const listener of listeners) listener();
    },
    subscription,
  };
}

function mapWithSource(source: FakeGeoJSONSource | null = new FakeGeoJSONSource()) {
  return {
    getSource: vi.fn((id: string) => (id === 'hot' ? source : undefined)),
    once: vi.fn(),
    off: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState(initialUIState, true);
});

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

describe('hot layer frame rendering', () => {
  it('derives render state from the selected entity and layer interactivity', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });

    const state = hotRenderStateFromSnapshot(
      snapshot({ value: 'editingPoint', dragPointIndex: 1, dragCurrentPoint: [5, 6] }) as never,
    );

    expect(state).toMatchObject({
      selectedEntityId: entity.id,
      entity,
      isEditingPoint: true,
      dragPointIndex: 1,
      dragCurrentPoint: [5, 6],
      canRenderEntity: true,
    });

    useUIStore.getState().setLayerLocked('polyline', true);
    expect(hotRenderStateFromSnapshot(snapshot() as never).canRenderEntity).toBe(false);
  });

  it('renders selected hot geometry to the source', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const source = new FakeGeoJSONSource();

    const next = renderHotFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actorRef(snapshot()) as never,
      lastRenderState: null,
    });

    expect(next?.entity).toBe(entity);
    expect(source.setData).toHaveBeenCalledWith({
      type: 'FeatureCollection',
      features: expect.arrayContaining([
        expect.objectContaining({ geometry: expect.objectContaining({ type: 'LineString' }) }),
      ]),
    });
  });

  it('clears source when there is no selected renderable entity', () => {
    const source = new FakeGeoJSONSource();

    renderHotFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actorRef(snapshot({ selectedEntityId: null })) as never,
      lastRenderState: null,
    });

    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });

    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    useUIStore.getState().setLayerVisible('polyline', false);
    source.setData.mockClear();

    renderHotFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actorRef(snapshot()) as never,
      lastRenderState: null,
    });

    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
  });

  it('renders drag preview geometry while editing a vertex', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const editingState = hotRenderStateFromSnapshot(
      snapshot({
        value: 'editingPoint',
        dragPointIndex: 1,
        dragPointType: 'vertex',
        dragCurrentPoint: [9, 9],
      }) as never,
    );

    const display = hotDisplayEntity(editingState) as PolylineEntity;

    expect(display.points[1]).toEqual({ x: 9, y: 9 });
    expect(entity.points[1]).toEqual({ x: 1, y: 0 });

    const source = new FakeGeoJSONSource();
    renderHotFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actorRef(
        snapshot({
          value: 'editingPoint',
          dragPointIndex: 1,
          dragPointType: 'vertex',
          dragCurrentPoint: [9, 9],
        }),
      ) as never,
      lastRenderState: null,
    });

    const fc = source.setData.mock.calls[0]![0] as GeoJSON.FeatureCollection;
    const line = fc.features.find((feature) => feature.geometry.type === 'LineString')!;
    expect((line.geometry as GeoJSON.LineString).coordinates).toContainEqual([9, 9]);
  });

  it('skips source writes when unloaded, source is missing, or state is unchanged', () => {
    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const source = new FakeGeoJSONSource();
    const actor = actorRef(snapshot());

    expect(
      renderHotFrame({
        map: mapWithSource(source) as never,
        mapLoaded: false,
        actorRef: actor as never,
        lastRenderState: null,
      }),
    ).toBeNull();
    expect(source.setData).not.toHaveBeenCalled();

    expect(
      renderHotFrame({
        map: mapWithSource(null) as never,
        mapLoaded: true,
        actorRef: actor as never,
        lastRenderState: null,
      }),
    ).toBeNull();

    const rendered = renderHotFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actor as never,
      lastRenderState: null,
    });
    source.setData.mockClear();

    const skipped = renderHotFrame({
      map: mapWithSource(source) as never,
      mapLoaded: true,
      actorRef: actor as never,
      lastRenderState: rendered,
    });

    expect(skipped).toBe(rendered);
    expect(source.setData).not.toHaveBeenCalled();
  });
});

describe('installHotLayer', () => {
  it('schedules loaded renders, dedupes pending frames, responds to subscriptions, and cleans up', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const cancelAnimationFrameSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);

    const entity = polyline();
    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    const source = new FakeGeoJSONSource();
    const map = mapWithSource(source);
    const actor = subscribableActor(snapshot());

    const cleanup = installHotLayer(map as never, { current: true }, actor as never);

    expect(actor.subscribe).toHaveBeenCalledTimes(1);
    expect(rafCallbacks).toHaveLength(1);

    actor.emit();
    expect(rafCallbacks).toHaveLength(1);

    rafCallbacks[0]!(0);
    expect(source.setData).toHaveBeenCalledTimes(1);

    useMapStore.setState({ entities: new Map([[entity.id, entity]]) });
    expect(rafCallbacks).toHaveLength(2);

    cleanup();

    expect(actor.subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(map.off).toHaveBeenCalledWith('load', expect.any(Function));
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(2);
  });

  it('waits for map load when not loaded and schedules on layer visibility changes', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const source = new FakeGeoJSONSource();
    const map = mapWithSource(source);
    const actor = subscribableActor(snapshot({ selectedEntityId: null }));
    const mapLoadedRef = { current: false };

    const cleanup = installHotLayer(map as never, mapLoadedRef, actor as never);

    expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));
    expect(rafCallbacks).toHaveLength(0);

    mapLoadedRef.current = true;
    const onLoad = map.once.mock.calls[0]![1] as () => void;
    onLoad();
    expect(rafCallbacks).toHaveLength(1);
    rafCallbacks[0]!(0);
    expect(source.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });

    useUIStore.getState().setLayerLocked('polyline', true);
    expect(rafCallbacks).toHaveLength(2);

    cleanup();
  });
});
