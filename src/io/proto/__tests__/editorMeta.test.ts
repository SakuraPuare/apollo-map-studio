import { describe, it, expect } from 'vitest';
import { decodeMapBin, encodeMapBin } from '../binCodec';
import { getMapType } from '../loader';
import { readEditorMeta, writeEditorMeta, entityKey, EDITOR_META_VERSION } from '../editorMeta';

describe('editor_meta round-trip on Map', () => {
  it('exposes editor_meta on the resolved Map type', async () => {
    const Map = await getMapType();
    const field = Map.fields.editor_meta;
    expect(field).toBeDefined();
    expect(field?.id).toBe(1000);
  });

  it('survives a bin → bin → bin cycle with geometryKind override', async () => {
    const original: Record<string, unknown> = {
      header: { version: new TextEncoder().encode('test') },
    };
    writeEditorMeta(original, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'lane_1')]: { geometryKind: 'LINESTRING' },
        [entityKey('signal', 'signal_3')]: { geometryKind: 'LINESTRING' },
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
  });

  it('returns an empty meta object when the field is absent', async () => {
    const bytes = await encodeMapBin({ header: {} });
    const decoded = await decodeMapBin(bytes);
    const meta = readEditorMeta(decoded);
    expect(meta.entity).toEqual({});
  });
});
