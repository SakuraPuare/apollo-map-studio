import { useMemo } from 'react';
import { Section, Value } from '@/components/ui/form-fields';
import { useApolloMapStore } from '@/store/apolloMapStore';

// ─────────────────────────────────────────────────────────────────────
// Map Metadata (read-only)
//
// Surfaces the imported `apollo.hdmap.Map.header` fields. Apollo's
// MapHeader carries 12 optional fields (version, date, projection.proj,
// district, generation, rev_major, rev_minor, left, top, right, bottom,
// vendor) that the editor previously had no way to display.
//
// **Cross-agent gap (intentional, surface clean):**
// The current `apolloMapStore` is a read-after-import bucket — it has
// no `setHeader(...)` mutator and `mapStore` doesn't carry a header at
// all. Wiring an editable header would require:
//   1. Adding an `updateHeader` action to `apolloMapStore`, OR
//   2. Promoting `MapHeader` into `mapStore` proper (so undo/redo/zundo
//      see header edits as part of the history transaction), AND
//   3. Threading header writes back through the export adapter
//      (`src/io/proto/adapter.ts` already reads from `map.header`).
//
// All three touch cross-cutting concerns (store shape, undo semantics,
// IO contract) which are explicitly out of scope for this UI patch.
// Read-only here is the right P8 call: no broken contract, no half-done
// editor. A follow-up sprint or the data-layer agent owns the wiring.
// ─────────────────────────────────────────────────────────────────────

interface RawHeader {
  version?: unknown;
  date?: unknown;
  projection?: { proj?: unknown } | null;
  district?: unknown;
  generation?: unknown;
  rev_major?: unknown;
  rev_minor?: unknown;
  revMajor?: unknown;
  revMinor?: unknown;
  left?: unknown;
  top?: unknown;
  right?: unknown;
  bottom?: unknown;
  vendor?: unknown;
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (value instanceof Uint8Array) {
    try {
      const text = new TextDecoder().decode(value);
      return text.length > 0 ? text : null;
    } catch {
      return null;
    }
  }
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmt(s: string | null): string {
  return s == null ? '—' : s;
}

function fmtNum(n: number | null, digits = 6): string {
  if (n == null) return '—';
  // Lat/lon corners are typically ~degrees; UTM bounds are ~meters.
  // Keep precision generous — the user is auditing, not displaying.
  return n.toFixed(digits);
}

export function MapMetadataForm() {
  const rawMap = useApolloMapStore((s) => s.rawMap);
  const storedHeader = useApolloMapStore((s) => s.header);
  const info = useApolloMapStore((s) => s.info);

  const header = useMemo<RawHeader | null>(() => {
    if (storedHeader) return storedHeader as RawHeader;
    if (!rawMap) return null;
    const h = (rawMap as { header?: unknown }).header;
    if (h == null || typeof h !== 'object') return null;
    return h as RawHeader;
  }, [rawMap, storedHeader]);

  if (!info) {
    return (
      <div className="px-3 py-4 text-[11px] text-zinc-500 italic">
        No Apollo map imported. Header metadata becomes available after import.
      </div>
    );
  }

  const proj = header?.projection ? asString(header.projection.proj) : null;
  // Apollo proto uses snake_case on the wire; the bridge may also surface
  // camelCase. Tolerate both so this panel is useful pre-bridge-finalize.
  const revMajor = asString(header?.rev_major) ?? asString(header?.revMajor);
  const revMinor = asString(header?.rev_minor) ?? asString(header?.revMinor);

  return (
    <div className="px-3 py-3">
      <Section title="Source">
        <Value label="File" value={info?.filename ?? '—'} />
        <Value label="Imported" value={info ? new Date(info.importedAt).toLocaleString() : '—'} />
        <Value label="PROJ used" value={info?.projString ?? '—'} />
      </Section>

      <Section title="Header">
        <Value label="Version" value={fmt(asString(header?.version))} />
        <Value label="Date" value={fmt(asString(header?.date))} />
        <Value label="District" value={fmt(asString(header?.district))} />
        <Value label="Generation" value={fmt(asString(header?.generation))} />
        <Value label="Rev Major" value={fmt(revMajor)} />
        <Value label="Rev Minor" value={fmt(revMinor)} />
        <Value label="Vendor" value={fmt(asString(header?.vendor))} />
        <Value label="Projection" value={fmt(proj)} />
      </Section>

      <Section title="Bounds">
        <Value label="Left" value={fmtNum(asNumber(header?.left))} />
        <Value label="Top" value={fmtNum(asNumber(header?.top))} />
        <Value label="Right" value={fmtNum(asNumber(header?.right))} />
        <Value label="Bottom" value={fmtNum(asNumber(header?.bottom))} />
      </Section>

      <div className="mt-3 px-1 text-[10px] text-zinc-600 italic leading-relaxed">
        Read-only — header editing is gated on an `apolloMapStore.updateHeader` action that does not
        exist yet. See `MapMetadataForm.tsx` source comment.
      </div>
    </div>
  );
}
