import { describe, it, expect } from 'vitest';
import { decodeMapBin, encodeMapBin } from '../binCodec';
import { getMapType } from '../loader';
import {
  readEditorMeta,
  writeEditorMeta,
  entityKey,
  EDITOR_META_VERSION,
  hydrateSourceRectsFromEditorMeta,
  writeSourceRectsToEditorMeta,
} from '../editorMeta';
import { getSourceRect, type CrosswalkEntity } from '@/types/apollo';
import type { RectEntity } from '@/types/entities';

const SOURCE_RECT = {
  p1: { x: -122.025, y: 37.37 },
  p2: { x: -122.0242, y: 37.3706 },
  rotation: Math.PI / 7,
};

describe('editor_meta round-trip on Map', () => {
  it('exposes editor_meta on the resolved Map type', async () => {
    const Map = await getMapType();
    const field = Map.fields.editor_meta;
    expect(field).toBeDefined();
    expect(field?.id).toBe(1000);
  });

  it('survives a bin → bin → bin cycle with geometryKind and sourceRect overrides', async () => {
    const original: Record<string, unknown> = {
      header: { version: new TextEncoder().encode('test') },
    };
    writeEditorMeta(original, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'lane_1')]: { geometryKind: 'LINESTRING' },
        [entityKey('signal', 'signal_3')]: { geometryKind: 'LINESTRING' },
        [entityKey('area', 'area_1')]: { sourceRect: SOURCE_RECT },
      },
    });

    const bytes = await encodeMapBin(original);
    const decoded = await decodeMapBin(bytes);
    const meta = readEditorMeta(decoded);

    expect(meta.version).toBe(EDITOR_META_VERSION);
    expect(meta.entity[entityKey('lane', 'lane_1')]).toEqual({
      geometryKind: 'LINESTRING',
    });
    expect(meta.entity[entityKey('signal', 'signal_3')]).toEqual({
      geometryKind: 'LINESTRING',
    });
    expect(meta.entity[entityKey('area', 'area_1')]).toEqual({
      sourceRect: SOURCE_RECT,
    });
  });

  it('returns an empty meta object when the field is absent', async () => {
    const bytes = await encodeMapBin({ header: {} });
    const decoded = await decodeMapBin(bytes);
    const meta = readEditorMeta(decoded);
    expect(meta.entity).toEqual({});
  });

  it('writes current entity _sourceRect values and hydrates supported entities', () => {
    const rawMap: Record<string, unknown> = {};
    writeEditorMeta(rawMap, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'lane_1')]: { geometryKind: 'LINESTRING' },
        [entityKey('area', 'stale_area')]: {
          sourceRect: {
            p1: { x: 1, y: 1 },
            p2: { x: 2, y: 2 },
            rotation: 0,
          },
        },
      },
    });

    const crosswalk: CrosswalkEntity = {
      id: 'cw_1',
      entityType: 'crosswalk',
      polygon: { points: [] },
      overlapIds: [],
      _sourceRect: SOURCE_RECT,
    };
    writeSourceRectsToEditorMeta(rawMap, [crosswalk]);

    const meta = readEditorMeta(rawMap);
    expect(meta.entity[entityKey('lane', 'lane_1')]).toEqual({ geometryKind: 'LINESTRING' });
    expect(meta.entity[entityKey('area', 'stale_area')]).toBeUndefined();
    expect(meta.entity[entityKey('crosswalk', 'cw_1')]).toEqual({ sourceRect: SOURCE_RECT });

    const importedCrosswalk: CrosswalkEntity = {
      id: 'cw_1',
      entityType: 'crosswalk',
      polygon: { points: [] },
      overlapIds: [],
    };
    const hydrated = hydrateSourceRectsFromEditorMeta(rawMap, [importedCrosswalk]);
    expect(getSourceRect(hydrated[0]!)).toEqual(SOURCE_RECT);
  });

  it('ignores sourceRect metadata on unsupported entity kinds', () => {
    const rawMap: Record<string, unknown> = {};
    writeEditorMeta(rawMap, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('rect', 'rect_1')]: { sourceRect: SOURCE_RECT },
      },
    });

    const drawingRect: RectEntity = {
      id: 'rect_1',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 1, y: 1 },
      rotation: 0,
    };
    const hydrated = hydrateSourceRectsFromEditorMeta(rawMap, [drawingRect]);
    expect(getSourceRect(hydrated[0]!)).toBeUndefined();
  });
});
