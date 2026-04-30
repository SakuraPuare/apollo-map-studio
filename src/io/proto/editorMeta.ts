/**
 * Typed accessors for `Map.editor_meta` — the Apollo Map Studio
 * editor-only metadata that lives inside the Apollo `.bin` (proto field
 * number 1000 on `Map`). See `src/proto/editor/editor_meta.proto`.
 *
 * Apollo runtime tooling treats `editor_meta` as an unknown field and,
 * per proto2 default, preserves it on round-trip — so the same `.bin`
 * is consumed by both the editor and production Apollo without a
 * sidecar file.
 */

export type EditorGeometryKind = 'LINESTRING' | 'POLYGON';

export interface EditorEntityMeta {
  /** Forces editor to render points as polyline vs closed polygon. */
  geometryKind?: EditorGeometryKind;
}

export interface EditorMeta {
  /** Schema revision; bump on non-additive changes. */
  version: number;
  /** Per-entity overrides keyed by `<entityType>:<id>`. */
  entity: Record<string, EditorEntityMeta>;
}

export const EDITOR_META_VERSION = 1;

/** Wire format on `Map.editor_meta` — uses snake_case + numeric enums to
 *  match `keepCase: true` and the protobufjs encoder's expectations. */
interface EditorMetaWire {
  version?: number;
  entity?: Record<string, EditorEntityMetaWire>;
}

interface EditorEntityMetaWire {
  geometry_kind?: number;
}

const KIND_TO_NUM: Record<EditorGeometryKind, number> = {
  LINESTRING: 1,
  POLYGON: 2,
};

const NUM_TO_KIND: Record<number, EditorGeometryKind> = {
  1: 'LINESTRING',
  2: 'POLYGON',
};

export function readEditorMeta(rawMap: Record<string, unknown>): EditorMeta {
  const wire = rawMap.editor_meta as EditorMetaWire | undefined;
  const entity: Record<string, EditorEntityMeta> = {};
  if (wire?.entity) {
    for (const [key, raw] of Object.entries(wire.entity)) {
      entity[key] = decodeEntity(raw);
    }
  }
  return { version: wire?.version ?? EDITOR_META_VERSION, entity };
}

export function writeEditorMeta(rawMap: Record<string, unknown>, meta: EditorMeta): void {
  const wire: EditorMetaWire = {
    version: meta.version,
    entity: Object.fromEntries(Object.entries(meta.entity).map(([k, v]) => [k, encodeEntity(v)])),
  };
  rawMap.editor_meta = wire;
}

export function entityKey(entityType: string, id: string): string {
  return `${entityType}:${id}`;
}

function decodeEntity(raw: EditorEntityMetaWire): EditorEntityMeta {
  const out: EditorEntityMeta = {};
  if (raw.geometry_kind !== undefined && raw.geometry_kind in NUM_TO_KIND) {
    out.geometryKind = NUM_TO_KIND[raw.geometry_kind];
  }
  return out;
}

function encodeEntity(meta: EditorEntityMeta): EditorEntityMetaWire {
  const out: EditorEntityMetaWire = {};
  if (meta.geometryKind) out.geometry_kind = KIND_TO_NUM[meta.geometryKind];
  return out;
}
