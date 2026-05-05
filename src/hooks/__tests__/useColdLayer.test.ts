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

import { describe, it, expect } from 'vitest';
import type { SerializedEntity } from '@/core/workers/protocol';
import {
  groupFeaturesByEntity,
  flattenEntityFeatures,
  diffEntities,
  hasEntityChanges,
  hasColdRenderSettingsChanged,
} from '../useColdLayer';
import { filterVisibleEntities, selectedInteractiveEntityId } from '@/lib/layerState';
import { useSettingsStore } from '@/store/settingsStore';

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
