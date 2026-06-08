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

const SOURCE_RECT_WITH_Z = {
  p1: { x: -122.025, y: 37.37, z: 4 },
  p2: { x: -122.0242, y: 37.3706, z: 5 },
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

const SOURCE_BEZIER_WITH_Z: SourceDrawInfo = {
  drawTool: 'drawBezier',
  anchors: [
    {
      point: { x: -122.025, y: 37.37, z: 1 },
      handleIn: null,
      handleOut: { x: -122.0249, y: 37.3701, z: 2 },
    },
    {
      point: { x: -122.024, y: 37.371, z: 3 },
      handleIn: { x: -122.0242, y: 37.3709, z: 4 },
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

const SOURCE_ARC_WITH_Z: SourceDrawInfo = {
  drawTool: 'drawArc',
  arcPoints: [
    { x: -122.025, y: 37.37, z: 6 },
    { x: -122.0246, y: 37.3707, z: 7 },
    { x: -122.024, y: 37.37, z: 8 },
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

const SOURCE_CATMULL_ROM_WITH_Z: SourceDrawInfo = {
  drawTool: 'drawCatmullRom',
  points: [
    { x: -122.025, y: 37.37, z: 9 },
    { x: -122.0247, y: 37.3704, z: 10 },
    { x: -122.024, y: 37.3701, z: 11 },
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

const HEADER_CASES = [
  {
    label: 'Uint8Array',
    version: new TextEncoder().encode('bytes-header'),
    decodedText: 'bytes-header',
  },
  {
    label: 'base64 string',
    version: 'c3RyaW5nLWhlYWRlcg==',
    decodedText: 'string-header',
  },
] as const;

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

  it('preserves geometry source z coordinates through bin cycles', async () => {
    const original: Record<string, unknown> = {
      header: { version: new TextEncoder().encode('test') },
    };
    writeEditorMeta(original, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('area', 'area_z')]: {
          geometrySource: { drawTool: 'drawRotatedRect', rect: SOURCE_RECT_WITH_Z },
        },
        [entityKey('lane', 'lane_bezier_z')]: { geometrySource: SOURCE_BEZIER_WITH_Z },
        [entityKey('signal', 'signal_arc_z')]: { geometrySource: SOURCE_ARC_WITH_Z },
        [entityKey('lane', 'lane_catmull_z')]: { geometrySource: SOURCE_CATMULL_ROM_WITH_Z },
      },
    });

    const decoded1 = await decodeMapBin(await encodeMapBin(original));
    const decoded2 = await decodeMapBin(await encodeMapBin(decoded1));
    const meta = readEditorMeta(decoded2);

    expect(meta.entity[entityKey('area', 'area_z')]).toEqual({
      geometrySource: { drawTool: 'drawRotatedRect', rect: SOURCE_RECT_WITH_Z },
    });
    expect(meta.entity[entityKey('lane', 'lane_bezier_z')]).toEqual({
      geometrySource: SOURCE_BEZIER_WITH_Z,
    });
    expect(meta.entity[entityKey('signal', 'signal_arc_z')]).toEqual({
      geometrySource: SOURCE_ARC_WITH_Z,
    });
    expect(meta.entity[entityKey('lane', 'lane_catmull_z')]).toEqual({
      geometrySource: SOURCE_CATMULL_ROM_WITH_Z,
    });
  });

  for (const headerCase of HEADER_CASES) {
    it(`preserves editor metadata with ${headerCase.label} header bytes`, async () => {
      const original: Record<string, unknown> = {
        header: { version: headerCase.version },
      };
      writeEditorMeta(original, {
        version: EDITOR_META_VERSION,
        entity: {
          [entityKey('lane', `lane_${headerCase.label}`)]: { geometrySource: SOURCE_BEZIER },
        },
      });

      const decoded = await decodeMapBin(await encodeMapBin(original));
      const header = decoded.header as { version?: Uint8Array };
      expect(new TextDecoder().decode(header.version)).toBe(headerCase.decodedText);
      expect(readEditorMeta(decoded).entity[entityKey('lane', `lane_${headerCase.label}`)]).toEqual(
        { geometrySource: SOURCE_BEZIER },
      );
    });
  }

  it('returns an empty meta object when the field is absent', async () => {
    const bytes = await encodeMapBin({ header: {} });
    const decoded = await decodeMapBin(bytes);
    const meta = readEditorMeta(decoded);
    expect(meta.entity).toEqual({});
  });

  it('defaults missing metadata and prunes empty entity metadata on write', () => {
    expect(readEditorMeta({})).toEqual({ version: EDITOR_META_VERSION, entity: {} });
    expect(readEditorMeta({ editor_meta: {} })).toEqual({
      version: EDITOR_META_VERSION,
      entity: {},
    });

    const rawMap: Record<string, unknown> = {};
    writeEditorMeta(rawMap, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'empty')]: {},
        [entityKey('lane', 'kind_only')]: { geometryKind: 'POLYGON' },
      },
    });

    expect(rawMap.editor_meta).toEqual({
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'kind_only')]: { geometry_kind: 2 },
      },
    });
    expect(readEditorMeta(rawMap).entity).toEqual({
      [entityKey('lane', 'kind_only')]: { geometryKind: 'POLYGON' },
    });
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
    const laneWithoutSource = laneEntity('lane_without_source');
    writeEntitySourcesToEditorMeta(rawMap, [crosswalk, lane, laneWithoutSource]);

    const meta = readEditorMeta(rawMap);
    expect(meta.entity[entityKey('lane', 'lane_1')]).toEqual({ geometryKind: 'LINESTRING' });
    expect(meta.entity[entityKey('area', 'stale_area')]).toBeUndefined();
    expect(meta.entity[entityKey('lane', 'lane_without_source')]).toBeUndefined();
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

  it('prunes stale geometry sources but retains geometryKind-only metadata', () => {
    const rawMap: Record<string, unknown> = {};
    writeEditorMeta(rawMap, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('lane', 'lane_1')]: {
          geometryKind: 'LINESTRING',
          geometrySource: SOURCE_BEZIER,
        },
        [entityKey('area', 'stale_area')]: {
          geometryKind: 'POLYGON',
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

    writeEntitySourcesToEditorMeta(rawMap, []);

    const meta = readEditorMeta(rawMap);
    expect(meta.entity[entityKey('lane', 'lane_1')]).toEqual({ geometryKind: 'LINESTRING' });
    expect(meta.entity[entityKey('area', 'stale_area')]).toEqual({ geometryKind: 'POLYGON' });
  });

  it('clones geometry sources when writing and hydrating metadata', () => {
    const rawMap: Record<string, unknown> = {};
    const source = structuredClone(SOURCE_BEZIER_WITH_Z);
    const lane = laneEntity('lane_z', source);
    writeEntitySourcesToEditorMeta(rawMap, [lane]);

    source.anchors[0]!.point.z = 100;
    const meta = readEditorMeta(rawMap);
    expect(meta.entity[entityKey('lane', 'lane_z')]?.geometrySource).toEqual(SOURCE_BEZIER_WITH_Z);

    const hydrated = hydrateEntitySourcesFromEditorMeta(rawMap, [laneEntity('lane_z')]);
    const hydratedSource = getSource(hydrated[0]!);
    expect(hydratedSource).toEqual(SOURCE_BEZIER_WITH_Z);

    if (hydratedSource?.drawTool === 'drawBezier') {
      hydratedSource.anchors[0]!.point.z = 200;
    }
    expect(readEditorMeta(rawMap).entity[entityKey('lane', 'lane_z')]?.geometrySource).toEqual(
      SOURCE_BEZIER_WITH_Z,
    );
  });

  it('clones arc and Catmull-Rom geometry sources when writing and hydrating metadata', () => {
    const rawMap: Record<string, unknown> = {};
    const arcSource = structuredClone(SOURCE_ARC_WITH_Z);
    const catmullSource = structuredClone(SOURCE_CATMULL_ROM_WITH_Z);
    writeEntitySourcesToEditorMeta(rawMap, [
      laneEntity('lane_arc_z', arcSource),
      laneEntity('lane_catmull_z', catmullSource),
    ]);

    if (arcSource.drawTool === 'drawArc') {
      arcSource.arcPoints[0]!.z = 100;
    }
    if (catmullSource.drawTool === 'drawCatmullRom') {
      catmullSource.points[0]!.z = 200;
    }

    const meta = readEditorMeta(rawMap);
    expect(meta.entity[entityKey('lane', 'lane_arc_z')]?.geometrySource).toEqual(SOURCE_ARC_WITH_Z);
    expect(meta.entity[entityKey('lane', 'lane_catmull_z')]?.geometrySource).toEqual(
      SOURCE_CATMULL_ROM_WITH_Z,
    );

    const hydrated = hydrateEntitySourcesFromEditorMeta(rawMap, [
      laneEntity('lane_arc_z'),
      laneEntity('lane_catmull_z'),
    ]);
    expect(getSource(hydrated[0]!)).toEqual(SOURCE_ARC_WITH_Z);
    expect(getSource(hydrated[1]!)).toEqual(SOURCE_CATMULL_ROM_WITH_Z);
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

  it('hydrates source metadata only onto eligible entity shapes', () => {
    const rawMap: Record<string, unknown> = {};
    writeEditorMeta(rawMap, {
      version: EDITOR_META_VERSION,
      entity: {
        [entityKey('crosswalk', 'cw_without_polygon')]: {
          geometrySource: { drawTool: 'drawRotatedRect', rect: SOURCE_RECT },
        },
        [entityKey('rect', 'rect_draw')]: {
          geometrySource: SOURCE_BEZIER,
        },
        [entityKey('lane', 'lane_arc')]: {
          geometrySource: SOURCE_ARC,
        },
      },
    });

    const crosswalkWithoutPolygon = {
      id: 'cw_without_polygon',
      entityType: 'crosswalk',
      polygon: { points: [] },
      overlapIds: [],
    } satisfies CrosswalkEntity;
    const drawingRect: RectEntity = {
      id: 'rect_draw',
      entityType: 'rect',
      p1: { x: 0, y: 0 },
      p2: { x: 1, y: 1 },
      rotation: 0,
    };
    const lane = laneEntity('lane_arc');

    const hydrated = hydrateEntitySourcesFromEditorMeta(rawMap, [
      crosswalkWithoutPolygon,
      drawingRect,
      lane,
    ]);
    expect(hydrated[0]).not.toBe(crosswalkWithoutPolygon);
    expect(getSourceRect(hydrated[0]!)).toEqual(SOURCE_RECT);
    expect(hydrated[1]).toBe(drawingRect);
    expect(getSource(hydrated[1]!)).toBeUndefined();
    expect(hydrated[2]).not.toBe(lane);
    expect(getSource(hydrated[2]!)).toEqual(SOURCE_ARC);
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

  it('ignores missing and malformed editor metadata fields while preserving valid siblings', () => {
    const malformedKeys = [
      entityKey('lane', 'invalid_kind'),
      entityKey('lane', 'missing_draw_tool'),
      entityKey('lane', 'unknown_draw_tool'),
      entityKey('area', 'missing_rect'),
      entityKey('area', 'rect_bad_point'),
      entityKey('lane', 'bezier_bad_anchor'),
      entityKey('signal', 'arc_missing_point'),
      entityKey('lane', 'catmull_missing_points'),
      entityKey('lane', 'catmull_bad_point'),
    ];
    const validKey = entityKey('area', 'valid_rect');
    const rawMap: Record<string, unknown> = {
      editor_meta: {
        version: 7,
        entity: {
          [malformedKeys[0]!]: { geometry_kind: 99 },
          [malformedKeys[1]!]: { geometry_source: {} },
          [malformedKeys[2]!]: { geometry_source: { draw_tool: 99 } },
          [malformedKeys[3]!]: { geometry_source: { draw_tool: 4 } },
          [malformedKeys[4]!]: {
            geometry_source: {
              draw_tool: 4,
              rect: { p1: { x: 0, y: 0 }, p2: { x: 'bad', y: 1 }, rotation: 0 },
            },
          },
          [malformedKeys[5]!]: {
            geometry_source: {
              draw_tool: 1,
              bezier: {
                anchor: [{ point: { x: 0, y: 0 } }, { point: { x: 1 } }],
              },
            },
          },
          [malformedKeys[6]!]: {
            geometry_source: {
              draw_tool: 2,
              arc: { p1: { x: 0, y: 0 }, p2: { x: 1, y: 1 } },
            },
          },
          [malformedKeys[7]!]: {
            geometry_source: { draw_tool: 3, catmull_rom: { point: [{ x: 0, y: 0 }] } },
          },
          [malformedKeys[8]!]: {
            geometry_source: {
              draw_tool: 3,
              catmull_rom: { point: [{ x: 0, y: 0 }, { x: 1 }] },
            },
          },
          [validKey]: {
            geometry_kind: 2,
            geometry_source: {
              draw_tool: 4,
              rect: {
                p1: { x: -1, y: -2 },
                p2: { x: 3, y: 4 },
                rotation: 0.25,
              },
            },
          },
        },
      },
    };

    const meta = readEditorMeta(rawMap);
    expect(meta.version).toBe(7);
    for (const key of malformedKeys) {
      expect(meta.entity[key]).toEqual({});
    }
    expect(meta.entity[validKey]).toEqual({
      geometryKind: 'POLYGON',
      geometrySource: {
        drawTool: 'drawRotatedRect',
        rect: {
          p1: { x: -1, y: -2 },
          p2: { x: 3, y: 4 },
          rotation: 0.25,
        },
      },
    });
  });
});
