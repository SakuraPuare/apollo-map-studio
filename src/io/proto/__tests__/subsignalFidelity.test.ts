/**
 * Subsignal.location wire-byte fidelity regression.
 *
 * `apollo.hdmap.Subsignal.location` is `optional` in proto2; Apollo's own
 * proto comment on the field says "now no data support" and real maps
 * (Junction_V1.0, xh_2025_contest, Sunnyvale, …) almost never write it.
 *
 * Pre-fix the bridge defaulted absent values to `{x:0, y:0}` on import and
 * unconditionally emitted them on export, so a 63-subsignal Junction map
 * acquired 63 spurious zero-points on every round trip — corrupting the
 * .bin compared to the source.
 *
 * Post-fix invariant (asserted here): if the source omitted `location`,
 * a round trip through entityBridge must omit it too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { decodeMapBin } from '../binCodec';
import { apolloMapToEntities, entitiesToApolloMap } from '../entityBridge';

const JUNCTION_BIN = '/home/bob/apollo-map-studio/map_data/Junction_V1.0/base_map.bin';

interface RawSubsignal {
  id?: { id?: string };
  type?: number;
  location?: { x?: number; y?: number; z?: number };
}
interface RawSignal {
  id?: { id?: string };
  subsignal?: RawSubsignal[];
}

function collectSubsignals(map: Record<string, unknown>): {
  signalId: string;
  index: number;
  hasLocation: boolean;
}[] {
  const out: { signalId: string; index: number; hasLocation: boolean }[] = [];
  const signals = (map.signal ?? []) as RawSignal[];
  for (const sig of signals) {
    const subs = sig.subsignal ?? [];
    subs.forEach((sub, i) => {
      out.push({
        signalId: sig.id?.id ?? '',
        index: i,
        // Treat null as missing too, since protobufjs never produces null
        // for absent message fields but defensive code paths might.
        hasLocation: sub.location !== undefined && sub.location !== null,
      });
    });
  }
  return out;
}

describe('Subsignal.location proto2-optional fidelity', () => {
  it.runIf(existsSync(JUNCTION_BIN))(
    'preserves "location absent" through a bridge round trip on Junction_V1.0',
    async () => {
      const bytes = new Uint8Array(readFileSync(JUNCTION_BIN));
      const decoded = (await decodeMapBin(bytes)) as Record<string, unknown>;

      // Note: Junction_V1.0 has a null/empty projection header. We
      // intentionally skip the lon/lat adapter here — the entityBridge
      // operates structurally on PointENU values and is projection-
      // agnostic. The fidelity property under test is purely about
      // which optional fields are present, not their numeric values.
      const before = collectSubsignals(decoded);
      expect(before.length).toBeGreaterThan(0);

      const entities = apolloMapToEntities(decoded as Parameters<typeof apolloMapToEntities>[0]);
      const merged = entitiesToApolloMap(decoded, entities);
      const after = collectSubsignals(merged);

      // Same subsignal cardinality (no drops, no clones).
      expect(after.length).toBe(before.length);

      // Per-subsignal: a missing `location` on the source must remain
      // missing after the round trip. (A present location may legally
      // round-trip — that's the user-drawn signal path.)
      for (let i = 0; i < before.length; i++) {
        const b = before[i]!;
        const a = after[i]!;
        expect(a.signalId).toBe(b.signalId);
        if (!b.hasLocation) {
          expect(a.hasLocation).toBe(false);
        }
      }

      // Concrete coverage assertion: Junction_V1.0 ships 63 location-
      // less subsignals. If this number changes, the fixture changed
      // (or somebody re-introduced the {x:0,y:0} default).
      const missingBefore = before.filter((s) => !s.hasLocation).length;
      const missingAfter = after.filter((s) => !s.hasLocation).length;
      expect(missingBefore).toBeGreaterThan(0);
      expect(missingAfter).toBe(missingBefore);
    },
    60_000,
  );
});
