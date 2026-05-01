/**
 * TEMP audit (delete after report consumed): walks every base_map.bin under
 * map_data/, decodes via the project's protobufjs loader, then runs each
 * decoded map through `apolloMapToEntities` → `entitiesToApolloMap` and
 * diffs the result field-by-field. Writes a JSON report to /tmp/.
 *
 * Verdict shape: this is the source-of-truth for "100% Apollo fidelity?"
 * Do NOT delete until the gap report is acted on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import * as protobuf from 'protobufjs';
import { decodeMapBin, encodeMapBin } from '../binCodec';
import { getMapType } from '../loader';
import { apolloMapToEntities, entitiesToApolloMap } from '../entityBridge';
import { MAP_DATA_ROOT } from './mapDataPaths';

const HAS_CORPUS = existsSync(MAP_DATA_ROOT);

interface MapSample {
  name: string;
  binPath: string;
  size: number;
}

function discoverMaps(): MapSample[] {
  const out: MapSample[] = [];
  if (!existsSync(MAP_DATA_ROOT)) return out;
  const visit = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes('base_map.bin')) {
      const binPath = path.join(dir, 'base_map.bin');
      const size = readFileSync(binPath).byteLength;
      const rel = path.relative(MAP_DATA_ROOT, dir) || path.basename(dir);
      out.push({ name: rel, binPath, size });
    }
    for (const e of entries) {
      const p = path.join(dir, e);
      try {
        if (statSync(p).isDirectory()) visit(p, depth + 1);
      } catch {
        // ignore (broken symlink, EACCES, etc.)
      }
    }
  };
  visit(MAP_DATA_ROOT, 0);
  // dedupe by name (nested map_data/map_data/* duplicates the top-level)
  const seen = new Set<string>();
  return out.filter((m) => {
    const base = path.basename(m.binPath.replace(/\/base_map\.bin$/, ''));
    const key = `${base}:${m.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Walk a decoded protobufjs message tree against its Type schema and produce
 * the *set* of field paths that are populated. Repeated fields collapse to
 * `path[]` (we don't enumerate per-index, otherwise the output explodes).
 */
function collectSetPaths(
  type: protobuf.Type,
  msg: unknown,
  prefix: string,
  out: Set<string>,
  countByPath?: Map<string, number>,
) {
  if (msg === null || msg === undefined || typeof msg !== 'object') return;
  const src = msg as Record<string, unknown>;
  for (const field of type.fieldsArray) {
    field.resolve();
    const v = src[field.name];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && v.length === 0) continue;
    const fieldPath = prefix ? `${prefix}.${field.name}` : field.name;
    out.add(fieldPath);
    if (countByPath) countByPath.set(fieldPath, (countByPath.get(fieldPath) ?? 0) + 1);
    if (field.resolvedType instanceof protobuf.Type) {
      const sub = field.resolvedType;
      const items = Array.isArray(v) ? v : [v];
      for (const item of items) {
        collectSetPaths(sub, item, fieldPath, out, countByPath);
      }
    }
  }
}

interface MapAudit {
  name: string;
  size: number;
  totals: Record<string, number>; // entity bucket → count
  originalPathCount: number;
  roundtripPathCount: number;
  pathsLostOnRoundtrip: string[];
  pathsAddedByRoundtrip: string[];
  bridgeImportFailures: number; // entities where fromProto returned null
  valueMismatches: ValueMismatchSummary[]; // per-entity field-level drift
  binRoundtrip: { originalBytes: number; reEncodedBytes: number; deltaBytes: number };
}

interface ValueMismatchSummary {
  bucket: string;
  totalEntities: number;
  pathHits: Record<string, number>; // path -> count of entities where value differs
  sampleMismatches: Array<{ entityId: string; path: string; expected: unknown; actual: unknown }>;
}

const SAMPLE_LIMIT_PER_BUCKET = 5;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array);
}

function eqPrimitive(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // protobufjs may return bytes as Uint8Array on one side and plain Array on the
  // other after re-encode — equality on bytes content rather than shape.
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  return false;
}

/** Diff two protobuf-decoded message trees and emit field paths whose VALUES differ. */
function diffValues(
  type: protobuf.Type,
  a: unknown,
  b: unknown,
  prefix: string,
  out: Array<{ path: string; expected: unknown; actual: unknown }>,
) {
  if (a == null && b == null) return;
  if (!isPlainObject(a) || !isPlainObject(b)) {
    if (!eqPrimitive(a, b)) out.push({ path: prefix || '<root>', expected: a, actual: b });
    return;
  }
  for (const field of type.fieldsArray) {
    field.resolve();
    const va = (a as Record<string, unknown>)[field.name];
    const vb = (b as Record<string, unknown>)[field.name];
    const here = prefix ? `${prefix}.${field.name}` : field.name;
    const aSet = !(va === undefined || va === null || (Array.isArray(va) && va.length === 0));
    const bSet = !(vb === undefined || vb === null || (Array.isArray(vb) && vb.length === 0));
    if (!aSet && !bSet) continue;
    if (aSet !== bSet) {
      out.push({ path: here, expected: va, actual: vb });
      continue;
    }
    if (field.resolvedType instanceof protobuf.Type) {
      const sub = field.resolvedType;
      if (Array.isArray(va) && Array.isArray(vb)) {
        if (va.length !== vb.length) {
          out.push({ path: `${here}[length]`, expected: va.length, actual: vb.length });
          continue;
        }
        for (let i = 0; i < va.length; i++) {
          diffValues(sub, va[i], vb[i], `${here}[${i}]`, out);
        }
      } else {
        diffValues(sub, va, vb, here, out);
      }
    } else {
      if (Array.isArray(va) && Array.isArray(vb)) {
        if (va.length !== vb.length) {
          out.push({ path: `${here}[length]`, expected: va.length, actual: vb.length });
          continue;
        }
        for (let i = 0; i < va.length; i++) {
          if (!eqPrimitive(va[i], vb[i]))
            out.push({ path: `${here}[${i}]`, expected: va[i], actual: vb[i] });
        }
      } else if (!eqPrimitive(va, vb)) {
        out.push({ path: here, expected: va, actual: vb });
      }
    }
  }
}

describe('Apollo map_data fidelity audit (TEMP)', () => {
  const maps = discoverMaps();

  it.runIf(HAS_CORPUS)('discovers map_data corpus', () => {
    expect(maps.length).toBeGreaterThan(0);

    console.log(
      `[fidelity] discovered ${maps.length} maps:\n${maps
        .map((m) => `  ${m.name} (${(m.size / 1024 / 1024).toFixed(2)} MB)`)
        .join('\n')}`,
    );
  });

  it.runIf(HAS_CORPUS)(
    'audits every map_data .bin and writes report',
    { timeout: 10 * 60_000 },
    async () => {
      const MapType = await getMapType();
      const audits: MapAudit[] = [];
      const populationCount = new Map<string, number>(); // count of maps in which a path appears
      const populationTotal = new Map<string, number>(); // total occurrences across all maps

      for (const m of maps) {
        console.log(`[fidelity] auditing ${m.name} ...`);
        const bytes = new Uint8Array(readFileSync(m.binPath));
        const original = (await decodeMapBin(bytes)) as Record<string, unknown>;

        const originalPaths = new Set<string>();
        const perMapCount = new Map<string, number>();
        collectSetPaths(MapType, original, '', originalPaths, perMapCount);
        for (const p of originalPaths) {
          populationCount.set(p, (populationCount.get(p) ?? 0) + 1);
        }
        for (const [k, v] of perMapCount) {
          populationTotal.set(k, (populationTotal.get(k) ?? 0) + v);
        }

        const totals: Record<string, number> = {};
        for (const [k, v] of Object.entries(original)) {
          if (Array.isArray(v)) totals[k] = v.length;
        }

        // Roundtrip via the bridge:
        let bridgeImportFailures = 0;
        const entities = apolloMapToEntities(original as never);
        // Count "fromProto returned null" by comparing input array length vs entity count per type.
        const inputCounts: Record<string, number> = {};
        for (const k of [
          'crosswalk',
          'junction',
          'lane',
          'stop_sign',
          'signal',
          'yield',
          'overlap',
          'clear_area',
          'speed_bump',
          'road',
          'parking_space',
          'pnc_junction',
          'rsu',
          'ad_area',
          'barrier_gate',
        ]) {
          const arr = (original[k] as unknown[]) ?? [];
          inputCounts[k] = Array.isArray(arr) ? arr.length : 0;
        }
        const outputCountsByEntityType: Record<string, number> = {};
        for (const e of entities) {
          outputCountsByEntityType[e.entityType] =
            (outputCountsByEntityType[e.entityType] ?? 0) + 1;
        }
        const fieldToEntityType: Record<string, string> = {
          crosswalk: 'crosswalk',
          junction: 'junction',
          lane: 'lane',
          stop_sign: 'stopSign',
          signal: 'signal',
          yield: 'yieldSign',
          overlap: 'overlap',
          clear_area: 'clearArea',
          speed_bump: 'speedBump',
          road: 'road',
          parking_space: 'parkingSpace',
          pnc_junction: 'pncJunction',
          rsu: 'rsu',
          ad_area: 'area',
          barrier_gate: 'barrierGate',
        };
        for (const [field, etype] of Object.entries(fieldToEntityType)) {
          const lost = (inputCounts[field] ?? 0) - (outputCountsByEntityType[etype] ?? 0);
          if (lost > 0) bridgeImportFailures += lost;
        }

        const roundtripped = entitiesToApolloMap(original, entities);
        const roundtripPaths = new Set<string>();
        collectSetPaths(MapType, roundtripped, '', roundtripPaths);

        const lost = [...originalPaths].filter((p) => !roundtripPaths.has(p)).sort();
        const added = [...roundtripPaths].filter((p) => !originalPaths.has(p)).sort();

        // ── Value-level diff per entity bucket ──────────────────────────────
        const valueMismatches: ValueMismatchSummary[] = [];
        for (const [field, _etype] of Object.entries(fieldToEntityType)) {
          void _etype;
          const srcArr = (original[field] as unknown[]) ?? [];
          const dstArr = (roundtripped[field] as unknown[]) ?? [];
          if (!Array.isArray(srcArr) || srcArr.length === 0) continue;
          const subFieldName = field;
          const mapField = MapType.fields[subFieldName];
          if (!mapField) continue;
          mapField.resolve();
          const subType = mapField.resolvedType;
          if (!(subType instanceof protobuf.Type)) continue;
          const pathHits: Record<string, number> = {};
          const sampleMismatches: ValueMismatchSummary['sampleMismatches'] = [];
          const len = Math.min(srcArr.length, dstArr.length);
          for (let i = 0; i < len; i++) {
            const diffs: Array<{ path: string; expected: unknown; actual: unknown }> = [];
            diffValues(subType, srcArr[i], dstArr[i], '', diffs);
            if (diffs.length > 0) {
              const id =
                ((srcArr[i] as { id?: { id?: string } })?.id?.id as string | undefined) ??
                `idx#${i}`;
              for (const d of diffs) {
                pathHits[d.path] = (pathHits[d.path] ?? 0) + 1;
                if (sampleMismatches.length < SAMPLE_LIMIT_PER_BUCKET) {
                  sampleMismatches.push({
                    entityId: id,
                    path: d.path,
                    expected: d.expected,
                    actual: d.actual,
                  });
                }
              }
            }
          }
          if (Object.keys(pathHits).length > 0 || srcArr.length !== dstArr.length) {
            valueMismatches.push({
              bucket: field,
              totalEntities: srcArr.length,
              pathHits,
              sampleMismatches,
            });
          }
        }

        // ── Bin-level byte roundtrip ────────────────────────────────────────
        let reEncoded: Uint8Array;
        try {
          reEncoded = await encodeMapBin(roundtripped as Record<string, unknown>);
        } catch (err) {
          // capture failure as 0 bytes; surface in JSON via deltaBytes=NaN sentinel

          console.warn(`[fidelity] encode failed for ${m.name}: ${(err as Error).message}`);
          reEncoded = new Uint8Array();
        }

        audits.push({
          name: m.name,
          size: m.size,
          totals,
          originalPathCount: originalPaths.size,
          roundtripPathCount: roundtripPaths.size,
          valueMismatches,
          binRoundtrip: {
            originalBytes: bytes.byteLength,
            reEncodedBytes: reEncoded.byteLength,
            deltaBytes: reEncoded.byteLength - bytes.byteLength,
          },
          pathsLostOnRoundtrip: lost,
          pathsAddedByRoundtrip: added,
          bridgeImportFailures,
        });
      }

      const allLostUnion = new Set<string>();
      const lostByPath = new Map<string, number>(); // # of maps where path is lost
      for (const a of audits) {
        for (const p of a.pathsLostOnRoundtrip) {
          allLostUnion.add(p);
          lostByPath.set(p, (lostByPath.get(p) ?? 0) + 1);
        }
      }

      const populated = [...populationCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([path, mapCount]) => ({
          path,
          mapsWithField: mapCount,
          totalOccurrences: populationTotal.get(path) ?? 0,
          lostInMaps: lostByPath.get(path) ?? 0,
        }));

      const report = {
        generatedAt: new Date().toISOString(),
        mapCount: audits.length,
        audits,
        gapsByPath: populated.filter((p) => p.lostInMaps > 0),
        allPopulatedPaths: populated,
      };

      const outPath = '/tmp/apollo_fidelity_report.json';
      writeFileSync(outPath, JSON.stringify(report, null, 2));

      console.log(`[fidelity] report written to ${outPath}`);

      console.log(`[fidelity] gaps (paths lost in ≥1 map): ${report.gapsByPath.length}`);

      // Fail loud if anything was lost — this test is a tripwire.
      expect(report.gapsByPath, 'paths lost on roundtrip').toEqual([]);
      const totalMismatches = report.audits.reduce(
        (s, a) =>
          s +
          a.valueMismatches.reduce(
            (ss, vm) => ss + Object.values(vm.pathHits).reduce((sss, c) => sss + c, 0),
            0,
          ),
        0,
      );
      expect(totalMismatches, 'value-level mismatches across all maps').toBe(0);
      const totalDeltaBytes = report.audits.reduce((s, a) => s + a.binRoundtrip.deltaBytes, 0);
      expect(totalDeltaBytes, 'cumulative bin roundtrip byte delta').toBe(0);
    },
  );
});
