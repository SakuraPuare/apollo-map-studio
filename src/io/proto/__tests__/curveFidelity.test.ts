import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { decodeMapBin } from '../binCodec';
import { apolloMapToLonLat, readHeaderProjString } from '../adapter';
import { apolloMapToEntities, entitiesToApolloMap } from '../entityBridge';

/**
 * Wire-byte fidelity for `apollo.hdmap.CurveSegment.start_position`.
 *
 * `start_position` is `optional` in proto2; real Apollo maps OMIT it on
 * `signal[].stop_line[].segment[]`, on the analogous oneofs of stop_sign /
 * yield / speed_bump, and on `road[].section[].boundary.outer_polygon
 * .edge[].curve.segment[]`. The bridge previously injected `{x:0, y:0}` for
 * every such segment, producing thousands of spurious diff sites when an
 * unmodified map was decoded → bridged → re-encoded.
 *
 * This test asserts the bridge preserves "absent stays absent" round-trip:
 * for every CurveSegment under stop_line[] (signal/stop_sign/yield/speed_bump)
 * and under road.section.boundary.outer_polygon.edge[].curve.segment[],
 * `start_position === undefined` before the bridge ⇒
 * `start_position === undefined` after the bridge.
 */
const APOLLO_BIN = path.resolve(
  import.meta.dirname,
  '../../../../map_data/map_data/sunnyvale_loop/base_map.bin',
);

interface RawPointLite {
  x?: number;
  y?: number;
  z?: number;
}
interface RawCurveSegmentLite {
  start_position?: RawPointLite;
}
interface RawCurveLite {
  segment?: RawCurveSegmentLite[];
}
interface RawIdLite {
  id?: string;
}
interface RawStopLineHostLite {
  id?: RawIdLite;
  stop_line?: RawCurveLite[];
}
interface RawBoundaryEdgeLite {
  curve?: RawCurveLite;
}
interface RawOuterPolygonLite {
  edge?: RawBoundaryEdgeLite[];
}
interface RawRoadBoundaryLite {
  outer_polygon?: RawOuterPolygonLite;
}
interface RawRoadSectionLite {
  id?: RawIdLite;
  boundary?: RawRoadBoundaryLite;
}
interface RawRoadLite {
  id?: RawIdLite;
  section?: RawRoadSectionLite[];
}
interface RawApolloMapLite {
  signal?: RawStopLineHostLite[];
  stop_sign?: RawStopLineHostLite[];
  yield?: RawStopLineHostLite[];
  speed_bump?: RawStopLineHostLite[];
  road?: RawRoadLite[];
}

interface SegmentSite {
  /** Stable string key identifying the segment across before/after maps. */
  key: string;
  /** Whether `start_position` was present on the raw segment. */
  present: boolean;
}

function collectStopLineSites(
  hosts: RawStopLineHostLite[] | undefined,
  hostKind: string,
): SegmentSite[] {
  const out: SegmentSite[] = [];
  for (const host of hosts ?? []) {
    const hostId = host.id?.id ?? '<no-id>';
    const stopLines = host.stop_line ?? [];
    for (let li = 0; li < stopLines.length; li++) {
      const segs = stopLines[li]?.segment ?? [];
      for (let si = 0; si < segs.length; si++) {
        out.push({
          key: `${hostKind}/${hostId}/stop_line[${li}]/segment[${si}]`,
          present: segs[si]?.start_position !== undefined,
        });
      }
    }
  }
  return out;
}

function collectRoadBoundarySites(roads: RawRoadLite[] | undefined): SegmentSite[] {
  const out: SegmentSite[] = [];
  for (const road of roads ?? []) {
    const roadId = road.id?.id ?? '<no-id>';
    const sections = road.section ?? [];
    for (let secIdx = 0; secIdx < sections.length; secIdx++) {
      const sec = sections[secIdx];
      const sectionId = sec?.id?.id ?? `<sec${secIdx}>`;
      const edges = sec?.boundary?.outer_polygon?.edge ?? [];
      for (let ei = 0; ei < edges.length; ei++) {
        const segs = edges[ei]?.curve?.segment ?? [];
        for (let si = 0; si < segs.length; si++) {
          out.push({
            key: `road/${roadId}/section/${sectionId}/edge[${ei}]/segment[${si}]`,
            present: segs[si]?.start_position !== undefined,
          });
        }
      }
    }
  }
  return out;
}

function collectAllSites(map: RawApolloMapLite): SegmentSite[] {
  return [
    ...collectStopLineSites(map.signal, 'signal'),
    ...collectStopLineSites(map.stop_sign, 'stop_sign'),
    ...collectStopLineSites(map.yield, 'yield'),
    ...collectStopLineSites(map.speed_bump, 'speed_bump'),
    ...collectRoadBoundarySites(map.road),
  ];
}

describe('curve segment fidelity — sunnyvale_loop', () => {
  it.runIf(existsSync(APOLLO_BIN))(
    'preserves absent CurveSegment.start_position through entity bridge round-trip',
    { timeout: 240_000 },
    async () => {
      const bytes = new Uint8Array(readFileSync(APOLLO_BIN));
      const decoded = await decodeMapBin(bytes);
      const projString = readHeaderProjString(decoded);
      expect(projString).toBeTruthy();
      const { map: lonLatMap } = await apolloMapToLonLat(decoded, projString!);

      const beforeSites = collectAllSites(lonLatMap as RawApolloMapLite);
      // Sanity: real sunnyvale_loop ships thousands of stop_line+boundary
      // segments — if zero are seen, something upstream changed and this test
      // would silently pass on an empty walk.
      expect(beforeSites.length).toBeGreaterThan(100);

      const entities = apolloMapToEntities(lonLatMap as Parameters<typeof apolloMapToEntities>[0]);
      const merged = entitiesToApolloMap(lonLatMap, entities) as RawApolloMapLite;
      const afterSites = collectAllSites(merged);

      // Same number of segments emitted.
      expect(afterSites.length).toBe(beforeSites.length);

      const afterByKey = new Map(afterSites.map((s) => [s.key, s] as const));
      const spuriousInjections: string[] = [];
      for (const before of beforeSites) {
        const after = afterByKey.get(before.key);
        expect(after, `missing curve segment site ${before.key} on round-trip`).toBeDefined();
        // Wire-byte fidelity for the bug under test: when source omitted
        // start_position, the round-tripped map must also omit it.
        if (!before.present && after!.present) {
          spuriousInjections.push(before.key);
        }
      }

      expect(
        spuriousInjections,
        `bridge injected start_position on ${spuriousInjections.length} sites that were absent in source (showing first 5: ${spuriousInjections
          .slice(0, 5)
          .join(', ')})`,
      ).toEqual([]);
    },
  );
});
