import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'node:path';
import { decodeMapBin, encodeMapBin } from '../binCodec';
import { getMapType } from '../loader';

const APOLLO_BIN = path.resolve(
  import.meta.dirname,
  '../../__fixtures__/apollo/borregas_ave/base_map.bin',
);

function normalizeDecoded(value: unknown): unknown {
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(normalizeDecoded);
  if (isProtobufByteWrapper(value)) return value.data.map((b) => Number(b));
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      normalizeDecoded(item),
    ]),
  );
}

function isProtobufByteWrapper(value: unknown): value is { data: unknown[] } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    (entries.length === 1 ||
      (entries.length === 2 && 'type' in (value as Record<string, unknown>))) &&
    Array.isArray((value as { data?: unknown }).data) &&
    (value as { data: unknown[] }).data.every((b) => Number.isInteger(b))
  );
}

describe('Apollo Map proto bin codec', () => {
  it('loads the proto schema and resolves the Map type', async () => {
    const Map = await getMapType();
    expect(Map.fullName).toBe('.apollo.hdmap.Map');
    expect(Map.fields.lane).toBeDefined();
    expect(Map.fields.crosswalk).toBeDefined();
  });

  it.runIf(existsSync(APOLLO_BIN))(
    'round-trips Apollo borregas_ave/base_map.bin with normalized structural equality',
    async () => {
      const original = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded1 = await decodeMapBin(original);
      const reEncoded = await encodeMapBin(decoded1);
      const decoded2 = await decodeMapBin(reEncoded);

      expect(normalizeDecoded(decoded2)).toEqual(normalizeDecoded(decoded1));
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'borregas_ave/base_map.bin decodes to a non-empty map with header',
    async () => {
      const original = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = (await decodeMapBin(original)) as {
        lane?: unknown[];
        header?: unknown;
      };
      expect(Array.isArray(decoded.lane)).toBe(true);
      expect((decoded.lane ?? []).length).toBeGreaterThan(0);
      expect(decoded.header).toBeDefined();
    },
  );

  it.runIf(existsSync(APOLLO_BIN))(
    'preserves lane count and ids exactly through one bin → bin cycle',
    async () => {
      const original = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded1 = (await decodeMapBin(original)) as {
        lane: Array<{ id: { id: string } }>;
      };
      const reEncoded = await encodeMapBin(decoded1);
      const decoded2 = (await decodeMapBin(reEncoded)) as {
        lane: Array<{ id: { id: string } }>;
      };
      expect(decoded2.lane.length).toBe(decoded1.lane.length);
      expect(decoded2.lane.map((l) => l.id.id)).toEqual(decoded1.lane.map((l) => l.id.id));
    },
  );
});
