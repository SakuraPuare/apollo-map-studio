import { describe, it, expect } from 'vitest';
import { decodeMapBin, encodeMapBin } from '../binCodec';
import { getMapType } from '../loader';
import {
  readEditorMeta,
  writeEditorMeta,
  entityKey,
  EDITOR_META_VERSION,
  hydrateEntitySourcesFromEditorMeta,
  writeEntitySourcesToEditorMeta,
} from '../editorMeta';
import {
  getSource,
  getSourceRect,
  type CrosswalkEntity,
  type LaneEntity,
  type SourceDrawInfo,
} from '@/types/apollo';
import type { RectEntity } from '@/types/entities';

const SOURCE_RECT = {
  p1: { x: -122.025, y: 37.37 },
  p2: { x: -122.0242, y: 37.3706 },
  rotation: Math.PI / 7,
};

const SOURCE_BEZIER: SourceDrawInfo = {
  drawTool: 'drawBezier',
  anchors: [
    { point: { x: -122.025, y: 37.37 }, handleIn: null, handleOut: { x: -122.0249, y: 37.3701 } },
    {
      point: { x: -122.024, y: 37.371 },
      handleIn: { x: -122.0242, y: 37.3709 },
      handleOut: null,
    },
  ],
};

const SOURCE_ARC: SourceDrawInfo = {
  drawTool: 'drawArc',
  arcPoints: [
    { x: -122.025, y: 37.37 },
    { x: -122.0246, y: 37.3707 },
    { x: -122.024, y: 37.37 },
  ],
};

const SOURCE_CATMULL_ROM: SourceDrawInfo = {
  drawTool: 'drawCatmullRom',
  points: [
    { x: -122.025, y: 37.37 },
    { x: -122.0247, y: 37.3704 },
    { x: -122.024, y: 37.3701 },
  ],
};

function laneEntity(id: string, source?: SourceDrawInfo): LaneEntity {
  const lane: LaneEntity = {
    id,
    entityType: 'lane',
    centralCurve: { segments: [] },
    leftBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    rightBoundary: { curve: { segments: [] }, length: 0, boundaryType: [] },
    length: 0,
    type: 'CITY_DRIVING',
    turn: 'NO_TURN',
    direction: 'FORWARD',
    speedLimit: 0,
    predecessorIds: [],
    successorIds: [],
    leftNeighborForwardIds: [],
    rightNeighborForwardIds: [],
    leftNeighborReverseIds: [],
    rightNeighborReverseIds: [],
    selfReverseLaneIds: [],
    junctionId: null,
    overlapIds: [],
    leftSamples: [],
    rightSamples: [],
    leftRoadSamples: [],
    rightRoadSamples: [],
  };
  return source ? { ...lane, _source: source } : lane;
}

describe('editor_meta round-trip on Map', () => {
  it('exposes editor_meta on the resolved Map type', async () => {
    const Map = await getMapType();
    const field = Map.fields.editor_meta;
    expect(field).toBeDefined();
    expect(field?.id).toBe(1000);
  });

  it('survives a bin -> bin -> bin cycle with geometryKind and geometrySource overrides', async () => {
    const original: Record<string, unknown> = {
      header: { version: new TextEncoder().encode('test') },
    };
    writeEditorMeta(original, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'lane_1')]: { geometryKind: 'LINESTRING' },
        [entityKey('signal', 'signal_3')]: { geometryKind: 'LINESTRING' },
        [entityKey('area', 'area_1')]: {
          geometrySource: { drawTool: 'drawRotatedRect', rect: SOURCE_RECT },
        },
        [entityKey('lane', 'lane_2')]: { geometrySource: SOURCE_BEZIER },
        [entityKey('signal', 'signal_4')]: { geometrySource: SOURCE_ARC },
        [entityKey('lane', 'lane_3')]: { geometrySource: SOURCE_CATMULL_ROM },
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
      geometrySource: { drawTool: 'drawRotatedRect', rect: SOURCE_RECT },
    });
    expect(meta.entity[entityKey('lane', 'lane_2')]).toEqual({ geometrySource: SOURCE_BEZIER });
    expect(meta.entity[entityKey('signal', 'signal_4')]).toEqual({ geometrySource: SOURCE_ARC });
    expect(meta.entity[entityKey('lane', 'lane_3')]).toEqual({
      geometrySource: SOURCE_CATMULL_ROM,
    });
  });

  it('returns an empty meta object when the field is absent', async () => {
    const bytes = await encodeMapBin({ header: {} });
    const decoded = await decodeMapBin(bytes);
    const meta = readEditorMeta(decoded);
    expect(meta.entity).toEqual({});
  });

  it('writes current entity sources and hydrates supported entities', () => {
    const rawMap: Record<string, unknown> = {};
    writeEditorMeta(rawMap, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'lane_1')]: { geometryKind: 'LINESTRING' },
        [entityKey('area', 'stale_area')]: {
          geometrySource: {
            drawTool: 'drawRotatedRect',
            rect: {
              p1: { x: 1, y: 1 },
              p2: { x: 2, y: 2 },
              rotation: 0,
            },
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
    const lane = laneEntity('lane_2', SOURCE_BEZIER);
    writeEntitySourcesToEditorMeta(rawMap, [crosswalk, lane]);

    const meta = readEditorMeta(rawMap);
    expect(meta.entity[entityKey('lane', 'lane_1')]).toEqual({ geometryKind: 'LINESTRING' });
    expect(meta.entity[entityKey('area', 'stale_area')]).toBeUndefined();
    expect(meta.entity[entityKey('crosswalk', 'cw_1')]).toEqual({
      geometrySource: { drawTool: 'drawRotatedRect', rect: SOURCE_RECT },
    });
    expect(meta.entity[entityKey('lane', 'lane_2')]).toEqual({ geometrySource: SOURCE_BEZIER });

    const importedCrosswalk: CrosswalkEntity = {
      id: 'cw_1',
      entityType: 'crosswalk',
      polygon: { points: [] },
      overlapIds: [],
    };
    const importedLane = laneEntity('lane_2');
    const hydrated = hydrateEntitySourcesFromEditorMeta(rawMap, [importedCrosswalk, importedLane]);
    expect(getSourceRect(hydrated[0]!)).toEqual(SOURCE_RECT);
    expect(getSource(hydrated[1]!)).toEqual(SOURCE_BEZIER);
  });

  it('ignores geometrySource metadata on unsupported entity kinds', () => {
    const rawMap: Record<string, unknown> = {};
    writeEditorMeta(rawMap, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('rect', 'rect_1')]: {
          geometrySource: { drawTool: 'drawRotatedRect', rect: SOURCE_RECT },
        },
      },
    });

    const drawingRect: RectEntity = {
      id: 'rect_1',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 1, y: 1 },
      rotation: 0,
    };
    const hydrated = hydrateEntitySourcesFromEditorMeta(rawMap, [drawingRect]);
    expect(getSourceRect(hydrated[0]!)).toBeUndefined();
  });

  it('drops malformed geometrySource payloads', () => {
    const rawMap: Record<string, unknown> = {
      editor_meta: {
        version: EDITOR_META_VERSION,
        entity: {
          [entityKey('lane', 'lane_1')]: {
            geometry_source: {
              draw_tool: 1,
              bezier: { anchor: [{ handle_out: { x: 1, y: 1 } }] },
            },
          },
        },
      },
    };

    const meta = readEditorMeta(rawMap);
    expect(meta.entity[entityKey('lane', 'lane_1')]).toEqual({});
    const hydrated = hydrateEntitySourcesFromEditorMeta(rawMap, [laneEntity('lane_1')]);
    expect(getSource(hydrated[0]!)).toBeUndefined();
  });
});
