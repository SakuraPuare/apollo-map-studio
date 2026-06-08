import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { decodeMapBin } from '../binCodec';
import { apolloMapToLonLat, readHeaderProjString } from '../adapter';
import { apolloMapToEntities, entitiesToApolloMap } from '../entityBridge';
import { rawCrosswalkToEntity, entityToRawCrosswalk } from '../entityBridge/simpleEntities';
import { unwrapId, unwrapIdArray } from '../entityBridge/common';
import type { CrosswalkEntity, LaneEntity, RoadEntity } from '@/types/apollo';

const APOLLO_BIN = path.resolve(
  import.meta.dirname,
  '../../__fixtures__/apollo/borregas_ave/base_map.bin',
);

describe('entityBridge — generic helpers', () => {
  it('unwrapId returns null for missing or malformed input', () => {
    expect(unwrapId(undefined)).toBeNull();
    expect(unwrapId({})).toBeNull();
    expect(unwrapId({ id: 'L1' })).toBe('L1');
  });

  it('unwrapIdArray flattens an Id[] array', () => {
    expect(unwrapIdArray(undefined)).toEqual([]);
    expect(unwrapIdArray([{ id: 'a' }, { id: 'b' }])).toEqual(['a', 'b']);
    expect(unwrapIdArray([{ id: 'a' }, {}, { id: 'b' }])).toEqual(['a', 'b']);
  });
});

describe('entityBridge — Crosswalk round-trip', () => {
  const sampleRaw = {
    id: { id: 'Crosswalk_1' },
    polygon: {
      point: [
        { x: 1, y: 2, z: 0 },
        { x: 3, y: 4, z: 0 },
        { x: 5, y: 6, z: 0 },
      ],
    },
    overlap_id: [{ id: 'ov_1' }, { id: 'ov_2' }],
  };

  it('proto → entity', () => {
    const entity = rawCrosswalkToEntity(sampleRaw);
    expect(entity).not.toBeNull();
    expect(entity!.id).toBe('Crosswalk_1');
    expect(entity!.entityType).toBe('crosswalk');
    expect(entity!.polygon.points).toHaveLength(3);
    expect(entity!.polygon.points[0]).toEqual({ x: 1, y: 2, z: 0 });
    expect(entity!.overlapIds).toEqual(['ov_1', 'ov_2']);
  });

  it('entity → proto', () => {
    const entity: CrosswalkEntity = {
      id: 'Crosswalk_2',
      entityType: 'crosswalk',
      polygon: {
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
      },
      overlapIds: ['ov_x'],
    };
    const raw = entityToRawCrosswalk(entity);
    expect(raw.id).toEqual({ id: 'Crosswalk_2' });
    expect(raw.polygon!.point).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(raw.overlap_id).toEqual([{ id: 'ov_x' }]);
  });

  it('round-trips raw → entity → raw without loss', () => {
    const entity = rawCrosswalkToEntity(sampleRaw)!;
    const back = entityToRawCrosswalk(entity);
    expect(back).toEqual(sampleRaw);
  });

  it('skips entries with missing id', () => {
    expect(rawCrosswalkToEntity({})).toBeNull();
    expect(rawCrosswalkToEntity({ id: {} })).toBeNull();
  });
});

describe('entityBridge — apolloMapToEntities / entitiesToApolloMap', () => {
  it('extracts every supported entity type from a small map', () => {
    const map = {
      crosswalk: [
        {
          id: { id: 'CW1' },
          polygon: {
            point: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        },
        {
          id: { id: 'CW2' },
          polygon: {
            point: [
              { x: 2, y: 2 },
              { x: 3, y: 3 },
            ],
          },
        },
      ],
      lane: [{ id: { id: 'L1' } }],
      junction: [{ id: { id: 'J1' }, polygon: { point: [] } }],
    };
    const entities = apolloMapToEntities(map);
    expect(entities).toHaveLength(4);
    const ids = entities.map((e) => `${e.entityType}:${e.id}`).sort();
    expect(ids).toEqual(['crosswalk:CW1', 'crosswalk:CW2', 'junction:J1', 'lane:L1'].sort());
  });

  it('entitiesToApolloMap replaces every bridged array with the editor snapshot', () => {
    const baseMap = {
      header: { version: new TextEncoder().encode('1.0') },
    };
    const entities: CrosswalkEntity[] = [
      {
        id: 'CW_NEW',
        entityType: 'crosswalk',
        polygon: {
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
        overlapIds: [],
      },
    ];
    const merged = entitiesToApolloMap(baseMap, entities);
    // Header (and any non-bridged top-level field) passes through verbatim.
    expect(merged.header).toBe(baseMap.header);
    // Crosswalk array replaced by editor snapshot.
    expect((merged.crosswalk as Array<{ id: { id: string } }>)[0]!.id.id).toBe('CW_NEW');
    // Empty buckets are also written (so an old `lane` array would be cleared
    // if it was in baseMap and no Lane entities are present in editor).
    expect(merged.lane).toEqual([]);
  });

  it('ignores malformed entity collections while passing metadata through', () => {
    const baseMap: Record<string, unknown> = {
      header: { version: new TextEncoder().encode('1.0') },
      metadata: { map_name: 'branch-defaults' },
      lane: { id: { id: 'not-an-array' } },
      crosswalk: null,
      road: 'not-an-array',
    };
    const customEntity = {
      id: 'D1',
      entityType: 'polyline' as const,
      points: [{ x: 1, y: 2 }],
    };

    expect(apolloMapToEntities(baseMap as Parameters<typeof apolloMapToEntities>[0])).toEqual([]);

    const merged = entitiesToApolloMap(baseMap, [customEntity]);

    expect(merged.header).toBe(baseMap.header);
    expect(merged.metadata).toBe(baseMap.metadata);
    expect(merged.crosswalk).toEqual([]);
    expect(merged.lane).toEqual([]);
    expect(merged.road).toEqual([]);
  });

  it('preserves unmodeled raw fields on edited Apollo elements with matching ids', () => {
    const baseMap = {
      crosswalk: [
        {
          id: { id: 'CW_KEEP' },
          polygon: { point: [{ x: 0, y: 0 }] },
          overlap_id: [{ id: 'ov_old' }],
          extension_field: {
            nested_value: 42,
          },
        },
      ],
    };
    const entities: CrosswalkEntity[] = [
      {
        id: 'CW_KEEP',
        entityType: 'crosswalk',
        polygon: {
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
        },
        overlapIds: ['ov_new'],
      },
    ];

    const merged = entitiesToApolloMap(baseMap, entities);
    const out = (
      merged.crosswalk as Array<{
        polygon: { point: Array<{ x: number; y: number }> };
        overlap_id: Array<{ id: string }>;
        extension_field?: unknown;
      }>
    )[0]!;

    expect(out.extension_field).toBe(baseMap.crosswalk[0]!.extension_field);
    expect(out.polygon.point).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(out.overlap_id).toEqual([{ id: 'ov_new' }]);
  });

  it('preserves duplicate-id raw extensions on the matching raw occurrence', () => {
    const baseMap = {
      crosswalk: [
        {
          id: { id: 'CW_DUP' },
          polygon: { point: [{ x: 0, y: 0 }] },
          overlap_id: [],
        },
        {
          id: { id: 'CW_DUP' },
          polygon: { point: [{ x: 1, y: 1 }] },
          overlap_id: [],
          extension_field: { keep: true },
        },
      ],
    };
    const entities = apolloMapToEntities(baseMap) as CrosswalkEntity[];
    const edited = entities.map((entity, index) => ({
      ...entity,
      polygon: {
        points: [{ x: 10 + index, y: 20 + index }],
      },
    }));

    const merged = entitiesToApolloMap(baseMap, edited);
    const out = merged.crosswalk as Array<{
      polygon: { point: Array<{ x: number; y: number }> };
      extension_field?: unknown;
    }>;

    expect(out[0]!.extension_field).toBeUndefined();
    expect(out[1]!.extension_field).toBe(baseMap.crosswalk[1]!.extension_field);
    expect(out[0]!.polygon.point).toEqual([{ x: 10, y: 20 }]);
    expect(out[1]!.polygon.point).toEqual([{ x: 11, y: 21 }]);
  });

  it('preserves nested unmodeled lane boundary and curve fields', () => {
    const baseMap = {
      lane: [
        {
          id: { id: 'L_NESTED_KEEP' },
          central_curve: {
            segment: [{ line_segment: { point: [{ x: 0, y: 0 }] } }],
            central_extension: { keep: 'central' },
          },
          left_boundary: {
            curve: {
              segment: [{ line_segment: { point: [{ x: 1, y: 1 }] } }],
              curve_extension: { keep: 'left-curve' },
            },
            length: 10,
            boundary_extension: { keep: 'left-boundary' },
            boundary_type: [],
          },
          right_boundary: {
            curve: {
              segment: [{ line_segment: { point: [{ x: 2, y: 2 }] } }],
              curve_extension: { keep: 'right-curve' },
            },
            virtual: true,
            boundary_extension: { keep: 'right-boundary' },
            boundary_type: [],
          },
          type: 2,
          turn: 1,
          direction: 1,
          overlap_id: [],
          predecessor_id: [],
          successor_id: [],
          left_neighbor_forward_lane_id: [],
          right_neighbor_forward_lane_id: [],
          left_neighbor_reverse_lane_id: [],
          right_neighbor_reverse_lane_id: [],
          self_reverse_lane_id: [],
          left_sample: [],
          right_sample: [],
          left_road_sample: [],
          right_road_sample: [],
        },
      ],
    };
    const entities = apolloMapToEntities(baseMap) as LaneEntity[];
    entities[0] = {
      ...entities[0]!,
      leftBoundary: { ...entities[0]!.leftBoundary, length: 25 },
      rightBoundary: { ...entities[0]!.rightBoundary, virtual: false },
    };

    const merged = entitiesToApolloMap(baseMap, entities);
    const out = (
      merged.lane as Array<{
        central_curve: { central_extension?: unknown };
        left_boundary: {
          length?: number;
          boundary_extension?: unknown;
          curve: { curve_extension?: unknown };
        };
        right_boundary: {
          virtual?: boolean;
          boundary_extension?: unknown;
          curve: { curve_extension?: unknown };
        };
      }>
    )[0]!;

    expect(out.central_curve.central_extension).toEqual({ keep: 'central' });
    expect(out.left_boundary.boundary_extension).toEqual({ keep: 'left-boundary' });
    expect(out.left_boundary.curve.curve_extension).toEqual({ keep: 'left-curve' });
    expect(out.left_boundary.length).toBe(25);
    expect(out.right_boundary.boundary_extension).toEqual({ keep: 'right-boundary' });
    expect(out.right_boundary.curve.curve_extension).toEqual({ keep: 'right-curve' });
    expect(out.right_boundary.virtual).toBe(false);
  });

  it('preserves lane boundary extension fields when top-level lane fields are modeled', () => {
    const baseMap = {
      lane: [
        {
          id: { id: 'L_BOUNDARY_ONLY' },
          central_curve: {
            segment: [{ line_segment: { point: [{ x: 0, y: 0 }] } }],
          },
          left_boundary: {
            curve: {
              segment: [{ line_segment: { point: [{ x: 1, y: 1 }] } }],
            },
            length: 3,
            boundary_type: [],
          },
          right_boundary: {
            curve: {
              segment: [{ line_segment: { point: [{ x: 2, y: 2 }] } }],
            },
            boundary_extension: { keep: 'right-boundary-only' },
            boundary_type: [],
          },
          type: 2,
          turn: 1,
          direction: 1,
          overlap_id: [],
          predecessor_id: [],
          successor_id: [],
          left_neighbor_forward_lane_id: [],
          right_neighbor_forward_lane_id: [],
          left_neighbor_reverse_lane_id: [],
          right_neighbor_reverse_lane_id: [],
          self_reverse_lane_id: [],
          left_sample: [],
          right_sample: [],
          left_road_sample: [],
          right_road_sample: [],
        },
      ],
    };
    const entities = apolloMapToEntities(baseMap) as LaneEntity[];
    entities[0] = {
      ...entities[0]!,
      rightBoundary: { ...entities[0]!.rightBoundary, virtual: true },
    };

    const merged = entitiesToApolloMap(baseMap, entities);
    const out = (
      merged.lane as Array<{
        central_curve: { central_extension?: unknown };
        left_boundary: { boundary_extension?: unknown };
        right_boundary: { virtual?: boolean; boundary_extension?: unknown };
      }>
    )[0]!;

    expect(out.central_curve.central_extension).toBeUndefined();
    expect(out.left_boundary.boundary_extension).toBeUndefined();
    expect(out.right_boundary.boundary_extension).toEqual({ keep: 'right-boundary-only' });
    expect(out.right_boundary.virtual).toBe(true);
  });

  it('preserves nested unmodeled road section, boundary, edge, and curve fields', () => {
    const baseMap = {
      road: [
        {
          id: { id: 'R_NESTED_KEEP' },
          type: 1,
          section: [
            {
              id: { id: 'section_1' },
              lane_id: [{ id: 'lane_old' }],
              section_extension: { keep: 'section' },
              boundary: {
                boundary_extension: { keep: 'boundary' },
                outer_polygon: {
                  polygon_extension: { keep: 'outer' },
                  edge: [
                    {
                      type: 1,
                      edge_extension: { keep: 'edge' },
                      curve: {
                        segment: [{ line_segment: { point: [{ x: 1, y: 2 }] } }],
                        curve_extension: { keep: 'curve' },
                      },
                    },
                  ],
                },
                hole: [
                  {
                    polygon_extension: { keep: 'hole' },
                    edge: [
                      {
                        type: 3,
                        edge_extension: { keep: 'hole-edge' },
                        curve: {
                          segment: [{ line_segment: { point: [{ x: 3, y: 4 }] } }],
                          curve_extension: { keep: 'hole-curve' },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const entities = apolloMapToEntities(baseMap) as RoadEntity[];
    entities[0] = {
      ...entities[0]!,
      sections: [{ ...entities[0]!.sections[0]!, laneIds: ['lane_new'] }],
    };

    const merged = entitiesToApolloMap(baseMap, entities);
    const out = (
      merged.road as Array<{
        section: Array<{
          lane_id: Array<{ id: string }>;
          section_extension?: unknown;
          boundary: {
            boundary_extension?: unknown;
            outer_polygon: {
              polygon_extension?: unknown;
              edge: Array<{
                edge_extension?: unknown;
                curve: { curve_extension?: unknown };
              }>;
            };
            hole: Array<{
              polygon_extension?: unknown;
              edge: Array<{
                edge_extension?: unknown;
                curve: { curve_extension?: unknown };
              }>;
            }>;
          };
        }>;
      }>
    )[0]!.section[0]!;

    expect(out.lane_id).toEqual([{ id: 'lane_new' }]);
    expect(out.section_extension).toEqual({ keep: 'section' });
    expect(out.boundary.boundary_extension).toEqual({ keep: 'boundary' });
    expect(out.boundary.outer_polygon.polygon_extension).toEqual({ keep: 'outer' });
    expect(out.boundary.outer_polygon.edge[0]!.edge_extension).toEqual({ keep: 'edge' });
    expect(out.boundary.outer_polygon.edge[0]!.curve.curve_extension).toEqual({ keep: 'curve' });
    expect(out.boundary.hole[0]!.polygon_extension).toEqual({ keep: 'hole' });
    expect(out.boundary.hole[0]!.edge[0]!.edge_extension).toEqual({ keep: 'hole-edge' });
    expect(out.boundary.hole[0]!.edge[0]!.curve.curve_extension).toEqual({ keep: 'hole-curve' });
  });

  it('preserves road boundary edge extensions when section fields are modeled', () => {
    const baseMap = {
      road: [
        {
          id: { id: 'R_EDGE_ONLY' },
          type: 1,
          section: [
            {
              id: { id: 'section_1' },
              lane_id: [{ id: 'lane_old' }],
              boundary: {
                outer_polygon: {
                  edge: [
                    {
                      type: 1,
                      edge_extension: { keep: 'edge-only' },
                      curve: {
                        segment: [{ line_segment: { point: [{ x: 1, y: 2 }] } }],
                      },
                    },
                  ],
                },
                hole: [],
              },
            },
          ],
        },
      ],
    };
    const entities = apolloMapToEntities(baseMap) as RoadEntity[];
    entities[0] = {
      ...entities[0]!,
      sections: [{ ...entities[0]!.sections[0]!, laneIds: ['lane_new'] }],
    };

    const merged = entitiesToApolloMap(baseMap, entities);
    const out = (
      merged.road as Array<{
        section: Array<{
          section_extension?: unknown;
          lane_id: Array<{ id: string }>;
          boundary: {
            boundary_extension?: unknown;
            outer_polygon: {
              polygon_extension?: unknown;
              edge: Array<{ edge_extension?: unknown }>;
            };
          };
        }>;
      }>
    )[0]!.section[0]!;

    expect(out.section_extension).toBeUndefined();
    expect(out.boundary.boundary_extension).toBeUndefined();
    expect(out.boundary.outer_polygon.polygon_extension).toBeUndefined();
    expect(out.boundary.outer_polygon.edge[0]!.edge_extension).toEqual({ keep: 'edge-only' });
    expect(out.lane_id).toEqual([{ id: 'lane_new' }]);
  });

  it('preserves duplicate-id raw fields in entity order instead of overwriting by id', () => {
    const baseMap = {
      crosswalk: [
        {
          id: { id: 'CW_DUP' },
          polygon: { point: [{ x: 0, y: 0 }] },
          overlap_id: [],
          extension_field: 'first',
        },
        {
          id: { id: 'CW_DUP' },
          polygon: { point: [{ x: 1, y: 1 }] },
          overlap_id: [],
          extension_field: 'second',
        },
      ],
    };
    const entities = apolloMapToEntities(baseMap);

    const merged = entitiesToApolloMap(baseMap, entities);
    const out = merged.crosswalk as Array<{ extension_field?: string }>;

    expect(out.map((item) => item.extension_field)).toEqual(['first', 'second']);
  });

  it('does not resurrect modeled optional raw fields that the editor cleared', () => {
    const baseMap = {
      junction: [
        {
          id: { id: 'J_CLEAR' },
          polygon: { point: [] },
          overlap_id: [],
          type: 3,
          extension_field: 'keep-me',
        },
      ],
    };
    const entities = apolloMapToEntities(baseMap);
    delete (entities[0] as { type?: unknown }).type;

    const merged = entitiesToApolloMap(baseMap, entities);
    const out = (merged.junction as Array<{ type?: number; extension_field?: unknown }>)[0]!;

    expect(out.type).toBeUndefined();
    expect(out.extension_field).toBe('keep-me');
  });

  it('round-trips multi-segment lane boundary_type entries', () => {
    const rawLane = {
      id: { id: 'L_BOUNDARY' },
      central_curve: {
        segment: [
          {
            line_segment: {
              point: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
              ],
            },
          },
        ],
      },
      left_boundary: {
        length: 100,
        boundary_type: [
          { s: 0, types: [4] },
          { s: 30, types: [2] },
          { s: 60, types: [6] },
        ],
      },
      right_boundary: {
        length: 100,
        boundary_type: [{ s: 0, types: [3] }],
      },
    };
    const map = { lane: [rawLane] };
    const entities = apolloMapToEntities(map);
    expect((entities[0] as LaneEntity).leftBoundary.boundaryType).toEqual([
      { s: 0, types: ['SOLID_WHITE'] },
      { s: 30, types: ['DOTTED_WHITE'] },
      { s: 60, types: ['CURB'] },
    ]);

    const merged = entitiesToApolloMap(map, entities);
    const outLane = (
      merged.lane as Array<{
        left_boundary: { boundary_type: unknown[] };
        right_boundary: { boundary_type: unknown[] };
      }>
    )[0]!;
    expect(outLane.left_boundary.boundary_type).toEqual(rawLane.left_boundary.boundary_type);
    expect(outLane.right_boundary.boundary_type).toEqual(rawLane.right_boundary.boundary_type);
  });
});

describe('entityBridge — borregas integration (full coverage)', () => {
  it.runIf(existsSync(APOLLO_BIN))(
    'imports every Apollo entity type from borregas with the right counts',
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded);
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString!);
      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);
      const counts: Record<string, number> = {};
      for (const e of entities) counts[e.entityType] = (counts[e.entityType] ?? 0) + 1;
      // Reference numbers come from borregas_ave/base_map.bin (verified earlier
      // via decodeMapBin direct probe in binRoundtrip tests).
      expect(counts.lane).toBe(60);
      expect(counts.road).toBe(37);
      expect(counts.crosswalk).toBe(6);
      expect(counts.junction).toBe(2);
      expect(counts.signal).toBe(15);
      expect(counts.stopSign).toBe(2);
      expect(counts.overlap).toBe(143);
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'borregas raw → entities → raw → re-encode bytes preserves lane/road/overlap ids',
    async () => {
      const [{ encodeMapBin }, { apolloMapFromLonLat }] = await Promise.all([
        import('../binCodec'),
        import('../adapter'),
      ]);

      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded)!;
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString);

      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);
      const merged = entitiesToApolloMap(lonLatMap, entities);
      const { map: enuBack } = await apolloMapFromLonLat(merged, projString);
      const reBytes = await encodeMapBin(enuBack);
      const reDecoded = (await decodeMapBin(reBytes)) as {
        lane: Array<{ id: { id: string } }>;
        road: Array<{ id: { id: string } }>;
        overlap: Array<{ id: { id: string } }>;
      };
      const original = decoded as {
        lane: Array<{ id: { id: string } }>;
        road: Array<{ id: { id: string } }>;
        overlap: Array<{ id: { id: string } }>;
      };
      expect(reDecoded.lane.map((l) => l.id.id).sort()).toEqual(
        original.lane.map((l) => l.id.id).sort(),
      );
      expect(reDecoded.road.map((l) => l.id.id).sort()).toEqual(
        original.road.map((l) => l.id.id).sort(),
      );
      expect(reDecoded.overlap.map((l) => l.id.id).sort()).toEqual(
        original.overlap.map((l) => l.id.id).sort(),
      );
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'imports all 6 borregas crosswalks as CrosswalkEntity records',
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded);
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString!);
      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);
      const crosswalks = entities.filter((e) => e.entityType === 'crosswalk');
      expect(crosswalks).toHaveLength(6);
      // Each borregas crosswalk has overlap_id references
      for (const cw of crosswalks as CrosswalkEntity[]) {
        expect(cw.id).toBeTruthy();
        expect(cw.overlapIds.length).toBeGreaterThan(0);
        expect(cw.polygon.points.length).toBeGreaterThanOrEqual(3);
        // Coordinates are lon/lat (Sunnyvale)
        expect(cw.polygon.points[0]!.x).toBeGreaterThan(-122.5);
        expect(cw.polygon.points[0]!.x).toBeLessThan(-121.5);
        expect(cw.polygon.points[0]!.y).toBeGreaterThan(37);
        expect(cw.polygon.points[0]!.y).toBeLessThan(38);
      }
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'round-trips edited crosswalks back into the raw map',
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded);
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString!);
      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);

      // Edit one crosswalk: change its first point's longitude
      const cw0 = entities[0] as CrosswalkEntity;
      const originalLon = cw0.polygon.points[0]!.x;
      cw0.polygon.points[0]!.x = originalLon + 0.001;

      const merged = entitiesToApolloMap(lonLatMap, entities);
      const editedCw = (
        merged.crosswalk as Array<{ id: { id: string }; polygon: { point: Array<{ x: number }> } }>
      )[0]!;
      expect(editedCw.id.id).toBe(cw0.id);
      expect(editedCw.polygon.point[0]!.x).toBeCloseTo(originalLon + 0.001, 6);
    },
  );
});
