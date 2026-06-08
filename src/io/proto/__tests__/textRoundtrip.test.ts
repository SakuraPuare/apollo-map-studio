import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'node:path';
import { decodeMapText, encodeMapText } from '../textCodec';
import { decodeMapBin, encodeMapBin } from '../binCodec';

const FIXTURES = path.resolve(import.meta.dirname, '../../__fixtures__/apollo');
const APOLLO_DEMO_TXT = path.join(FIXTURES, 'demo/base_map.txt');
const APOLLO_DREAMVIEW_TXT = path.join(FIXTURES, 'dreamview/base_map.txt');
const APOLLO_BORREGAS_BIN = path.join(FIXTURES, 'borregas_ave/base_map.bin');

describe('Apollo Map proto text codec', () => {
  it.runIf(existsSync(APOLLO_DEMO_TXT))(
    'parses Apollo demo/base_map.txt and round-trips it (txt → obj → txt → obj equality)',
    async () => {
      const original = readFileSync(APOLLO_DEMO_TXT, 'utf8');
      const obj1 = await decodeMapText(original);
      const txt = await encodeMapText(obj1);
      const obj2 = await decodeMapText(txt);
      expect(obj2).toEqual(obj1);
    },
  );

  it.runIf(existsSync(APOLLO_DREAMVIEW_TXT))(
    'parses Apollo dreamview/base_map.txt successfully',
    async () => {
      const original = readFileSync(APOLLO_DREAMVIEW_TXT, 'utf8');
      const obj = (await decodeMapText(original)) as { lane?: unknown[] };
      expect(Array.isArray(obj.lane)).toBe(true);
      expect((obj.lane as unknown[]).length).toBeGreaterThan(0);
    },
  );

  it.runIf(existsSync(APOLLO_BORREGAS_BIN))(
    'bin → txt → bin preserves message content (cross-format round-trip)',
    async () => {
      const binBytes = new Uint8Array(readFileSync(APOLLO_BORREGAS_BIN));
      const fromBin = await decodeMapBin(binBytes);
      const asTxt = await encodeMapText(fromBin);
      const fromTxt = await decodeMapText(asTxt);

      // Sanity: header + entity counts intact
      const a = fromBin as { header?: { version?: unknown }; lane?: unknown[]; road?: unknown[] };
      const b = fromTxt as { header?: { version?: unknown }; lane?: unknown[]; road?: unknown[] };
      expect((b.lane ?? []).length).toBe((a.lane ?? []).length);
      expect((b.road ?? []).length).toBe((a.road ?? []).length);

      // Re-encode txt-derived object back to bin and compare on lane ids
      const reBin = await encodeMapBin(fromTxt);
      const fromReBin = (await decodeMapBin(reBin)) as {
        lane: Array<{ id: { id: string } }>;
      };
      const original = fromBin as { lane: Array<{ id: { id: string } }> };
      expect(fromReBin.lane.map((l) => l.id.id)).toEqual(original.lane.map((l) => l.id.id));
    },
  );

  it('encodes scalar types per Google text-format spec', async () => {
    // Build a small obj using the real schema and ensure encoder shape is correct.
    const input = {
      header: {
        version: new TextEncoder().encode('1.500000'),
        date: new TextEncoder().encode('2024-01-01'),
        left: 100.5,
        top: 200.25,
      },
    };
    const text = await encodeMapText(input);
    expect(text).toContain('header {');
    expect(text).toContain('version: "1.500000"');
    expect(text).toContain('date: "2024-01-01"');
    expect(text).toContain('left: 100.5');
    expect(text).toContain('top: 200.25');
    // Round-trip
    const back = (await decodeMapText(text)) as {
      header: { left: number; top: number; version: Uint8Array };
    };
    expect(back.header.left).toBe(100.5);
    expect(back.header.top).toBe(200.25);
    expect(new TextDecoder().decode(back.header.version)).toBe('1.500000');
  });

  it('round-trips nested messages and repeated fields', async () => {
    const input = {
      crosswalk: [
        {
          id: { id: 'cw_1' },
          polygon: {
            point: [
              { x: 1.5, y: 2.5, z: 0 },
              { x: 3.5, y: 4.5, z: 0 },
              { x: 5.5, y: 6.5, z: 0 },
            ],
          },
          overlap_id: [{ id: 'ov_1' }, { id: 'ov_2' }],
        },
      ],
    };
    const text = await encodeMapText(input);
    expect(text).toContain('crosswalk {');
    expect(text).toContain('id: "cw_1"');
    expect(text).toContain('point {');
    const back = await decodeMapText(text);
    expect(back).toEqual(input);
  });

  it('round-trips editor_meta entity map fields through text format', async () => {
    const input = {
      editor_meta: {
        version: 1,
        entity: {
          'lane:lane_1': {
            geometry_kind: 1,
          },
          'area:area_1': {
            geometry_source: {
              draw_tool: 4,
              rect: {
                p1: { x: 1, y: 2, z: 0 },
                p2: { x: 3, y: 4, z: 0 },
                rotation: 0.25,
              },
            },
          },
        },
      },
    };

    const text = await encodeMapText(input);
    expect(text).toContain('editor_meta {');
    expect(text).toContain('entity {');
    expect(text).toContain('key: "lane:lane_1"');
    expect(text).toContain('geometry_kind: LINESTRING');
    expect(text).toContain('key: "area:area_1"');
    expect(text).toContain('draw_tool: DRAW_ROTATED_RECT');

    const back = await decodeMapText(text);
    expect(back).toEqual(input);
  });

  it('encodes all editor_meta enum names from the real schema and decodes them back', async () => {
    const input = {
      editor_meta: {
        version: 1,
        entity: {
          'lane:line': { geometry_kind: 1 },
          'area:polygon': { geometry_kind: 2 },
          'lane:bezier': {
            geometry_source: {
              draw_tool: 1,
              bezier: {
                anchor: [{ point: { x: 1, y: 2 } }, { point: { x: 3, y: 4 } }],
              },
            },
          },
          'signal:arc': { geometry_source: { draw_tool: 2, arc: {} } },
          'lane:catmull': {
            geometry_source: {
              draw_tool: 3,
              catmull_rom: {
                point: [
                  { x: 5, y: 6 },
                  { x: 7, y: 8 },
                ],
              },
            },
          },
          'area:rect': { geometry_source: { draw_tool: 4, rect: {} } },
        },
      },
    };

    const text = await encodeMapText(input);
    expect(text).toContain('geometry_kind: LINESTRING');
    expect(text).toContain('geometry_kind: POLYGON');
    expect(text).toContain('draw_tool: DRAW_BEZIER');
    expect(text).toContain('draw_tool: DRAW_ARC');
    expect(text).toContain('draw_tool: DRAW_CATMULL_ROM');
    expect(text).toContain('draw_tool: DRAW_ROTATED_RECT');

    expect(await decodeMapText(text)).toEqual(input);
  });

  it('preserves z in editor_meta geometry sources through bin -> text -> bin', async () => {
    const input = {
      editor_meta: {
        version: 1,
        entity: {
          'lane:bezier_z': {
            geometry_source: {
              draw_tool: 1,
              bezier: {
                anchor: [
                  {
                    point: { x: 1, y: 2, z: 3 },
                    handle_out: { x: 4, y: 5, z: 6 },
                  },
                  {
                    point: { x: 7, y: 8, z: 9 },
                    handle_in: { x: 10, y: 11, z: 12 },
                  },
                ],
              },
            },
          },
          'signal:arc_z': {
            geometry_source: {
              draw_tool: 2,
              arc: {
                p1: { x: 13, y: 14, z: 15 },
                p2: { x: 16, y: 17, z: 18 },
                p3: { x: 19, y: 20, z: 21 },
              },
            },
          },
          'lane:catmull_z': {
            geometry_source: {
              draw_tool: 3,
              catmull_rom: {
                point: [
                  { x: 22, y: 23, z: 24 },
                  { x: 25, y: 26, z: 27 },
                ],
              },
            },
          },
          'area:rect_z': {
            geometry_source: {
              draw_tool: 4,
              rect: {
                p1: { x: 28, y: 29, z: 30 },
                p2: { x: 31, y: 32, z: 33 },
                rotation: 0.5,
              },
            },
          },
        },
      },
    };

    const decodedFromBin = await decodeMapBin(await encodeMapBin(input));
    const text = await encodeMapText(decodedFromBin);
    expect(text).toContain('z: 3');
    expect(text).toContain('z: 33');

    const decodedFromText = await decodeMapText(text);
    const decodedFromReBin = await decodeMapBin(await encodeMapBin(decodedFromText));
    expect(decodedFromReBin).toEqual(decodedFromBin);
  });

  it('omits absent optional fields when encoding map text', async () => {
    const input = {
      lane: [
        {
          id: { id: 'lane_without_optionals' },
          central_curve: {
            segment: [
              {
                line_segment: {
                  point: [
                    { x: 1, y: 2 },
                    { x: 3, y: 4 },
                  ],
                },
              },
            ],
          },
          left_boundary: { curve: { segment: [] }, boundary_type: [] },
          right_boundary: { curve: { segment: [] }, boundary_type: [] },
          predecessor_id: [],
          successor_id: [],
          left_neighbor_forward_lane_id: [],
          right_neighbor_forward_lane_id: [],
          left_neighbor_reverse_lane_id: [],
          right_neighbor_reverse_lane_id: [],
          self_reverse_lane_id: [],
          overlap_id: [],
          left_sample: [],
          right_sample: [],
          left_road_sample: [],
          right_road_sample: [],
        },
      ],
      editor_meta: {
        version: 1,
        entity: {
          'area:rect_without_z': {
            geometry_source: {
              draw_tool: 4,
              rect: {
                p1: { x: 5, y: 6 },
                p2: { x: 7, y: 8 },
                rotation: 0,
              },
            },
          },
        },
      },
    };

    const text = await encodeMapText(input);
    expect(text).not.toContain('start_position');
    expect(text).not.toContain('s:');
    expect(text).not.toContain('heading');
    expect(text).not.toContain('length');
    expect(text).not.toContain('speed_limit');
    expect(text).not.toContain('z:');

    expect(await decodeMapText(text)).toEqual({
      lane: [
        {
          id: { id: 'lane_without_optionals' },
          central_curve: {
            segment: [
              {
                line_segment: {
                  point: [
                    { x: 1, y: 2 },
                    { x: 3, y: 4 },
                  ],
                },
              },
            ],
          },
          left_boundary: { curve: {} },
          right_boundary: { curve: {} },
        },
      ],
      editor_meta: input.editor_meta,
    });
  });
});
