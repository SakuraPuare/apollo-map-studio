import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeMapBin } from '../binCodec';
import { apolloMapToLonLat, readHeaderProjString } from '../adapter';
import { apolloMapToEntities, entitiesToApolloMap } from '../entityBridge';
import { hasMapBin, resolveMapBin } from './mapDataPaths';

/**
 * Round-trip fidelity for `overlap.object[]` lists.
 *
 * Real-world Apollo maps (e.g. sunnyvale_loop) ship `ObjectOverlapInfo`
 * entries whose `overlap_info` oneof is unset — only `{ id }` is filled in.
 * Pre-fix the bridge dropped those entries silently (54+ overlaps in
 * sunnyvale_loop alone lost half their `object[]` participants on
 * decode → encode). The bridge now preserves them as
 * `objectType: 'unknown'` so byte-for-byte counts and id lists match.
 */
const APOLLO_BIN = resolveMapBin('sunnyvale_loop');

interface RawIdRef {
  id: string;
}
interface RawObjectOverlapInfoLite {
  id?: RawIdRef;
}
interface RawOverlapLite {
  id?: RawIdRef;
  object?: RawObjectOverlapInfoLite[];
}

describe('overlap fidelity — sunnyvale_loop', () => {
  it.runIf(hasMapBin('sunnyvale_loop'))(
    'round-trips overlap.object[] lengths and ids exactly',
    { timeout: 120_000 },
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded);
      expect(projString).toBeTruthy();
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString!);

      const inputOverlaps = ((lonLatMap as { overlap?: RawOverlapLite[] }).overlap ?? []).map(
        (ov, i) => ({
          index: i,
          id: ov.id?.id ?? `<missing-${i}>`,
          objectIds: (ov.object ?? []).map((o) => o.id?.id ?? '<missing>'),
        }),
      );

      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);
      const merged = entitiesToApolloMap(lonLatMap, entities) as { overlap?: RawOverlapLite[] };
      const outputOverlaps = (merged.overlap ?? []).map((ov, i) => ({
        index: i,
        id: ov.id?.id ?? `<missing-${i}>`,
        objectIds: (ov.object ?? []).map((o) => o.id?.id ?? '<missing>'),
      }));

      // Same number of overlap entries.
      expect(outputOverlaps.length).toBe(inputOverlaps.length);

      // Build id-keyed lookup for tolerance to in-array reorder (the bridge
      // bucketing should preserve order, but we don't want to wedge the test
      // on emit order — only on data fidelity).
      const outById = new Map(outputOverlaps.map((o) => [o.id, o] as const));

      for (const input of inputOverlaps) {
        const out = outById.get(input.id);
        const inputObjLen = input.objectIds.length;
        expect(out, `missing overlap ${input.id} on round-trip`).toBeDefined();
        expect(
          out!.objectIds.length,
          `overlap ${input.id} object count drift: in=${inputObjLen} out=${out!.objectIds.length}`,
        ).toBe(inputObjLen);
        // Id-list equality (in order — bridge preserves order).
        for (let j = 0; j < inputObjLen; j++) {
          expect(
            out!.objectIds[j],
            `overlap ${input.id} object[${j}] id drift: in=${input.objectIds[j]} out=${out!.objectIds[j]}`,
          ).toBe(input.objectIds[j]);
        }
      }
    },
  );
});
