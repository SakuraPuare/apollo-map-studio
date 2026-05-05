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

import type { SourceRectInfo } from '@/types/apollo';
import { getSourceRect } from '@/types/apollo';
import type { GeoPoint, MapEntity } from '@/types/entities';

export type EditorGeometryKind = 'LINESTRING' | 'POLYGON';

export interface EditorEntityMeta {
  /** Forces editor to render points as polyline vs closed polygon. */
  geometryKind?: EditorGeometryKind;
  /** Restores rotated-rectangle edit semantics for polygon-backed entities. */
  sourceRect?: SourceRectInfo;
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
  source_rect?: SourceRectWire;
}

interface SourceRectWire {
  p1?: PointWire;
  p2?: PointWire;
  rotation?: number;
}

interface PointWire {
  x?: number;
  y?: number;
  z?: number;
}

const KIND_TO_NUM: Record<EditorGeometryKind, number> = {
  LINESTRING: 1,
  POLYGON: 2,
};

const NUM_TO_KIND: Record<number, EditorGeometryKind> = {
  1: 'LINESTRING',
  2: 'POLYGON',
};

const SOURCE_RECT_ENTITY_TYPES = new Set([
  'area',
  'clearArea',
  'crosswalk',
  'junction',
  'parkingSpace',
  'pncJunction',
]);

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
    entity: Object.fromEntries(
      Object.entries(meta.entity)
        .filter(([, v]) => !isEmptyEntityMeta(v))
        .map(([k, v]) => [k, encodeEntity(v)]),
    ),
  };
  rawMap.editor_meta = wire;
}

export function entityKey(entityType: string, id: string): string {
  return `${entityType}:${id}`;
}

export function writeSourceRectsToEditorMeta(
  rawMap: Record<string, unknown>,
  entities: readonly MapEntity[],
): void {
  const meta = readEditorMeta(rawMap);
  for (const entityMeta of Object.values(meta.entity)) {
    delete entityMeta.sourceRect;
  }

  for (const entity of entities) {
    const sourceRect = getSourceRect(entity);
    if (!sourceRect) continue;
    const key = entityKey(entity.entityType, entity.id);
    meta.entity[key] = {
      ...meta.entity[key],
      sourceRect: cloneSourceRect(sourceRect),
    };
  }

  writeEditorMeta(rawMap, meta);
}

export function hydrateSourceRectsFromEditorMeta(
  rawMap: Record<string, unknown>,
  entities: readonly MapEntity[],
): MapEntity[] {
  const meta = readEditorMeta(rawMap);
  return entities.map((entity) => {
    const sourceRect = meta.entity[entityKey(entity.entityType, entity.id)]?.sourceRect;
    if (!sourceRect || !canHydrateSourceRect(entity)) return entity;
    return { ...entity, _sourceRect: cloneSourceRect(sourceRect) } as MapEntity;
  });
}

function decodeEntity(raw: EditorEntityMetaWire): EditorEntityMeta {
  const out: EditorEntityMeta = {};
  if (raw.geometry_kind !== undefined && raw.geometry_kind in NUM_TO_KIND) {
    out.geometryKind = NUM_TO_KIND[raw.geometry_kind];
  }
  const sourceRect = decodeSourceRect(raw.source_rect);
  if (sourceRect) out.sourceRect = sourceRect;
  return out;
}

function encodeEntity(meta: EditorEntityMeta): EditorEntityMetaWire {
  const out: EditorEntityMetaWire = {};
  if (meta.geometryKind) out.geometry_kind = KIND_TO_NUM[meta.geometryKind];
  if (meta.sourceRect) out.source_rect = encodeSourceRect(meta.sourceRect);
  return out;
}

function canHydrateSourceRect(entity: MapEntity): boolean {
  return SOURCE_RECT_ENTITY_TYPES.has(entity.entityType) && 'polygon' in entity;
}

function isEmptyEntityMeta(meta: EditorEntityMeta): boolean {
  return meta.geometryKind === undefined && meta.sourceRect === undefined;
}

function decodeSourceRect(raw: SourceRectWire | undefined): SourceRectInfo | undefined {
  if (!raw || typeof raw.rotation !== 'number') return undefined;
  const p1 = decodePoint(raw.p1);
  const p2 = decodePoint(raw.p2);
  if (!p1 || !p2) return undefined;
  return { p1, p2, rotation: raw.rotation };
}

function encodeSourceRect(sourceRect: SourceRectInfo): SourceRectWire {
  return {
    p1: encodePoint(sourceRect.p1),
    p2: encodePoint(sourceRect.p2),
    rotation: sourceRect.rotation,
  };
}

function decodePoint(raw: PointWire | undefined): GeoPoint | undefined {
  if (!raw || typeof raw.x !== 'number' || typeof raw.y !== 'number') return undefined;
  return typeof raw.z === 'number' ? { x: raw.x, y: raw.y, z: raw.z } : { x: raw.x, y: raw.y };
}

function encodePoint(point: GeoPoint): PointWire {
  return point.z === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, z: point.z };
}

function cloneSourceRect(sourceRect: SourceRectInfo): SourceRectInfo {
  return {
    p1: clonePoint(sourceRect.p1),
    p2: clonePoint(sourceRect.p2),
    rotation: sourceRect.rotation,
  };
}

function clonePoint(point: GeoPoint): GeoPoint {
  return point.z === undefined
    ? { x: point.x, y: point.y }
    : { x: point.x, y: point.y, z: point.z };
}
