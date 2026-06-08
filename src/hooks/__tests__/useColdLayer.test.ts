/**
 * Unit tests for useColdLayer pure helper logic.
 *
 * The hook has several private pure functions that have no side-effects and
 * can be tested without MapLibre or any store. We replicate them verbatim
 * here (same strategy as undoCancel.test.ts).
 *
 * Functions under test:
 *   groupFeaturesByEntity  — group a flat feature array into per-entity buckets
 *   flattenEntityFeatures  — flatten bucketed cache back to a FeatureCollection
 *   diffEntities           — compute added/updated/removed between two snapshots
 *   hasEntityChanges       — true when diff has any change
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type * as ReactModule from 'react';
import type { SerializedEntity } from '@/core/workers/protocol';
import {
  __coldLayerInternals,
  groupFeaturesByEntity,
  groupsToFeatureMap,
  flattenEntityFeatures,
  rebuildColdSourceFromCache,
  applyColdDeltaToSource,
  diffEntities,
  hasEntityChanges,
  hasColdRenderSettingsChanged,
} from '../useColdLayer';
import { filterVisibleEntities, selectedInteractiveEntityId } from '@/lib/layerState';
import { useSettingsStore } from '@/store/settingsStore';
import { useMapStore } from '@/store/mapStore';
import { useUIStore } from '@/store/uiStore';
import { useTaskProgressStore } from '@/store/taskProgressStore';

type _EntitySnapshot = Map<string, SerializedEntity>;

// ---------------------------------------------------------------------------
// Helper: make a minimal GeoJSON feature with properties.id
// ---------------------------------------------------------------------------
function makeFeature(id: string, idx = 0): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: { id },
    geometry: { type: 'Point', coordinates: [idx, 0] },
  };
}

// ---------------------------------------------------------------------------
// Helper: make a minimal SerializedEntity stub
// ---------------------------------------------------------------------------
function makeEntity(id: string, entityType = 'polyline'): SerializedEntity {
  return { id, entityType, points: [] } as SerializedEntity;
}

class FakeGeoJSONSource {
  setDataCalls: unknown[][] = [];
  updateDataCalls: unknown[][] = [];

  setData(...args: unknown[]) {
    this.setDataCalls.push(args);
    return this;
  }

  updateData(...args: unknown[]) {
    this.updateDataCalls.push(args);
    return this;
  }
}

const initialUIState = useUIStore.getState();
const initialSettingsState = useSettingsStore.getState();

function refs() {
  return {
    prevEntitiesRef: { current: null as Map<string, SerializedEntity> | null },
    syncFrameRef: { current: null },
    syncVersionRef: { current: 0 },
    selectedEntityIdRef: { current: null },
    entityFeatureCacheRef: { current: new Map<string, GeoJSON.Feature[]>() },
  };
}

function context({
  source = new FakeGeoJSONSource(),
  bridgeSend = vi.fn(),
  mapLoaded = true,
  cancelled = false,
  coldRefs = refs(),
}: {
  source?: FakeGeoJSONSource;
  bridgeSend?: ReturnType<typeof vi.fn>;
  mapLoaded?: boolean;
  cancelled?: boolean;
  coldRefs?: ReturnType<typeof refs>;
} = {}) {
  const map = {
    getSource: vi.fn((id: string) => (id === 'cold' ? source : undefined)),
    getLayer: vi.fn(() => true),
    setFilter: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
  };
  return {
    context: {
      map,
      bridge: { send: bridgeSend },
      mapLoadedRef: { current: mapLoaded },
      refs: coldRefs,
      isCancelled: () => cancelled,
    },
    map,
    source,
    bridgeSend,
    refs: coldRefs,
  };
}

function actorStub(selectedEntityId: string | null = null) {
  const listeners: Array<() => void> = [];
  return {
    getSnapshot: vi.fn(() => ({ context: { selectedEntityId } })),
    subscribe: vi.fn((listener: () => void) => {
      listeners.push(listener);
      return { unsubscribe: vi.fn() };
    }),
    emit() {
      for (const listener of listeners) listener();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState(initialUIState, true);
  useSettingsStore.setState(initialSettingsState, true);
  useTaskProgressStore.setState({ activeTask: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useMapStore.setState({ entities: new Map() });
  useMapStore.temporal.getState().clear();
  useUIStore.setState(initialUIState, true);
  useSettingsStore.setState(initialSettingsState, true);
  useTaskProgressStore.setState({ activeTask: null });
});

// ---------------------------------------------------------------------------
// groupFeaturesByEntity
// ---------------------------------------------------------------------------

describe('groupFeaturesByEntity', () => {
  it('returns empty map for empty array', () => {
    const result = groupFeaturesByEntity([]);
    expect(result.size).toBe(0);
  });

  it('groups features by properties.id', () => {
    const f1 = makeFeature('lane-1', 0);
    const f2 = makeFeature('lane-1', 1);
    const f3 = makeFeature('lane-2', 2);
    const buckets = groupFeaturesByEntity([f1, f2, f3]);
    expect(buckets.size).toBe(2);
    expect(buckets.get('lane-1')).toHaveLength(2);
    expect(buckets.get('lane-2')).toHaveLength(1);
  });

  it('places features with no id under __unkeyed', () => {
    const noId: GeoJSON.Feature = {
      type: 'Feature',
      properties: null,
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    const buckets = groupFeaturesByEntity([noId]);
    expect(buckets.get('__unkeyed')).toHaveLength(1);
  });

  it('places features with non-string id under __unkeyed', () => {
    const numId: GeoJSON.Feature = {
      type: 'Feature',
      properties: { id: 42 },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    const buckets = groupFeaturesByEntity([numId]);
    expect(buckets.get('__unkeyed')).toHaveLength(1);
  });

  it('preserves feature order within a bucket', () => {
    const f1 = makeFeature('eid', 0);
    const f2 = makeFeature('eid', 1);
    const f3 = makeFeature('eid', 2);
    const buckets = groupFeaturesByEntity([f1, f2, f3]);
    expect(buckets.get('eid')).toEqual([f1, f2, f3]);
  });

  it('handles single feature', () => {
    const f = makeFeature('solo');
    const buckets = groupFeaturesByEntity([f]);
    expect(buckets.get('solo')).toHaveLength(1);
    expect(buckets.get('solo')![0]).toBe(f);
  });
});

// ---------------------------------------------------------------------------
// flattenEntityFeatures
// ---------------------------------------------------------------------------

describe('flattenEntityFeatures', () => {
  it('returns empty FeatureCollection for empty cache', () => {
    const fc = flattenEntityFeatures(new Map());
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(0);
  });

  it('flattens all buckets into a single features array', () => {
    const cache = new Map<string, GeoJSON.Feature[]>([
      ['a', [makeFeature('a', 0), makeFeature('a', 1)]],
      ['b', [makeFeature('b', 2)]],
    ]);
    const fc = flattenEntityFeatures(cache);
    expect(fc.features).toHaveLength(3);
  });

  it('round-trips with groupFeaturesByEntity', () => {
    const origFeatures = [makeFeature('x', 0), makeFeature('y', 1), makeFeature('x', 2)];
    const cache = groupFeaturesByEntity(origFeatures);
    const fc = flattenEntityFeatures(cache);
    // Order may differ between groups, but total count matches.
    expect(fc.features).toHaveLength(origFeatures.length);
  });
});

describe('groupsToFeatureMap', () => {
  it('converts worker feature groups into cache buckets', () => {
    const a = makeFeature('a');
    const b = makeFeature('b');

    const cache = groupsToFeatureMap([
      { id: 'a', features: [a] },
      { id: 'b', features: [b] },
    ]);

    expect([...cache.keys()]).toEqual(['a', 'b']);
    expect(cache.get('a')).toEqual([a]);
    expect(cache.get('b')).toEqual([b]);
  });

  it('last duplicate worker group wins, matching Map#set semantics', () => {
    const first = makeFeature('same', 1);
    const second = makeFeature('same', 2);

    const cache = groupsToFeatureMap([
      { id: 'same', features: [first] },
      { id: 'same', features: [second] },
    ]);

    expect(cache.get('same')).toEqual([second]);
  });
});

describe('cold source update helpers', () => {
  it('rebuildColdSourceFromCache clears source, promotes feature ids, and chunks large adds', async () => {
    const source = new FakeGeoJSONSource();
    const features = Array.from({ length: 4001 }, (_, i) => ({
      type: 'Feature' as const,
      id: `feature-${i}`,
      properties: { id: 'entity-1' },
      geometry: { type: 'Point' as const, coordinates: [i, 0] },
    }));
    const cache = new Map<string, GeoJSON.Feature[]>([['entity-1', features]]);

    await rebuildColdSourceFromCache(source as never, cache);

    expect(source.setDataCalls).toHaveLength(1);
    expect(source.setDataCalls[0]![0]).toEqual({ type: 'FeatureCollection', features: [] });
    expect(source.setDataCalls[0]![1]).toBe(true);
    expect(source.updateDataCalls).toHaveLength(2);
    expect((source.updateDataCalls[0]![0] as { add: GeoJSON.Feature[] }).add).toHaveLength(4000);
    expect((source.updateDataCalls[1]![0] as { add: GeoJSON.Feature[] }).add).toHaveLength(1);
    expect(
      (source.updateDataCalls[0]![0] as { add: GeoJSON.Feature[] }).add[0]!.properties,
    ).toMatchObject({ id: 'entity-1', featureId: 'feature-0' });
    expect(source.updateDataCalls.every((call) => call[1] === true)).toBe(true);
  });

  it('rebuildColdSourceFromCache does not emit an empty trailing chunk', async () => {
    const source = new FakeGeoJSONSource();
    const features = Array.from({ length: 4000 }, (_, i) => ({
      type: 'Feature' as const,
      id: `feature-${i}`,
      properties: { id: 'entity-1' },
      geometry: { type: 'Point' as const, coordinates: [i, 0] },
    }));

    await rebuildColdSourceFromCache(
      source as never,
      new Map<string, GeoJSON.Feature[]>([['entity-1', features]]),
    );

    expect(source.setDataCalls).toHaveLength(1);
    expect(source.updateDataCalls).toHaveLength(1);
    expect((source.updateDataCalls[0]![0] as { add: GeoJSON.Feature[] }).add).toHaveLength(4000);
  });

  it('applyColdDeltaToSource removes previous promoted ids and adds changed features', async () => {
    const source = new FakeGeoJSONSource();
    const previous: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        id: 'old-shape',
        properties: { id: 'entity-1' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
      {
        type: 'Feature',
        properties: { id: 'entity-1', featureId: 'promoted-old' },
        geometry: { type: 'Point', coordinates: [1, 0] },
      },
      {
        type: 'Feature',
        properties: { id: 'entity-1' },
        geometry: { type: 'Point', coordinates: [2, 0] },
      },
    ];
    const next: GeoJSON.Feature = {
      type: 'Feature',
      id: 'new-shape',
      properties: { id: 'entity-1' },
      geometry: { type: 'Point', coordinates: [3, 0] },
    };

    await applyColdDeltaToSource(source as never, previous, [{ id: 'entity-1', features: [next] }]);

    expect(source.updateDataCalls).toHaveLength(2);
    expect(source.updateDataCalls[0]).toEqual([{ remove: ['old-shape', 'promoted-old'] }, true]);
    expect(source.updateDataCalls[1]![1]).toBe(true);
    expect((source.updateDataCalls[1]![0] as { add: GeoJSON.Feature[] }).add).toEqual([
      { ...next, properties: { id: 'entity-1', featureId: 'new-shape' } },
    ]);
  });

  it('applyColdDeltaToSource only adds when previous features have no removable ids', async () => {
    const source = new FakeGeoJSONSource();
    const previous: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        properties: { id: 'entity-1' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ];

    await applyColdDeltaToSource(source as never, previous, []);

    expect(source.updateDataCalls).toEqual([]);
  });

  it('applyColdDeltaToSource chunks large changed feature adds', async () => {
    const source = new FakeGeoJSONSource();
    const features = Array.from({ length: 4001 }, (_, i) => ({
      type: 'Feature' as const,
      id: `next-${i}`,
      properties: { id: 'entity-1' },
      geometry: { type: 'Point' as const, coordinates: [i, 0] },
    }));

    await applyColdDeltaToSource(source as never, [], [{ id: 'entity-1', features }]);

    expect(source.updateDataCalls).toHaveLength(2);
    expect((source.updateDataCalls[0]![0] as { add: GeoJSON.Feature[] }).add).toHaveLength(4000);
    expect((source.updateDataCalls[1]![0] as { add: GeoJSON.Feature[] }).add).toHaveLength(1);
    expect(source.updateDataCalls.every((call) => call[1] === true)).toBe(true);
  });
});

describe('cold layer sync internals', () => {
  it('applyColdSelectionFilter updates every existing cold layer filter', () => {
    const { map } = context();
    map.getLayer.mockImplementation((id?: string) => id !== 'cold-labels');

    __coldLayerInternals.applyColdSelectionFilter(map as never, 'lane-1');

    expect(map.setFilter).toHaveBeenCalled();
    expect(map.setFilter).not.toHaveBeenCalledWith('cold-labels', expect.anything());
    expect(map.setFilter).toHaveBeenCalledWith('cold-fill', expect.anything());
  });

  it('syncAllColdFeatures sends all entities, caches worker groups, and clears progress', async () => {
    const feature = makeFeature('lane-1');
    const entity = makeEntity('lane-1', 'lane');
    const {
      context: ctx,
      source,
      bridgeSend,
    } = context({
      bridgeSend: vi.fn().mockResolvedValue({
        type: 'COLD_READY',
        groups: [{ id: 'lane-1', features: [feature] }],
        featureCollection: { type: 'FeatureCollection', features: [feature] },
      }),
    });

    await __coldLayerInternals.syncAllColdFeatures(
      ctx as never,
      source as never,
      new Map([[entity.id, entity]]),
      0,
    );

    expect(bridgeSend).toHaveBeenCalledWith({ type: 'SYNC', entities: [entity] });
    expect(ctx.refs.entityFeatureCacheRef.current.get('lane-1')).toEqual([feature]);
    expect(source.setDataCalls).toEqual([
      [{ type: 'FeatureCollection', features: [feature] }, true],
    ]);
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
  });

  it('syncAllColdFeatures ignores stale worker responses after version changes', async () => {
    const feature = makeFeature('lane-1');
    const { context: ctx, source } = context({
      bridgeSend: vi.fn().mockResolvedValue({
        type: 'COLD_READY',
        groups: [{ id: 'lane-1', features: [feature] }],
      }),
    });
    ctx.refs.syncVersionRef.current = 2;

    await __coldLayerInternals.syncAllColdFeatures(
      ctx as never,
      source as never,
      new Map([['lane-1', makeEntity('lane-1', 'lane')]]),
      1,
    );

    expect(ctx.refs.entityFeatureCacheRef.current.size).toBe(0);
    expect(source.setDataCalls).toEqual([]);
    expect(source.updateDataCalls).toEqual([]);
  });

  it('syncAllColdFeatures ignores cancelled, non-ready, and failed worker responses', async () => {
    const feature = makeFeature('lane-1');
    const cancelledCase = context({
      cancelled: true,
      bridgeSend: vi.fn().mockResolvedValue({
        type: 'COLD_READY',
        groups: [{ id: 'lane-1', features: [feature] }],
      }),
    });

    await __coldLayerInternals.syncAllColdFeatures(
      cancelledCase.context as never,
      cancelledCase.source as never,
      new Map([['lane-1', makeEntity('lane-1', 'lane')]]),
      0,
    );

    expect(cancelledCase.context.refs.entityFeatureCacheRef.current.size).toBe(0);
    expect(cancelledCase.source.setDataCalls).toEqual([]);

    const nonReadyCase = context({
      bridgeSend: vi.fn().mockResolvedValue({ type: 'COLD_DELTA', removed: [], changed: [] }),
    });
    await __coldLayerInternals.syncAllColdFeatures(
      nonReadyCase.context as never,
      nonReadyCase.source as never,
      new Map(),
      0,
    );
    expect(nonReadyCase.source.setDataCalls).toEqual([]);

    const failedCase = context({ bridgeSend: vi.fn().mockRejectedValue(new Error('offline')) });
    await __coldLayerInternals.syncAllColdFeatures(
      failedCase.context as never,
      failedCase.source as never,
      new Map([['lane-1', makeEntity('lane-1', 'lane')]]),
      0,
    );
    expect(failedCase.source.setDataCalls).toEqual([]);
    expect(useTaskProgressStore.getState().activeTask).toBeNull();
  });

  it('applyColdDeltaResult removes cached old features and adds changed groups', async () => {
    const previous = {
      type: 'Feature' as const,
      id: 'old-feature',
      properties: { id: 'lane-1' },
      geometry: { type: 'Point' as const, coordinates: [0, 0] },
    };
    const next = {
      type: 'Feature' as const,
      id: 'new-feature',
      properties: { id: 'lane-1' },
      geometry: { type: 'Point' as const, coordinates: [1, 0] },
    };
    const { context: ctx, source } = context();
    ctx.refs.entityFeatureCacheRef.current.set('lane-1', [previous]);

    await __coldLayerInternals.applyColdDeltaResult(ctx as never, source as never, {
      type: 'COLD_DELTA',
      requestId: 'delta-1',
      removed: ['removed-lane'],
      changed: [{ id: 'lane-1', features: [next] }],
    });

    expect(ctx.refs.entityFeatureCacheRef.current.get('lane-1')).toEqual([next]);
    expect(source.updateDataCalls[0]).toEqual([{ remove: ['old-feature'] }, true]);
    expect((source.updateDataCalls[1]![0] as { add: GeoJSON.Feature[] }).add[0]).toMatchObject({
      properties: { id: 'lane-1', featureId: 'new-feature' },
    });
  });

  it('applyColdReadyResult uses featureCollection snapshots without rebuilding chunks', async () => {
    const feature = {
      type: 'Feature' as const,
      id: 'ready-feature',
      properties: { id: 'lane-2' },
      geometry: { type: 'Point' as const, coordinates: [2, 0] },
    };
    const { context: ctx, source } = context();
    ctx.refs.entityFeatureCacheRef.current.set('stale-lane', [makeFeature('stale-lane')]);

    await __coldLayerInternals.applyColdReadyResult(ctx as never, source as never, {
      type: 'COLD_READY',
      requestId: 'ready-1',
      groups: [{ id: 'lane-2', features: [feature] }],
      featureCollection: { type: 'FeatureCollection', features: [feature] },
    });

    expect([...ctx.refs.entityFeatureCacheRef.current.keys()]).toEqual(['lane-2']);
    expect(source.setDataCalls).toEqual([
      [
        {
          type: 'FeatureCollection',
          features: [{ ...feature, properties: { id: 'lane-2', featureId: 'ready-feature' } }],
        },
        true,
      ],
    ]);
    expect(source.updateDataCalls).toEqual([]);
  });

  it('applyIncrementalColdSync applies delta responses and ignores stale, unknown, or failed responses', async () => {
    const oldFeature = {
      type: 'Feature' as const,
      id: 'old-feature',
      properties: { id: 'lane-1' },
      geometry: { type: 'Point' as const, coordinates: [0, 0] },
    };
    const nextFeature = {
      type: 'Feature' as const,
      id: 'next-feature',
      properties: { id: 'lane-1' },
      geometry: { type: 'Point' as const, coordinates: [1, 0] },
    };
    const deltaCase = context({
      bridgeSend: vi.fn().mockResolvedValue({
        type: 'COLD_DELTA',
        removed: [],
        changed: [{ id: 'lane-1', features: [nextFeature] }],
      }),
    });
    deltaCase.context.refs.entityFeatureCacheRef.current.set('lane-1', [oldFeature]);

    await __coldLayerInternals.applyIncrementalColdSync(
      deltaCase.context as never,
      deltaCase.source as never,
      { added: [], updated: [makeEntity('lane-1', 'lane')], removed: [] },
      0,
    );

    expect(deltaCase.context.refs.entityFeatureCacheRef.current.get('lane-1')).toEqual([
      nextFeature,
    ]);
    expect(deltaCase.source.updateDataCalls).toHaveLength(2);

    const staleCase = context({
      bridgeSend: vi.fn().mockResolvedValue({
        type: 'COLD_DELTA',
        removed: [],
        changed: [{ id: 'lane-1', features: [nextFeature] }],
      }),
    });
    staleCase.context.refs.syncVersionRef.current = 2;
    await __coldLayerInternals.applyIncrementalColdSync(
      staleCase.context as never,
      staleCase.source as never,
      { added: [], updated: [], removed: ['lane-1'] },
      1,
    );
    expect(staleCase.source.updateDataCalls).toEqual([]);

    const unknownCase = context({ bridgeSend: vi.fn().mockResolvedValue({ type: 'NOOP' }) });
    await __coldLayerInternals.applyIncrementalColdSync(
      unknownCase.context as never,
      unknownCase.source as never,
      { added: [], updated: [], removed: [] },
      0,
    );
    expect(unknownCase.source.setDataCalls).toEqual([]);
    expect(unknownCase.source.updateDataCalls).toEqual([]);

    const failedCase = context({ bridgeSend: vi.fn().mockRejectedValue(new Error('offline')) });
    await __coldLayerInternals.applyIncrementalColdSync(
      failedCase.context as never,
      failedCase.source as never,
      { added: [], updated: [], removed: [] },
      0,
    );
    expect(failedCase.source.updateDataCalls).toEqual([]);
  });

  it('applyIncrementalColdSync ignores worker responses after cancellation', async () => {
    const feature = makeFeature('lane-1');
    const cancelledCase = context({
      cancelled: true,
      bridgeSend: vi.fn().mockResolvedValue({
        type: 'COLD_READY',
        groups: [{ id: 'lane-1', features: [feature] }],
        featureCollection: { type: 'FeatureCollection', features: [feature] },
      }),
    });

    await __coldLayerInternals.applyIncrementalColdSync(
      cancelledCase.context as never,
      cancelledCase.source as never,
      { added: [makeEntity('lane-1', 'lane')], updated: [], removed: [] },
      0,
    );

    expect(cancelledCase.context.refs.entityFeatureCacheRef.current.size).toBe(0);
    expect(cancelledCase.source.setDataCalls).toEqual([]);
    expect(cancelledCase.source.updateDataCalls).toEqual([]);
  });

  it('applyIncrementalColdSync handles COLD_READY fallback responses', async () => {
    const feature = makeFeature('lane-2');
    const {
      context: ctx,
      source,
      bridgeSend,
    } = context({
      bridgeSend: vi.fn().mockResolvedValue({
        type: 'COLD_READY',
        groups: [{ id: 'lane-2', features: [feature] }],
      }),
    });
    const added = makeEntity('lane-2', 'lane');

    await __coldLayerInternals.applyIncrementalColdSync(
      ctx as never,
      source as never,
      { added: [added], updated: [], removed: [] },
      0,
    );

    expect(bridgeSend).toHaveBeenCalledWith({
      type: 'INCREMENTAL',
      added: [added],
      updated: [],
      removed: [],
    });
    expect(ctx.refs.entityFeatureCacheRef.current.get('lane-2')).toEqual([feature]);
    expect(source.setDataCalls[0]).toEqual([{ type: 'FeatureCollection', features: [] }, true]);
    expect(source.updateDataCalls[0]).toEqual([{ add: [feature] }, true]);
  });

  it('syncColdLayer returns early when unloaded, source is missing, or entities are unchanged', async () => {
    const lane = makeEntity('lane-1', 'lane');

    const unloaded = context({ mapLoaded: false });
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    __coldLayerInternals.syncColdLayer(unloaded.context as never);
    await Promise.resolve();
    expect(unloaded.bridgeSend).not.toHaveBeenCalled();
    expect(unloaded.context.refs.syncFrameRef.current).toBeNull();

    const missingSource = context();
    missingSource.map.getSource.mockReturnValue(undefined);
    __coldLayerInternals.syncColdLayer(missingSource.context as never);
    await Promise.resolve();
    expect(missingSource.bridgeSend).not.toHaveBeenCalled();

    const unchanged = context({
      bridgeSend: vi.fn().mockResolvedValue({ type: 'COLD_READY', groups: [] }),
    });
    unchanged.context.refs.prevEntitiesRef.current = new Map([[lane.id, lane]]);
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    __coldLayerInternals.syncColdLayer(unchanged.context as never);
    await Promise.resolve();
    expect(unchanged.bridgeSend).not.toHaveBeenCalled();
  });

  it('syncColdLayer performs first full sync and later incremental sync', async () => {
    const lane1 = makeEntity('lane-1', 'lane');
    const lane2 = makeEntity('lane-2', 'lane');
    const { context: ctx, bridgeSend } = context({
      bridgeSend: vi
        .fn()
        .mockResolvedValueOnce({
          type: 'COLD_READY',
          groups: [{ id: 'lane-1', features: [makeFeature('lane-1')] }],
          featureCollection: { type: 'FeatureCollection', features: [] },
        })
        .mockResolvedValueOnce({
          type: 'COLD_DELTA',
          removed: [],
          changed: [{ id: 'lane-2', features: [makeFeature('lane-2')] }],
        }),
    });

    useMapStore.setState({ entities: new Map([[lane1.id, lane1]]) });
    __coldLayerInternals.syncColdLayer(ctx as never);
    await Promise.resolve();

    useMapStore.setState({
      entities: new Map([
        [lane1.id, lane1],
        [lane2.id, lane2],
      ]),
    });
    __coldLayerInternals.syncColdLayer(ctx as never);
    await Promise.resolve();

    expect(bridgeSend).toHaveBeenNthCalledWith(1, { type: 'SYNC', entities: [lane1] });
    expect(bridgeSend).toHaveBeenNthCalledWith(2, {
      type: 'INCREMENTAL',
      added: [lane2],
      updated: [],
      removed: [],
    });
  });

  it('syncColdLayer falls back to full sync when the diff is too large', async () => {
    const { context: ctx, bridgeSend } = context({
      bridgeSend: vi.fn().mockResolvedValue({ type: 'COLD_READY', groups: [] }),
    });
    const previous = new Map<string, SerializedEntity>();
    const next = new Map<string, SerializedEntity>();
    for (let i = 0; i < 5002; i++) {
      const entity = makeEntity(`lane-${i}`, 'lane');
      previous.set(entity.id, entity);
      next.set(entity.id, makeEntity(entity.id, 'lane'));
    }
    ctx.refs.prevEntitiesRef.current = previous;
    useMapStore.setState({ entities: next });

    __coldLayerInternals.syncColdLayer(ctx as never);
    await Promise.resolve();

    expect(bridgeSend).toHaveBeenCalledWith({
      type: 'SYNC',
      entities: [...next.values()],
    });
  });

  it('cleanup cancels in-flight full sync results before they update the source', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const lane = makeEntity('lane-1', 'lane');
    const readyFeature = makeFeature(lane.id);
    let resolveReady: (value: unknown) => void = () => {};
    const bridgeSend = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveReady = resolve;
        }),
    );
    const { map, source, refs: coldRefs } = context();
    const actor = actorStub();
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });

    const cleanup = __coldLayerInternals.setupColdLayerSync({
      map: map as never,
      mapLoadedRef: { current: true },
      actorRef: actor as never,
      bridge: { send: bridgeSend } as never,
      refs: coldRefs as never,
    });

    rafCallbacks[0]!(0);
    expect(bridgeSend).toHaveBeenCalledWith({ type: 'SYNC', entities: [lane] });

    cleanup?.();
    resolveReady({
      type: 'COLD_READY',
      groups: [{ id: lane.id, features: [readyFeature] }],
      featureCollection: { type: 'FeatureCollection', features: [readyFeature] },
    });
    await Promise.resolve();

    expect(coldRefs.entityFeatureCacheRef.current.size).toBe(0);
    expect(source.setDataCalls).toEqual([]);
    expect(source.updateDataCalls).toEqual([]);
  });

  it('cancelScheduledSync cancels only pending animation frames', () => {
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const syncFrameRef = { current: 42 };

    __coldLayerInternals.cancelScheduledSync(syncFrameRef);
    __coldLayerInternals.cancelScheduledSync(syncFrameRef);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(42);
    expect(syncFrameRef.current).toBeNull();
  });

  it('unsubscribeColdLayer tears down all subscriptions', () => {
    const subscriptions = {
      actorSubscription: { unsubscribe: vi.fn() },
      unsubscribeStore: vi.fn(),
      unsubscribeUI: vi.fn(),
      unsubscribeSettings: vi.fn(),
    };

    __coldLayerInternals.unsubscribeColdLayer(subscriptions);

    expect(subscriptions.actorSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions.unsubscribeStore).toHaveBeenCalledTimes(1);
    expect(subscriptions.unsubscribeUI).toHaveBeenCalledTimes(1);
    expect(subscriptions.unsubscribeSettings).toHaveBeenCalledTimes(1);
  });

  it('setupColdLayerSync schedules loaded maps, applies selection filters, and cleans up', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const lane = makeEntity('lane-1', 'lane');
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    const { map, refs: coldRefs } = context({ bridgeSend: vi.fn() });
    const actor = actorStub('lane-1');

    const cleanup = __coldLayerInternals.setupColdLayerSync({
      map: map as never,
      mapLoadedRef: { current: true },
      actorRef: actor as never,
      bridge: { send: vi.fn().mockResolvedValue({ type: 'COLD_READY', groups: [] }) } as never,
      refs: coldRefs as never,
    });

    expect(rafCallbacks).toHaveLength(1);
    expect(map.setFilter).toHaveBeenCalled();
    expect(typeof cleanup).toBe('function');

    cleanup?.();

    expect(cancel).toHaveBeenCalledWith(1);
  });

  it('setupColdLayerSync waits for map load when the map is not loaded yet', () => {
    const { map, refs: coldRefs } = context({ mapLoaded: false });
    const actor = actorStub();

    const cleanup = __coldLayerInternals.setupColdLayerSync({
      map: map as never,
      mapLoadedRef: { current: false },
      actorRef: actor as never,
      bridge: { send: vi.fn() } as never,
      refs: coldRefs as never,
    });

    expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));

    cleanup?.();

    expect(map.off).toHaveBeenCalledWith('load', expect.any(Function));
  });

  it('setupColdLayerSync schedules and applies selection after a deferred map load', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const lane = makeEntity('lane-1', 'lane');
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    const { map, refs: coldRefs } = context();
    const actor = actorStub(lane.id);
    const mapLoadedRef = { current: false };

    const cleanup = __coldLayerInternals.setupColdLayerSync({
      map: map as never,
      mapLoadedRef,
      actorRef: actor as never,
      bridge: { send: vi.fn() } as never,
      refs: coldRefs as never,
    });

    expect(rafCallbacks).toHaveLength(0);
    expect(map.setFilter).not.toHaveBeenCalled();

    mapLoadedRef.current = true;
    const onLoad = map.once.mock.calls[0]![1] as () => void;
    onLoad();

    expect(rafCallbacks).toHaveLength(1);
    expect(map.setFilter).toHaveBeenCalled();

    cleanup?.();
  });

  it('setupColdLayerSync skips selection work before load and ignores unchanged actor selection', () => {
    const { map, refs: coldRefs } = context();
    const actor = actorStub(null);
    const lane = makeEntity('lane-1', 'lane');
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });

    const cleanup = __coldLayerInternals.setupColdLayerSync({
      map: map as never,
      mapLoadedRef: { current: false },
      actorRef: actor as never,
      bridge: { send: vi.fn() } as never,
      refs: coldRefs as never,
    });

    actor.emit();
    actor.getSnapshot.mockReturnValue({ context: { selectedEntityId: lane.id } });
    actor.emit();

    expect(coldRefs.selectedEntityIdRef.current).toBe(lane.id);
    expect(map.setFilter).not.toHaveBeenCalled();

    cleanup?.();
  });

  it('setupColdLayerSync ignores subscription updates that do not affect cold layers', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { map, refs: coldRefs } = context();
    const actor = actorStub();

    const cleanup = __coldLayerInternals.setupColdLayerSync({
      map: map as never,
      mapLoadedRef: { current: true },
      actorRef: actor as never,
      bridge: { send: vi.fn().mockResolvedValue({ type: 'COLD_READY', groups: [] }) } as never,
      refs: coldRefs as never,
    });

    rafCallbacks[0]!(0);
    map.setFilter.mockClear();
    useMapStore.setState({});
    useUIStore.getState().setCursorLngLat([1, 2]);
    useSettingsStore.setState({ snapRadius: useSettingsStore.getState().snapRadius + 1 });

    expect(rafCallbacks).toHaveLength(1);
    expect(coldRefs.prevEntitiesRef.current).not.toBeNull();
    expect(map.setFilter).not.toHaveBeenCalled();

    cleanup?.();
  });

  it('setupColdLayerSync unsubscribes before cancelling pending frames', () => {
    const events: string[] = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn(() => {
        events.push('cancel');
      }),
    );
    vi.spyOn(useMapStore, 'subscribe').mockReturnValue(() => {
      events.push('store');
    });
    vi.spyOn(useUIStore, 'subscribe').mockReturnValue(() => {
      events.push('ui');
    });
    vi.spyOn(useSettingsStore, 'subscribe').mockReturnValue(() => {
      events.push('settings');
    });
    const { map, refs: coldRefs } = context();
    const actor = {
      getSnapshot: vi.fn(() => ({ context: { selectedEntityId: null } })),
      subscribe: vi.fn(() => ({
        unsubscribe: () => {
          events.push('actor');
        },
      })),
    };

    const cleanup = __coldLayerInternals.setupColdLayerSync({
      map: map as never,
      mapLoadedRef: { current: true },
      actorRef: actor as never,
      bridge: { send: vi.fn() } as never,
      refs: coldRefs as never,
    });

    cleanup?.();

    expect(events).toEqual(['actor', 'store', 'ui', 'settings', 'cancel']);
  });

  it('setupColdLayerSync reacts to actor, store, UI, and settings subscriptions', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const lane = makeEntity('lane-1', 'lane');
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    const { map, refs: coldRefs } = context();
    const actor = actorStub(null);

    const cleanup = __coldLayerInternals.setupColdLayerSync({
      map: map as never,
      mapLoadedRef: { current: true },
      actorRef: actor as never,
      bridge: { send: vi.fn().mockResolvedValue({ type: 'COLD_READY', groups: [] }) } as never,
      refs: coldRefs as never,
    });

    expect(rafCallbacks).toHaveLength(1);
    map.setFilter.mockClear();

    actor.getSnapshot.mockReturnValue({ context: { selectedEntityId: lane.id } });
    actor.emit();
    expect(coldRefs.selectedEntityIdRef.current).toBe(lane.id);
    expect(map.setFilter).toHaveBeenCalled();

    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    expect(rafCallbacks).toHaveLength(1);

    rafCallbacks[0]!(0);
    useMapStore.setState({ entities: new Map([[lane.id, lane]]) });
    expect(rafCallbacks).toHaveLength(2);

    rafCallbacks[1]!(1);
    useUIStore.getState().setLayerLocked('lane', true);
    expect(rafCallbacks).toHaveLength(3);
    expect(map.setFilter).toHaveBeenCalled();

    coldRefs.prevEntitiesRef.current = new Map([[lane.id, lane]]);
    coldRefs.entityFeatureCacheRef.current.set(lane.id, [makeFeature(lane.id)]);
    rafCallbacks[2]!(2);
    useSettingsStore.setState({
      laneFillOpacity: useSettingsStore.getState().laneFillOpacity === 0.5 ? 0.51 : 0.5,
    });
    expect(coldRefs.prevEntitiesRef.current).toBeNull();
    expect(coldRefs.entityFeatureCacheRef.current.size).toBe(0);
    expect(rafCallbacks).toHaveLength(4);

    cleanup?.();
  });

  it('useColdLayer initializes refs, skips missing inputs, and wires setup when ready', async () => {
    vi.resetModules();
    let refCursor = 0;
    const refSlots: Array<{ current: unknown }> = [];
    const cleanups: Array<undefined | void | (() => void)> = [];
    const useRef = vi.fn((initialValue: unknown) => {
      const index = refCursor++;
      refSlots[index] ??= { current: initialValue };
      return refSlots[index];
    });
    const useEffect = vi.fn((effect: () => undefined | void | (() => void)) => {
      cleanups.push(effect());
    });
    vi.doMock('react', async () => ({
      ...(await vi.importActual<typeof ReactModule>('react')),
      useEffect,
      useRef,
    }));
    const { useColdLayer } = await import('../useColdLayer');
    const map = {
      getSource: vi.fn(),
      getLayer: vi.fn(() => true),
      setFilter: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
    };
    const actor = actorStub();
    const bridge = { send: vi.fn() };

    refCursor = 0;
    useColdLayer(
      { current: null } as never,
      { current: true },
      actor as never,
      { current: bridge } as never,
    );
    expect(refSlots[4]!.current).toBeInstanceOf(Map);
    expect(cleanups.at(-1)).toBeUndefined();

    refCursor = 0;
    useColdLayer(
      { current: map } as never,
      { current: true },
      actor as never,
      { current: null } as never,
    );
    expect(cleanups.at(-1)).toBeUndefined();

    refCursor = 0;
    useColdLayer(
      { current: map } as never,
      { current: false },
      actor as never,
      { current: bridge } as never,
    );
    expect(map.once).toHaveBeenCalledWith('load', expect.any(Function));
    expect(cleanups.at(-1)).toEqual(expect.any(Function));

    (cleanups.at(-1) as () => void)();
    expect(map.off).toHaveBeenCalledWith('load', expect.any(Function));
    vi.doUnmock('react');
    vi.resetModules();
  });
});

describe('layer visibility helpers', () => {
  it('filters hidden entity types out of the cold sync snapshot', () => {
    const lane = makeEntity('lane-1', 'lane');
    const signal = makeEntity('signal-1', 'signal');
    const entities = new Map([
      [lane.id, lane],
      [signal.id, signal],
    ]);

    const visible = filterVisibleEntities(entities, {
      lane: { visible: false, locked: false },
      signal: { visible: true, locked: false },
    });

    expect([...visible.keys()]).toEqual(['signal-1']);
  });

  it('only excludes selected entities from cold layers when the hot layer can render them', () => {
    const lane = makeEntity('lane-1', 'lane');
    const entities = new Map([[lane.id, lane]]);

    expect(
      selectedInteractiveEntityId('lane-1', entities, {
        lane: { visible: true, locked: false },
      }),
    ).toBe('lane-1');
    expect(
      selectedInteractiveEntityId('lane-1', entities, {
        lane: { visible: false, locked: false },
      }),
    ).toBeNull();
    expect(
      selectedInteractiveEntityId('lane-1', entities, {
        lane: { visible: true, locked: true },
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// diffEntities
// ---------------------------------------------------------------------------

describe('diffEntities', () => {
  it('all entities added when prev is empty', () => {
    const e1 = makeEntity('e1');
    const e2 = makeEntity('e2');
    const diff = diffEntities(
      new Map(),
      new Map([
        ['e1', e1],
        ['e2', e2],
      ]),
    );
    expect(diff.added).toHaveLength(2);
    expect(diff.updated).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it('all entities removed when next is empty', () => {
    const prev = new Map([['e1', makeEntity('e1')]]);
    const diff = diffEntities(prev, new Map());
    expect(diff.removed).toEqual(['e1']);
    expect(diff.added).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
  });

  it('detects updated entity when reference changes', () => {
    const e1v1 = makeEntity('e1');
    const e1v2 = makeEntity('e1'); // different object reference
    const prev = new Map([['e1', e1v1]]);
    const next = new Map([['e1', e1v2]]);
    const diff = diffEntities(prev, next);
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0]).toBe(e1v2);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it('unchanged reference is not marked updated (identity check)', () => {
    const e1 = makeEntity('e1');
    const prev = new Map([['e1', e1]]);
    const next = new Map([['e1', e1]]); // same reference
    const diff = diffEntities(prev, next);
    expect(diff.updated).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it('handles add + update + remove in one diff', () => {
    const eKeep = makeEntity('keep');
    const eUpdate = makeEntity('update');
    const eUpdateV2 = makeEntity('update'); // new ref
    const eRemove = makeEntity('remove');
    const eAdd = makeEntity('add');

    const prev = new Map<string, SerializedEntity>([
      ['keep', eKeep],
      ['update', eUpdate],
      ['remove', eRemove],
    ]);
    const next = new Map<string, SerializedEntity>([
      ['keep', eKeep],
      ['update', eUpdateV2],
      ['add', eAdd],
    ]);

    const diff = diffEntities(prev, next);
    expect(diff.added).toEqual([eAdd]);
    expect(diff.updated).toEqual([eUpdateV2]);
    expect(diff.removed).toEqual(['remove']);
  });

  it('empty diff for identical prev/next', () => {
    const e1 = makeEntity('e1');
    const shared = new Map([['e1', e1]]);
    const diff = diffEntities(shared, shared);
    expect(hasEntityChanges(diff)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasEntityChanges
// ---------------------------------------------------------------------------

describe('hasEntityChanges', () => {
  it('false for all-empty diff', () => {
    expect(hasEntityChanges({ added: [], updated: [], removed: [] })).toBe(false);
  });

  it('true when added is non-empty', () => {
    expect(hasEntityChanges({ added: [makeEntity('x')], updated: [], removed: [] })).toBe(true);
  });

  it('true when updated is non-empty', () => {
    expect(hasEntityChanges({ added: [], updated: [makeEntity('x')], removed: [] })).toBe(true);
  });

  it('true when removed is non-empty', () => {
    expect(hasEntityChanges({ added: [], updated: [], removed: ['x'] })).toBe(true);
  });
});

describe('hasColdRenderSettingsChanged', () => {
  it('detects lane render setting changes', () => {
    const state = useSettingsStore.getState();

    expect(hasColdRenderSettingsChanged({ ...state, laneFillOpacity: 0.12 }, state)).toBe(true);
    expect(
      hasColdRenderSettingsChanged(
        { ...state, laneEdgeLineWidth: state.laneEdgeLineWidth + 1 },
        state,
      ),
    ).toBe(true);
  });

  it('ignores settings that do not require cold feature rebuild', () => {
    const state = useSettingsStore.getState();

    expect(
      hasColdRenderSettingsChanged({ ...state, snapRadius: state.snapRadius + 1 }, state),
    ).toBe(false);
  });
});
