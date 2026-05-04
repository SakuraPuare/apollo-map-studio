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

interface MetadataRow {
  label: string;
  value: string;
}

function rawHeaderFromMap(rawMap: unknown): RawHeader | null {
  if (!rawMap) return null;
  const header = (rawMap as { header?: unknown }).header;
  return header != null && typeof header === 'object' ? (header as RawHeader) : null;
}

function headerRows(header: RawHeader | null): MetadataRow[] {
  // Apollo proto uses snake_case on the wire; the bridge may also surface
  // camelCase. Tolerate both so this panel is useful pre-bridge-finalize.
  const revMajor = asString(header?.rev_major) ?? asString(header?.revMajor);
  const revMinor = asString(header?.rev_minor) ?? asString(header?.revMinor);
  const proj = header?.projection ? asString(header.projection.proj) : null;

  return [
    { label: '版本', value: fmt(asString(header?.version)) },
    { label: '日期', value: fmt(asString(header?.date)) },
    { label: '区域', value: fmt(asString(header?.district)) },
    { label: '生成方式', value: fmt(asString(header?.generation)) },
    { label: '主版本', value: fmt(revMajor) },
    { label: '次版本', value: fmt(revMinor) },
    { label: '供应方', value: fmt(asString(header?.vendor)) },
    { label: '投影', value: fmt(proj) },
  ];
}

function boundsRows(header: RawHeader | null): MetadataRow[] {
  return [
    { label: '左边界', value: fmtNum(asNumber(header?.left)) },
    { label: '上边界', value: fmtNum(asNumber(header?.top)) },
    { label: '右边界', value: fmtNum(asNumber(header?.right)) },
    { label: '下边界', value: fmtNum(asNumber(header?.bottom)) },
  ];
}

function MetadataSection({ title, rows }: { title: string; rows: MetadataRow[] }) {
  return (
    <Section title={title}>
      {rows.map((row) => (
        <Value key={row.label} label={row.label} value={row.value} />
      ))}
    </Section>
  );
}

function NoMetadataNotice() {
  return (
    <div className="px-3 py-4 text-[11px] text-zinc-500 italic">
      导入 Apollo 地图后，这里会显示源文件和地图头部信息。
    </div>
  );
}

export function MapMetadataForm() {
  const rawMap = useApolloMapStore((s) => s.rawMap);
  const storedHeader = useApolloMapStore((s) => s.header);
  const info = useApolloMapStore((s) => s.info);
  const header = useMemo<RawHeader | null>(
    () => (storedHeader ? (storedHeader as RawHeader) : rawHeaderFromMap(rawMap)),
    [rawMap, storedHeader],
  );

  if (!info) return <NoMetadataNotice />;

  return (
    <div className="px-3 py-3">
      <Section title="来源信息">
        <Value label="文件" value={info.filename} />
        <Value label="导入时间" value={new Date(info.importedAt).toLocaleString()} />
        <Value label="坐标投影" value={info.projString} />
      </Section>
      <MetadataSection title="头部信息" rows={headerRows(header)} />
      <MetadataSection title="地图边界" rows={boundsRows(header)} />
    </div>
  );
}
