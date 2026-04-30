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
});
